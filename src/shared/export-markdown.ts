import type { BookNode, NoteBlock } from './types'
import { blocksOf, parseContent } from './types'
import { formatDuration } from './media'

/** 树索引：按父节点分组，导出时一次构建反复使用。 */
function childrenIndex(tree: BookNode[]) {
  const groups = new Map<string, BookNode[]>()
  for (const node of tree) {
    const key = node.parentId || ''
    const group = groups.get(key) || []
    group.push(node)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }
  return groups
}

/** 时间显示为 `YYYY-MM-DD HH:mm`。 */
function timeText(node: BookNode) {
  const time = node.createdAt || node.updatedAt || ''
  return time ? time.slice(0, 16).replace('T', ' ') : ''
}

/** 把单个块渲染成 Markdown。 */
function blockMarkdown(block: NoteBlock): string {
  switch (block.type) {
    case 'text':
      return block.text || ''
    case 'quote': {
      const quoted = (block.text || '').split('\n').map(line => '> ' + line).join('\n')
      return block.page ? `${quoted}\n>\n> ——第 ${block.page} 页` : quoted
    }
    case 'image':
      return block.url ? `![${block.caption || '图片'}](${block.url})` : `（图片：${block.caption || '未上传'}）`
    case 'audio':
      return block.url
        ? `[语音 ${formatDuration(block.duration)}](${block.url})`
        : `（语音 ${formatDuration(block.duration)}）`
    default:
      return ''
  }
}

/** 书本 Markdown：书目信息 + 每条感悟（正文块 + 备注树）。 */
export function bookMarkdown(book: BookNode, tree: BookNode[]): string {
  const groups = childrenIndex(tree)
  const content = parseContent(book)
  const lines: string[] = [`# ${book.title}`, '']

  const info = [
    content.author ? `作者：${content.author}` : '',
    content.translator ? `译者：${content.translator}` : '',
    content.publisher ? `出版社：${content.publisher}` : '',
    content.year ? `出版年：${content.year}` : '',
    content.pages ? `页数：${content.pages}` : '',
    content.isbn ? `ISBN：${content.isbn}` : ''
  ].filter(Boolean)
  if (info.length) lines.push(info.join('  \n'), '')
  if (content.intro || content.text) lines.push(`> ${(content.intro || content.text || '').trim()}`, '')

  const notes = groups.get(book.id) || []
  for (const note of notes) {
    const noteContent = parseContent(note)
    lines.push(`## ${note.title}`, '')
    const meta = [timeText(note), noteContent.chapter].filter(Boolean).join(' · ')
    if (meta) lines.push(`*${meta}*`, '')
    for (const block of blocksOf(note)) {
      const text = blockMarkdown(block)
      if (text) lines.push(text, '')
    }
    appendRemarks(lines, groups, note.id, 3)
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** 递归渲染备注树：统一一级标题下的引用块，最多 8 层。 */
function appendRemarks(lines: string[], groups: Map<string, BookNode[]>, parentId: string, depth: number) {
  if (depth > 8) return
  const remarks = (groups.get(parentId) || []).filter(node => node.nodeType === 'remark')
  if (!remarks.length) return
  if (depth === 3) lines.push('### 备注', '')
  for (const remark of remarks) {
    const indent = '  '.repeat(depth - 3)
    lines.push(`${indent}- **${timeText(remark)}** ${parseContent(remark).text || remark.title}`)
    appendRemarks(lines, groups, remark.id, depth + 1)
  }
  if (depth === 3) lines.push('')
}

/** 单条感悟 Markdown：正文块 + 直接备注。 */
export function noteMarkdown(note: BookNode, book: BookNode | undefined, tree: BookNode[]): string {
  const groups = childrenIndex(tree)
  const content = parseContent(note)
  const lines: string[] = [`# ${note.title}`, '']
  const meta = [book ? `《${book.title}》` : '', timeText(note), content.chapter].filter(Boolean).join(' · ')
  if (meta) lines.push(`*${meta}*`, '')
  for (const block of blocksOf(note)) {
    const text = blockMarkdown(block)
    if (text) lines.push(text, '')
  }
  appendRemarks(lines, groups, note.id, 3)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * 保存 Markdown 文件。
 * H5 用 Blob 下载；App 写入私有目录后调用系统分享。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// plus.android 与 java.* 由 App 运行时注入，@dcloudio/types 未覆盖，统一按 any 使用

export function saveMarkdown(fileName: string, markdown: string) {
  // #ifdef H5
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'book/' + fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  // #endif
  // #ifdef APP-PLUS
  saveToPublicDownload(fileName, markdown)
  // #endif
}

/**
 * App 端把 Markdown 写入**公共** Download/book/。
 *
 * <p>目标：{@code /storage/emulated/0/Download/book/<文件名>}，与 {@code Android/} 同级。</p>
 *
 * <p>注意 {@code plus.io} 的 {@code _downloads/} 在 Android 10+ 会被重定向到
 * 应用私有沙箱（{@code Android/data/<包名>/downloads/}），不满足需求；
 * 因此通过 {@code plus.android} 调系统 MediaStore 插入 Download 集合，
 * 这是分区存储下的标准做法。</p>
 */
function saveToPublicDownload(fileName: string, markdown: string) {
  const plusAny = plus as any
  try {
    const main = plusAny.android.runtimeMainActivity()
    const Build = plusAny.android.importClass('android.os.Build')
    if (Build.VERSION.SDK_INT < 29) {
      writeToLegacyDownload(fileName, markdown)
      return
    }
    const ContentValues = plusAny.android.importClass('android.content.ContentValues')
    const MediaStore = plusAny.android.importClass('android.provider.MediaStore')
    const Downloads = MediaStore.Downloads

    const values = new ContentValues()
    values.put(Downloads.DISPLAY_NAME, fileName)
    values.put(Downloads.MIME_TYPE, 'text/markdown')
    values.put(Downloads.RELATIVE_PATH, 'Download/book')

    const resolver = main.getContentResolver()
    plusAny.android.importClass(resolver)
    const uri = resolver.insert(Downloads.EXTERNAL_CONTENT_URI, values)
    if (!uri) {
      fallbackExport(fileName, markdown)
      return
    }
    const stream = resolver.openOutputStream(uri)
    plusAny.android.importClass(stream)
    // 用 Java 的 write(byte[]) 写入 UTF-8 字节
    const bytes = plusAny.android.invoke(
      plusAny.android.importClass('java.lang.String'),
      'valueOf', markdown
    )
    void bytes
    const utf8 = toUtf8Bytes(markdown)
    stream.write(utf8)
    stream.flush()
    stream.close()
    uni.showToast({ title: '已导出到 Download/book/' + fileName, icon: 'none', duration: 3000 })
  } catch {
    fallbackExport(fileName, markdown)
  }
}

/**
 * 把字符串转成 Java 字节数组（UTF-8）。
 *
 * <p>不走全局 {@code java}：改为通过 {@code plus.android.importClass} 获取类，
 * 再用 {@code invoke} 调 {@code getBytes}，避免不同基座版本全局对象可用性差异。</p>
 */
function toUtf8Bytes(text: string) {
  const plusAny = plus as any
  const StringClass = plusAny.android.importClass('java.lang.String')
  const instance = plusAny.android.invoke(StringClass, 'valueOf', text)
  plusAny.android.importClass(instance)
  return instance.getBytes('UTF-8')
}

/** Android 9 及以下：直接写外部存储的 Download/book。 */
function writeToLegacyDownload(fileName: string, markdown: string) {
  const plusAny = plus as any
  try {
    const Environment = plusAny.android.importClass('android.os.Environment')
    const File = plusAny.android.importClass('java.io.File')
    const FileOutputStream = plusAny.android.importClass('java.io.FileOutputStream')
    const root = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    const bookDir = new File(root, 'book')
    if (!bookDir.exists()) {
      bookDir.mkdirs()
    }
    const target = new File(bookDir, fileName)
    const stream = new FileOutputStream(target)
    plusAny.android.importClass(stream)
    stream.write(toUtf8Bytes(markdown))
    stream.flush()
    stream.close()
    uni.showToast({ title: '已导出到 ' + target.getAbsolutePath(), icon: 'none', duration: 3000 })
  } catch {
    fallbackExport(fileName, markdown)
  }
}

/**
 * 写入失败时的兜底：保存到应用私有目录，保证内容不丢。
 *
 * <p>用 {@code plus.io} 的 {@code _doc/}，并明确提示实际路径，
 * 不假装写到了公共目录。</p>
 */
function fallbackExport(fileName: string, markdown: string) {
  plus.io.resolveLocalFileSystemURL('_doc/', entry => {
    entry.getFile(fileName, { create: true }, file => {
      file.createWriter(writer => {
        writer.onwrite = () => {
          const path = plus.io.convertLocalFileSystemURL('_doc/' + fileName)
          uni.showToast({ title: '导出到公共目录失败，已存到 ' + path, icon: 'none', duration: 3500 })
        }
        writer.onerror = () => uni.showToast({ title: '导出失败', icon: 'none' })
        writer.write(markdown)
      }, () => uni.showToast({ title: '导出失败', icon: 'none' }))
    }, () => uni.showToast({ title: '导出失败', icon: 'none' }))
  }, () => uni.showToast({ title: '导出失败', icon: 'none' }))
}
