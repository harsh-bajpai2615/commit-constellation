// Resolve whatever the user typed into a local git directory we can run `git log` against.
//
// Three accepted shapes:
//   /abs/path/to/repo      an existing checkout on this machine
//   owner/name             GitHub shorthand
//   https://github.com/... a full URL (github, gitlab, anything git can clone)
//
// Remote repos are bare-cloned with --filter=blob:none, which pulls the full commit
// history but none of the file contents. That is everything we need and it keeps even
// large repos to a few seconds on venue wifi.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, 'cache')

const GITHUB_SHORTHAND = /^[\w.-]+\/[\w.-]+$/

export function classify(src) {
  const s = src.trim().replace(/\/+$/, '')
  if (s.startsWith('/') || s.startsWith('~') || s.startsWith('.')) return { kind: 'local', src: s }
  if (GITHUB_SHORTHAND.test(s)) return { kind: 'remote', src: `https://github.com/${s}.git`, slug: s }
  if (/^(https?|git|ssh):\/\//.test(s) || s.startsWith('git@')) {
    const slug = s.replace(/^.*[/:]([\w.-]+\/[\w.-]+?)(\.git)?$/, '$1')
    return { kind: 'remote', src: s.endsWith('.git') ? s : `${s}.git`, slug }
  }
  throw new Error(`Cannot tell what "${src}" is. Try owner/name, a git URL, or an absolute path.`)
}

// A bare clone has no working tree, so `git log` needs no --git-dir gymnastics:
// we just run with cwd set to the bare dir and git figures it out.
export async function resolveRepo(src, { onProgress } = {}) {
  const target = classify(src)

  if (target.kind === 'local') {
    const dir = target.src.replace(/^~/, process.env.HOME)
    if (!existsSync(path.join(dir, '.git')) && !existsSync(path.join(dir, 'HEAD'))) {
      throw new Error(`${dir} is not a git repository.`)
    }
    return { dir, name: path.basename(dir), origin: null }
  }

  await mkdir(CACHE, { recursive: true })
  const dir = path.join(CACHE, `${target.slug.replace(/\//g, '__')}.git`)

  if (existsSync(dir)) {
    onProgress?.('cached')
    return { dir, name: target.slug, origin: target.src }
  }

  onProgress?.('cloning')
  try {
    await exec('git', [
      'clone', '--bare', '--filter=blob:none', '--no-tags',
      target.src, dir,
    ], {
      timeout: 120_000,
      maxBuffer: 1 << 26,
      // Without this a private or misspelled repo makes git sit waiting for a username on
      // a terminal nobody is watching, and the request hangs until the timeout instead of
      // failing. Mid-demo that is indistinguishable from the app being broken.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
    })
  } catch (err) {
    throw new Error(cloneFailure(err, target.slug))
  }

  return { dir, name: target.slug, origin: target.src }
}

// git's own failure text is a five-line dump that repeats the whole command, including
// absolute paths on this machine. Putting that on a projector is both unreadable and a
// small privacy leak, so translate the handful of failures that actually happen and say
// what the person should do about it.
function cloneFailure(err, slug) {
  const text = `${err.stderr || ''}${err.message || ''}`

  if (err.killed || /ETIMEDOUT|timed out/i.test(text)) {
    return `Timed out cloning ${slug}. It may be very large — try a smaller repo.`
  }
  if (/could not resolve host|could not read from remote|network is unreachable|connection refused/i.test(text)) {
    return `Can't reach the network. Warmed repos still work offline.`
  }
  if (/repository not found|not found|does not exist/i.test(text)) {
    return `No repository called ${slug}. Check the spelling.`
  }
  if (/authentication failed|terminal prompts disabled|permission denied|access denied/i.test(text)) {
    return `${slug} is private, so its history can't be read.`
  }
  if (/empty repository/i.test(text)) {
    return `${slug} has no commits yet.`
  }
  return `Couldn't clone ${slug}.`
}

// Record and field separators, written as escapes so the source stays plain ASCII.
// NUL starts each commit block; UNIT separates the fields of its header line.
// Neither character can occur in a commit subject, so parsing never has to guess.
const NUL = '\u0000'
const UNIT = '\u001f'

// One `git log` call gives us who, when, what subject, and which files each commit touched.
//
// Two flags here are load-bearing, and both were learned the hard way:
//
//   --name-only  not --numstat. Counting changed *lines* requires the file contents, which
//                a --filter=blob:none clone does not have, so git falls back to fetching
//                every blob from the remote one at a time. On a small repo that took 51
//                seconds and then died. --name-only needs only trees, which we do have.
//
//   --no-renames rename detection compares contents to guess that a/x became b/y, so it
//                reaches for blobs too and reintroduces exactly the same stall.
//
// GIT_NO_LAZY_FETCH is the belt to that braces: if some future change ever does ask for a
// missing object, git fails in milliseconds instead of silently hanging mid-demo.
export async function gitLog(dir, { limit = 2000 } = {}) {
  const { stdout } = await exec('git', [
    'log',
    '--no-merges',
    '--no-renames',
    `--max-count=${limit}`,
    '--name-only',
    // The format string cannot carry NUL/UNIT directly: argv is NUL-terminated, so a
    // literal NUL would truncate the argument and we would parse exactly one commit.
    // git expands its own %x00 / %x1f escapes into those bytes on the way out.
    '--pretty=format:%x00%H%x1f%an%x1f%aI%x1f%s',
  ], {
    cwd: dir,
    timeout: 120_000,
    maxBuffer: 1 << 28,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
  })

  const commits = []
  for (const chunk of stdout.split(NUL)) {
    if (!chunk.trim()) continue
    const [header, ...lines] = chunk.split('\n')
    const [sha, author, iso, ...subjectParts] = header.split(UNIT)
    if (!sha) continue

    // --name-only gives one bare path per line.
    const files = lines.map((l) => l.trim()).filter(Boolean)

    commits.push({
      sha,
      author: author || 'unknown',
      date: new Date(iso),
      subject: subjectParts.join(UNIT) || '',
      files,
    })
  }

  return commits
}
