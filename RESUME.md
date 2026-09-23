# Commit Constellation

Point it at any git repo. It reads the commit history and draws the repo as a night sky:
every file is a star sized by how often it changes, and a line between two stars means
those files keep changing in the same commit — the seams of the codebase, the things that
cannot move alone. Same repo always renders the same sky.

Built for the **Mumbai Claude Fable 5.1 Build Day**, 23 Sep 2026 — *Delight* track.

---

## ⏭ PICK UP HERE

**Done and verified, including the visuals.** Read `DEMO.md` — it has the 2-minute beat,
the pre-flight checklist and the failure drills.

```bash
cd ~/commit-constellation
node warm.mjs                   # 6/6 warmed
node server.mjs                 # http://localhost:4173
```

Type `expressjs/express`, or `sveltejs/svelte`, or a path like `~/cliptrip-backend`.
`?still=1` renders the settled sky in one frame, skipping the reveal — that is how the
`docs/` shots are regenerated, because a backgrounded tab loses its animation frames and
photographs as an empty sky.

**The Claude-caption plan is dead: there is no API key.** The $100 of Build Day credits
were only ever *hedged* ("we're working to get every attendee $100") and never arrived,
and there is no `ANTHROPIC_API_KEY` on this machine. `lib/read.mjs` writes the caption
from a template and that is now the shipped behaviour, not a placeholder.

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
bug that does not show up in the API response. Regenerate with `?src=...&still=1`.

## The visual system — and why it is not a graph viewer

The first version drew all 140 co-change edges at equal weight, tinted by directory, with
flat circles for stars. The fair criticism of that picture is that it is Obsidian's graph
view. Four changes, in order of how much they mattered:

**1. Draw the few lines that make the figure.** A star chart does not draw every
relationship in the sky. Only the top links by *confidence* are drawn — and the budget
scales with the number of stars (`nodes.length * 0.55`, capped at 46), because a flat
budget on a 16-file repo draws nearly every possible pair and collapses straight back into
a web. Lines are the colour of starlight, not of the folder they came from.

**2. Additive blending.** Stars are three falloff passes plus a white-hot core, drawn in
`ADD`, so overlapping glow accumulates into light instead of stacking as flat translucent
discs. This is most of the difference between a scatter plot and a sky.

**3. Tapered diffraction spikes**, on the eleven brightest only. Drawn as one flat-alpha
line each they read as a crosshair stamped on the star; the taper is the whole difference
between an artefact and light.

**4. A backdrop seeded from the repo**, tinted by its own dominant directory colours, so
every repo gets a sky of its own rather than the same wallpaper.

**5. The page is a plate from a celestial atlas, not a dark-mode dashboard.** Two faces,
each with one job: an engraved serif (Hoefler Text) for the thing being observed — the repo
name, its one-line character — and a monospace for the instruments reading it: the dial,
the key, the span line, the status. Nothing is set in a neutral UI sans, because this is a
chart *of* something, not a control panel. The accent is the dial's peak-hour amber, and it
is the only one, because it is data rather than decoration. The `OBSERVED 2012 – 2026` rule
spans the whole plate the way a chart's frame does.

The layout reserves the top for the input and the bottom for the caption (asymmetric, since
the chrome is), and stretches the settled graph to fill a 16:9 frame instead of leaving a
circular blob floating in dead side margins.

Plus two readouts down the right edge: a **24-hour dial** (`hours[]` was in the payload
from the first commit and nothing ever drew it — so "peak hour 1am", the single most
quotable fact about a repo, lived only in the caption) and a **colour legend**, because
the hues encode top-level directory and two minutes is not enough time to say that aloud.

## ⛔ Never give the chrome an `animation-fill-mode`

`#chrome`, `#caption`, `#key` and `#dialLabel` have a rise-on-load animation. It must stay
**without a fill-mode and without a delay**.

With `both`, the element holds the from-keyframe — `opacity: 0` — until the animation
*starts*, and Safari defers CSS animations in a window that is not visible. Load the page
while the window is behind something and the animation never starts, so the entire
interface sits at zero opacity forever: no input, no title, no caption, nothing but the
canvas. It looks exactly like a JS crash and it is not one. Without a fill-mode the chrome
is visible by default and the animation is pure enhancement, which is the only safe way
round for something that has to come up on a projector.

The same evening this cost an extra half hour because Safari was serving a **cached
`style.css`**, so the fix appeared not to work. `server.mjs` now sends `cache-control:
no-store` on static files. Do not remove it.

## ⛔ Two things that were tried and do not work — do not retry them

Both were attempts to turn this into a code-health tool rather than a portrait. Both were
measured on express, svelte, vue, jquery, fastapi and slugify, and both failed.

**Hidden coupling as a finding.** The idea: file pairs that cross a top-level directory
boundary and keep changing together are coupling nobody declared. Measured, that signal is
almost entirely (a) a test moving with its subject, (b) a generated doc moving with its
source, (c) release bookkeeping. Filter those three out and **four of the six repos have
nothing left at all**; the survivors are `Gruntfile.js`/`rollup.config.js` pairs at 12-21%
confidence. `confidence` and `cross` survive in `analyze.mjs`, but only for what they
honestly are — a way to rank which lines are worth drawing.

**Single-author knowledge risk.** The idea: among the files the repo keeps returning to,
which are understood by exactly one person who has since left. Measured: express, svelte
and jquery have **zero** single-author files in their top 90, vue has 2 and fastapi 6, and
in every repo the count whose sole author was gone for over a year was **zero**. The
reason is structural and will not change: the top-90-most-changed files of a mature repo
*are* its many-hands core. Any risk signal lives in the long tail this deliberately cuts.

Session write-up: `~/Documents/_SESSION-2026-09-23-commit-constellation.md`.

## Demo notes

- `?src=owner/name` in the URL plots on load — park a known-good repo in a second tab.
- Warm the cache before leaving; a cold clone on shared wifi is the one real risk.
- Good contrasting pairs: **sveltejs/svelte** (*42% after midnight, peak hour 1am*) against
  **expressjs/express** (*306 authors, peak hour 9am*). Same tool, two completely different
  skies — that contrast is the demo.
- Hovering a star shows its path, commit count and author count.
