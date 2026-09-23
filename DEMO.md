# The two minutes

Demos at the Build Day are **2 minutes each**. That is about 300 spoken words, so this is
written to be *under* it — the picture needs silence to land.

## Before you stand up

```bash
cd ~/commit-constellation
node warm.mjs          # 6/6 warmed; a cold clone on shared wifi is the one real risk
node server.mjs
```

- **Safari full screen (⌃⌘F).** The toolbar and the dock are 15% of a projector.
- **Park two tabs**: `localhost:4173/?src=expressjs/express` and `?src=sveltejs/svelte`.
  Both plot on load, so neither needs typing.
- Measured on the venue network: a *cold* clone of a 357-commit repo took **5.1s**. Warm is
  ~0.2s. Taking a repo from the audience is safe if it is small; do not accept a monorepo.

## The beat

**0:00 — open on express, already plotted.**

> Every star is a file. How big it is, is how often that file changes. A line between two
> stars means those two files keep changing in the same commit.

**0:20 — hover the big blue one.** The tooltip names it and gives commits and authors.
(No trackpad? Tab past **Plot** into the star field, then ← → walks the files from
most-changed down — useful if you end up presenting from a clicker.)

> Nobody wrote these lines down. They are not imports. This is just what 2,000 commits of
> behaviour look like from above.

**0:40 — point at the dial, top right. It says 9am.**

> That is when this repo is written. Express is a thing people work on at work.

**0:55 — switch to the svelte tab.** It is warm; it draws in about a fifth of a second.

**1:05 — let it sit for a beat, then point at the dial. It says 1am.**

> Same tool. Same two thousand commits. Forty-two percent of Svelte is written after
> midnight. It is a different sky because it is a different life.

**1:30 — the close.**

> Same repo always gives the same sky — the layout is seeded off the first commit, so this
> is a portrait, not a random scatter. No dependencies, no build, no API. It runs on a
> laptop with the wifi off.

**1:45 — "give me a repo."** Type whatever someone shouts. Keep it small.

## If something goes wrong

- **Sky is empty but the caption is there** — the tab was backgrounded mid-reveal and the
  browser dropped the animation frames. Reload, or add `&still=1` to skip the reveal.
- **Nothing but the canvas — no input, no title, no caption** — that is the chrome stuck at
  zero opacity, not a crash. It should not happen (the fill-mode was removed for exactly
  this reason) but if it ever does, bring the window to the front and reload.
- **A repo errors** — it is almost always the clone. Switch to a warmed tab and keep talking.
- **Nothing clones** — every cached repo still works with the network off.

## What not to claim

Do not call this a code-health or architecture tool. It was tested as one and it does not
hold up — see the note at the bottom of `RESUME.md`. It is a portrait of a repository.
That is a real thing to be, and it is the honest version.
