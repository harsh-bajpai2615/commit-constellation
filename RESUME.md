# Commit Constellation

Point it at any git repo. It reads the commit history and draws the repo as a night sky:
every file is a star sized by how often it changes, and a line between two stars means
those files keep changing in the same commit — the seams of the codebase, the things that
cannot move alone. Same repo always renders the same sky.

Built for the **Mumbai Claude Fable 5.1 Build Day**, 23 Sep 2026 — *Delight* track.

---

## ⏭ PICK UP HERE

The scaffold is **done and verified**. Everything below already works; the build-day
work is the one item in *Next*.

```bash
cd ~/commit-constellation
node server.mjs                 # http://localhost:4173
```

Type `expressjs/express`, or `sveltejs/svelte`, or a path like `~/cliptrip-backend`.

**Next (this is the four hours at the venue):** the caption under the picture is
currently written by `lib/read.mjs`, a hand-rolled template that picks the two
strongest facts and stitches them into a sentence. It is honest but flat —
*"2,000 commits across 307 files — half of it from a single pair of hands."*

Replace it with a Claude call that gets the same `traits` object and writes a real
sentence about the repo's character. Keep `lib/read.mjs` as the offline fallback and
fall back to it on any API error, because the venue wifi will be shared by 80 people
and a dead caption mid-demo is worse than a flat one.

That is also what the $100 in API credits is for.

---

## What works

| | |
|---|---|
| Local repos | `~/cliptrip-backend`, any absolute path |
| Remote repos | `owner/name`, or any git URL |
| Cold clone | express (2,000 commits, 306 authors) in **3.1s** |
| Warm repo | **~100ms** |
| Determinism | two renders of the same repo are **byte-identical** (verified) |
| Dependencies | **none** — plain `node:http`, p5 vendored in `public/vendor/` |
| Offline | works fully on already-warmed repos and any local repo |

```bash
node warm.mjs        # pre-clone the demo set — 6/6 warmed, do this before leaving
node warm.mjs a/b    # warm specific repos
```

## Layout

```
server.mjs        zero-dep http server + /api/constellation
warm.mjs          pre-clone repos so nothing clones cold on stage
lib/repo.mjs      resolve a source to a git dir, run git log
lib/analyze.mjs   commits -> stars, co-change links, traits
lib/read.mjs      the one-line caption (swap for Claude, keep as fallback)
public/sketch.js  seeded spring layout + the drawing
public/style.css  projector-first: near-black, high contrast, nothing under 15px
cache/            bare clones (gitignored)
```

## Three things that cost real time — do not undo them

**1. `--numstat` cannot work here.** Remote repos are cloned with `--filter=blob:none`,
which omits file contents. Counting changed *lines* needs those contents, so git silently
falls back to fetching every blob one at a time: 51 seconds on a tiny repo, then a fatal
error. `--name-only` needs only trees, which the partial clone does have.

**2. `--no-renames` is load-bearing.** Rename detection compares file *contents* to guess
that `a/x` became `b/y`, so it reaches for blobs too and reintroduces the exact same stall.
`GIT_NO_LAZY_FETCH=1` is set on the log call as a backstop: if anything ever does ask for a
missing object, it fails in milliseconds instead of hanging mid-demo.

The upshot: star size is **commit count**, not lines changed. That started as a constraint
and ended up being right — a local checkout and a fresh clone of the same repo now render
identically, which is the whole "same repo, same sky" promise.

**3. The force model needs rest lengths.** The first layout was textbook
Fruchterman–Reingold, whose attraction term is `d²/k`. It has no rest length, so linked
nodes were pulled together until they overlapped: every cluster collapsed into a blob,
**not one edge was visible**, and unlinked nodes formed an obviously mechanical ring around
the outside. The JSON was perfect the whole time — this was only ever visible by looking at
a screenshot. It is Hooke springs with a rest length and distance-proportional gravity now.

`package.json`, changelogs and lockfiles are filtered in `analyze.mjs`. Left in, every
release touches them, so they link to everything and become the biggest star in any repo —
express and a 78-commit utility library both captioned *"everything circling
package.json"*. True, and useless.

`docs/` holds screenshots of the working render (express, svelte, slugify) — compare
against these after any change to the layout or the palette, because this is the class of
bug that does not show up in the API response.

Session write-up: `~/Documents/_SESSION-2026-09-23-commit-constellation.md`.

## Demo notes

- `?src=owner/name` in the URL plots on load — park a known-good repo in a second tab.
- Warm the cache before leaving; a cold clone on shared wifi is the one real risk.
- Good contrasting pairs: **sveltejs/svelte** (*42% after midnight, peak hour 1am*) against
  **expressjs/express** (*306 authors, peak hour 9am*). Same tool, two completely different
  skies — that contrast is the demo.
- Hovering a star shows its path, commit count and author count.
