// Zero-dependency server. Nothing to npm install, which is the whole point: this has to
// come up on venue wifi, or on no wifi at all.
//
//   node server.mjs            -> http://localhost:4173
//   PORT=8080 node server.mjs

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveRepo, gitLog } from './lib/repo.mjs'
import { analyze } from './lib/analyze.mjs'
import { read } from './lib/read.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(ROOT, 'public')
const PORT = Number(process.env.PORT || 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

// One in-process cache. A repo shown once during a demo is usually shown again.
//
// It expires, because without a TTL a repo analysed once is frozen for the life of the
// process: push a commit, plot it again, and you get the old sky with no way to tell.
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (url.pathname === '/api/constellation') {
    return api(url, res)
  }

  // Static files. Resolve first, then confirm the result is still inside public/, so a
  // path like /../../.ssh/id_rsa cannot escape the directory.
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  const file = path.resolve(PUBLIC, rel)
  if (!file.startsWith(PUBLIC + path.sep) || !existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('not found')
  }

  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      // No caching. Editing style.css and reloading has to actually show the edit --
      // a stale stylesheet served from cache once cost an hour of chasing a bug that
      // had already been fixed.
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end(String(err.message))
  }
})

async function api(url, res) {
  const src = url.searchParams.get('src')
  const json = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }

  if (!src) return json(400, { error: 'Pass ?src=owner/name or a path.' })

  const started = Date.now()

  // Re-time on the way out. The cached object carries the duration of the *original*
  // clone, so serving it unchanged makes an instant cache hit report 0.3s on screen --
  // a number that is simply not true.
  const hit = cache.get(src)
  if (hit && started - hit.at < CACHE_TTL) {
    return json(200, { ...hit.data, tookMs: Date.now() - started })
  }
  try {
    const repo = await resolveRepo(src)
    const commits = await gitLog(repo.dir)
    const data = analyze(commits, { name: repo.name })
    data.read = read(data)
    data.origin = repo.origin
    data.tookMs = Date.now() - started

    cache.set(src, { at: Date.now(), data })
    console.log(`  ${src} -> ${data.counts.commits} commits, ${data.stars.length} stars, ${data.tookMs}ms`)
    json(200, data)
  } catch (err) {
    console.error(`  ${src} -> ${err.message}`)
    json(400, { error: err.message })
  }
}

server.listen(PORT, () => {
  console.log(`\n  Commit Constellation`)
  console.log(`  http://localhost:${PORT}\n`)
})
