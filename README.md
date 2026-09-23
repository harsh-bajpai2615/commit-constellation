# Commit Constellation

Point it at any git repo. It reads the commit history and draws the repo as a night sky:
every file is a star sized by how often it changes, and a line between two stars means
those files keep changing in the same commit.

```bash
node server.mjs          # http://localhost:4173, no install step
```

---

## What it is actually for

**One job: show you which files move together, and when the repo is written.**

Two things are on screen that you cannot get from a file tree, a language breakdown, or a
contributor graph:

**1. Co-change.** The lines are not imports and nobody declared them. They are drawn
because those two files kept appearing in the same commit. That is a behavioural fact
about how the code is actually worked on, and it survives refactors, dependency injection,
and any amount of indirection that makes static analysis lose the thread. Zoom past 2.2×
and every star names itself, so you can read a cluster directly: in `expressjs/express`
the blue knot resolves to `application.js`, `router/index.js`, `Router.js`, `route.js`,
`layer.js` — the routing core, recovered from behaviour rather than from the folder names.

**2. When.** The dial is commits by hour of day. `sveltejs/svelte` peaks at **1am** with
42% of its commits after midnight; `expressjs/express` peaks at **9am**. Same tool, two
completely different working lives.

Three honest uses:

- **Joining a codebase.** The biggest stars are the files the repo keeps returning to.
  Start there, not at `src/index.js`.
- **Reviewing a change.** If you touched one end of a bright line, the other end is the
  file that historically moves with it.
- **Looking at a project you are considering depending on.** One picture tells you whether
  it is one person at midnight or three hundred people at 9am.

## How it differs from things that look similar

| | What it shows | What it misses |
|---|---|---|
| **Obsidian graph view** | Links you *typed* | Nothing is typed here. Every edge is inferred from commit history. Obsidian has no time axis at all. |
| **GitHub Insights / Pulse** | Counts per author, per week | No relationships between files. It cannot tell you that two files always move together. |
| **`git log` / tig / GitLens** | One commit, or one file's history | The whole history at once, as a shape. Per-file blame cannot show you the co-change graph. |
| **Gource / git-of-theseus** | Animated history over time | Those are films you watch. This is a still plate you read, and it is deterministic. |
| **CodeScene** | Genuine hotspot and coupling analysis, paid | CodeScene is the serious tool and does more. This does one slice of it, offline, in a zero-dependency page you can run on a plane. |

The closest honest comparison is **the co-change half of CodeScene**, not Obsidian. The
resemblance to Obsidian is a rendering resemblance — a force layout with dots and lines —
and it is why the render deliberately draws only the few strongest lines rather than all
of them.

## ⛔ What it is not

**It is not a code-health or architecture tool, and it should not be described as one.**
That framing was built and measured and it does not hold up. Two attempts, across express,
svelte, vue, jquery, fastapi and slugify:

- *Cross-module hidden coupling as a finding* — the signal is almost entirely a test
  moving with its subject, a generated doc moving with its source, and release
  bookkeeping. Filter those three and **four of the six repos have nothing left at all**.
- *Single-author knowledge risk* — express, svelte and jquery have **zero** single-author
  files in their top 90, and in every repo the count whose sole author had been gone a
  year was **zero**.

The numbers are in `RESUME.md`. It is a portrait of a repository, which is a real thing to
be, and the honest version.

## Using it

| | |
|---|---|
| Input | `owner/name`, any git URL, or a path on this machine |
| Zoom | Scroll or pinch toward the cursor · drag to pan · double-click or **Reset** |
| Keyboard | Tab past **Plot** into the field, then ← → between files, `+` `−` `0`, Esc |
| Labels | Appear past 2.2× zoom |
| Determinism | The same repo always renders the same sky, seeded from its first commit |
| Offline | Works fully on any local repo and any already-cloned one |
| Dependencies | **None.** Plain `node:http`, p5 vendored in `public/vendor/` |

Cold clone of a 357-commit repo: ~5s. Warm: ~0.2s. `node warm.mjs` pre-clones the demo set.

Built for the Mumbai Claude Build Day, 23 Sep 2026. Internals, and the traps worth not
stepping in again, are in [`RESUME.md`](RESUME.md); the two-minute demo is in
[`DEMO.md`](DEMO.md).

## Licence

This project is MIT — see [`LICENSE`](LICENSE).

`public/vendor/p5.min.js` is **p5.js v1.11.2**, © the p5.js contributors, under the
**LGPL-2.1**, and is *not* covered by that MIT licence. Its full licence text and the
reason it is vendored are in [`public/vendor/`](public/vendor/).
