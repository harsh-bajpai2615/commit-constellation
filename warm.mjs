// Pre-clone a set of repos so nothing hits the network during a demo.
//
//   node warm.mjs                     the default demo set
//   node warm.mjs facebook/react ...  plus whatever you name
//
// Run this on a good connection before you leave. A warmed repo plots in ~100ms; a cold
// one needs a clone, and venue wifi is exactly where that goes wrong.

import { resolveRepo, gitLog } from './lib/repo.mjs'
import { analyze } from './lib/analyze.mjs'
import { read } from './lib/read.mjs'

// Chosen to look different from each other on screen: a huge many-author project, a
// tight single-author library, a monorepo, a famously old codebase.
const DEFAULTS = [
  'expressjs/express',
  'sindresorhus/slugify',
  'vuejs/core',
  'sveltejs/svelte',
  'tiangolo/fastapi',
  'jquery/jquery',
]

const targets = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS
let ok = 0

for (const src of targets) {
  const started = Date.now()
  try {
    const repo = await resolveRepo(src, {
      onProgress: (s) => process.stdout.write(`  ${src.padEnd(26)} ${s}… `),
    })
    const data = analyze(await gitLog(repo.dir), { name: repo.name })
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    console.log(`\n  ${src.padEnd(26)} ${String(data.counts.commits).padStart(5)} commits  ${secs}s`)
    console.log(`  ${''.padEnd(26)} ${read(data)}\n`)
    ok += 1
  } catch (err) {
    console.log(`\n  ${src.padEnd(26)} FAILED: ${err.message}\n`)
  }
}

console.log(`  ${ok}/${targets.length} warmed.`)
process.exit(ok === targets.length ? 0 : 1)
