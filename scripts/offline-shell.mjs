import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = process.argv[2] || 'dist/build/h5'
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : path
  }))
  return paths.flat()
}

const paths = (await files(root)).filter(path => !path.endsWith('book-sw.js')).sort()
const hash = createHash('sha256')
for (const path of paths) hash.update(path).update(await readFile(path))
const urls = paths.map(path => './' + relative(root, path).replaceAll('\\', '/'))
await writeFile(join(root, 'book-sw.js'), `
const prefix = 'book-shell:' + self.registration.scope + ':'
const name = prefix + '${hash.digest('hex').slice(0, 16)}'
const assets = ${JSON.stringify(urls)}
self.addEventListener('install', event => event.waitUntil(
  caches.open(name).then(cache => cache.addAll(assets)).then(() => self.skipWaiting())
))
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== name).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
))
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const local = assets.some(path => new URL(path, self.registration.scope).href === event.request.url)
  if (event.request.mode === 'navigate' && event.request.url.startsWith(self.registration.scope)) {
    event.respondWith(fetch(event.request).catch(() => caches.open(name).then(cache => cache.match('./index.html'))))
  } else if (local) {
    event.respondWith(caches.open(name).then(cache => cache.match(event.request)).then(hit => hit || fetch(event.request)))
  }
})
`)
