#!/usr/bin/env node
import AdmZip from 'adm-zip'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const appId = '__UNI__B006001'
const appKey = 'book'
const { values } = parseArgs({
  options: {
    publish: { type: 'boolean' },
    'write-back': { type: 'boolean' },
    'version-name': { type: 'string' },
    'version-code': { type: 'string' },
    notes: { type: 'string' },
    help: { type: 'boolean', short: 'h' }
  }
})

/** 将 App 构建目录打为 WGT，保留原生安装器需要的目录条目。 */
async function addEntries(zip, directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix + entry.name
    if (entry.isDirectory()) {
      zip.addFile(relative + '/', Buffer.alloc(0))
      await addEntries(zip, join(directory, entry.name), relative + '/')
    } else if (entry.isFile() && relative !== 'manifest.json') {
      zip.addFile(relative, await readFile(join(directory, entry.name)))
    } else if (entry.isSymbolicLink()) {
      throw new Error('App 构建目录中出现符号链接：' + relative)
    }
  }
}

/** 调用读书笔记渠道接口，查询及发布响应须带有对应的渠道标识。 */
async function releaseRequest(base, endpoint, init) {
  const response = await fetch(base + '/app/version/' + endpoint + '?appKey=' + appKey, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(endpoint === 'polish-log' ? 30_000 : 90_000)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.code !== 200) {
    throw new Error('版本接口请求失败（HTTP ' + response.status + '）' + (result.msg ? ' ' + result.msg : ''))
  }
  if (endpoint !== 'polish-log' && result.data?.appKey !== appKey) {
    throw new Error('服务端尚未启用读书笔记发布渠道')
  }
  return result.data
}

/** 逐段比较构建和线上版本名称，递增较高版本的补丁号。 */
function bumpVersionName(sourceName, latestName, fallbackName) {
  const pattern = /^(\d+)\.(\d+)\.(\d+)$/
  const source = pattern.exec(sourceName)
  const latest = latestName ? pattern.exec(latestName) : null
  // 有特殊版本名称时沿用原先的基准选择，必要时由发布参数指定名称。
  let parts = pattern.exec(fallbackName)
  if (source && latest) {
    parts = source
    for (let index = 1; index <= 3; index++) {
      const difference = BigInt(source[index]) - BigInt(latest[index])
      if (difference === 0n) continue
      parts = difference > 0n ? source : latest
      break
    }
  }
  if (!parts) throw new Error('请用 --version-name 指定本次版本名称')
  return parts[1] + '.' + parts[2] + '.' + (BigInt(parts[3]) + 1n)
}

/** 提取上次自动发版以来的提交标题，用作更新说明。 */
function collectReleaseNotes() {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    const lastRelease = git(['log', '--first-parent', '-1', '--format=%H', '--grep=^chore: 自动同步读书笔记版本 '])
    const range = lastRelease ? lastRelease + '..HEAD' : 'HEAD'
    const subjects = git(['log', '--no-merges', '-15', '--format=%s', range])
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.includes('[skip ci]'))
    return [...new Set(subjects)].join('\n').slice(0, 2000)
  } catch {
    return ''
  }
}

/** 优先使用手工说明。AI 润色不可用时，继续使用提交摘要发布。 */
async function resolveReleaseNotes(base, token, versionName, versionCode) {
  const notes = values.notes?.trim()
  if (notes) return notes

  const source = collectReleaseNotes()
  if (!source) return '读书笔记 ' + versionName
  try {
    const polished = await releaseRequest(base, 'polish-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Publish-Token': token },
      body: JSON.stringify({ versionName, versionCode, source })
    })
    if (typeof polished === 'string' && polished.trim()) return polished.trim()
    console.warn('日志润色未返回有效内容，使用原始提交摘要')
  } catch (error) {
    console.warn('日志润色失败，使用原始提交摘要：' + error.message)
  }
  return source
}

/** 预先校验并替换源码版本字段，保留 uni-app 配置文件里的注释及排版。 */
async function prepareSourceVersion(versionName, versionCode) {
  const path = resolve(root, 'src/manifest.json')
  const source = await readFile(path, 'utf8')
  const namePattern = /^([ \t]*"versionName"[ \t]*:[ \t]*)"[^"\r\n]*"/m
  const codePattern = /^([ \t]*"versionCode"[ \t]*:[ \t]*)("?)[0-9]+\2(?=[ \t]*,)/m
  if (!namePattern.test(source) || !codePattern.test(source)) {
    throw new Error('无法定位 src/manifest.json 的版本字段')
  }
  const updated = source
    .replace(namePattern, (_, prefix) => prefix + JSON.stringify(versionName))
    .replace(codePattern, (_, prefix, quote) => prefix + quote + versionCode + quote)
  return { path, updated }
}

/** 校验构建版本，按需发布并保留带摘要的本地产物。 */
async function main() {
  if (values.help) {
    console.log('npm run build:wgt -- [--version-name 1.0.1] [--version-code 101]')
    console.log('npm run publish:wgt -- [--notes "更新说明"] [--write-back]，使用环境变量 BOOK_PUBLISH_TOKEN')
    return
  }
  if (values['write-back'] && !values.publish) throw new Error('--write-back 须与 --publish 一起使用')
  const input = resolve(root, 'dist/build/app')
  const manifest = JSON.parse(await readFile(join(input, 'manifest.json'), 'utf8'))
  const sourceCode = Number(manifest.version?.code)
  const sourceName = manifest.version?.name
  if (manifest.id !== appId || !sourceName || !Number.isSafeInteger(sourceCode) || sourceCode < 1) {
    throw new Error('请先构建读书笔记 App，确认应用标识和版本配置正确')
  }
  let latest
  let base
  const token = process.env.BOOK_PUBLISH_TOKEN?.trim()
  if (values.publish) {
    if (!token) throw new Error('请设置 BOOK_PUBLISH_TOKEN')
    let releaseApi = process.env.BOOK_RELEASE_API?.trim()
    if (!releaseApi) {
      const productionEnv = await readFile(join(root, '.env.production'), 'utf8')
      releaseApi = productionEnv.match(/^VITE_APP_BASE_API=(.+)$/m)?.[1].trim()
    }
    if (!releaseApi) throw new Error('请设置 BOOK_RELEASE_API 或生产环境的 VITE_APP_BASE_API')
    const url = new URL(releaseApi)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('发布 API 必须是没有凭证、查询或片段的 HTTPS 地址')
    }
    base = url.href.replace(/\/$/, '')
    latest = await releaseRequest(base, 'check')
  }

  const latestCode = Number(latest?.versionCode ?? 0)
  if (!Number.isSafeInteger(latestCode) || latestCode < 0) throw new Error('线上版本序号无效')
  const floor = Math.max(sourceCode, latestCode)
  const versionCode = Number(values['version-code'] ?? (values.publish ? floor + 1 : sourceCode))
  const latestName = latest?.versionName
  const fallbackName = latestCode >= sourceCode && latestName ? latestName : sourceName
  const versionName = values['version-name'] ?? (values.publish
    ? bumpVersionName(sourceName, latestName, fallbackName) : sourceName)
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2_147_483_647
      || (values.publish && versionCode <= floor)) {
    throw new Error('发布序号须为正整数，且高于构建版本及已发布版本')
  }
  if (!/^[\w][\w.+-]{0,31}$/.test(versionName)) throw new Error('版本名称格式不正确')
  if (values.notes?.length > 2000) throw new Error('更新说明最多 2000 字')
  const sourceVersion = values['write-back'] ? await prepareSourceVersion(versionName, versionCode) : undefined

  manifest.version = { ...manifest.version, name: versionName, code: versionCode }
  if (manifest.plus) delete manifest.plus.distribute
  if (manifest.permissions) delete manifest.permissions.Push
  const zip = new AdmZip()
  await addEntries(zip, input)
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)))
  const bytes = zip.toBuffer()
  const packaged = new AdmZip(bytes)
  if (!packaged.test()) throw new Error('WGT 校验失败')
  for (const required of ['manifest.json', 'app-service.js', 'static/covers/book/cover-1.svg']) {
    if (!packaged.getEntry(required)) throw new Error('WGT 缺少文件：' + required)
  }
  const output = resolve(root, 'dist/release/wgt')
  await mkdir(output, { recursive: true })
  const fileName = appId + '-' + versionCode + '.wgt'
  await writeFile(join(output, fileName), bytes)
  const metadata = {
    appKey, appId, versionName, versionCode, fileName, fileSize: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  }
  await writeFile(join(output, appId + '-' + versionCode + '.json'), JSON.stringify(metadata, null, 2) + '\n')
  console.log('WGT 已打包 ' + join(output, fileName))
  if (!values.publish) return

  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'application/zip' }), fileName)
  form.append('versionName', versionName)
  form.append('versionCode', String(versionCode))
  form.append('updateLog', await resolveReleaseNotes(base, token, versionName, versionCode))
  const published = await releaseRequest(base, 'publish', { method: 'POST', headers: { 'X-Publish-Token': token }, body: form })
  if (published.versionName !== versionName || Number(published.versionCode) !== versionCode) {
    throw new Error('已发布版本与本地产物不一致')
  }
  console.log('读书笔记 WGT 已发布 ' + versionName + ' (' + versionCode + ')')
  if (sourceVersion) {
    await writeFile(sourceVersion.path, sourceVersion.updated, 'utf8')
    console.log('已同步源码版本号')
  }
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `version_name=${versionName}\nversion_code=${versionCode}\n`)
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
