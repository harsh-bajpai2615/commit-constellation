/* global p5 */
// The sky. Files are stars, sized by how often they change. A line between two stars means
// those files keep changing in the same commit -- the seams of the codebase, the things
// that cannot move alone.
//
// Layout is a small force simulation, run to completion on load rather than animated,
// and driven entirely by a seeded PRNG. Same repo in, same sky out, every time.

const el = (id) => document.getElementById(id)
const form = el('form')
const srcInput = el('src')
const statusEl = el('status')
const caption = el('caption')
const tooltip = el('tooltip')
const keyEl = el('key')
const keyList = el('keyList')
const dialLabel = el('dialLabel')
const intro = el('intro')

const STILL = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// One hue per top-level directory. Muted enough to sit on black without vibrating,
// separated enough to stay distinct on a washed-out projector.
const HUES = [
  [ 92, 141, 214], [214, 128, 106], [126, 196, 148], [201, 158,  92],
  [172, 130, 205], [ 96, 186, 196], [212, 124, 168], [150, 158, 174],
]

let state = null   // { nodes, links, legend, data, t0 }
let hovered = null
let bg = null      // pre-rendered backdrop, rebuilt per layout

const DRAWN_LINKS = 46    // of up to 140 the server sends
const SPIKE_STARS = 11
const NEBULA_STEPS = 26
const FAR_STARS = 430

// ---------------------------------------------------------------- seeded randomness

// mulberry32: tiny, fast, and identical across browsers, which matters because the
// whole promise of the piece is that a repo always renders the same way.
function rng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- layout

function buildLayout(data, w, h) {
  const rand = rng(data.seed)
  const maxCommits = Math.max(...data.stars.map((s) => s.commits), 1)

  const dirs = [...new Set(data.stars.map((s) => s.dir.split('/')[0] || '.'))]

  const nodes = data.stars.map((s, i) => {
    const angle = rand() * Math.PI * 2
    // sqrt keeps the initial scatter area-uniform instead of clumping at the centre.
    const radius = Math.sqrt(rand()) * Math.min(w, h) * 0.34
    return {
      i,
      star: s,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      // Area, not radius, tracks the commit count -- otherwise one hot file swamps the frame.
      r: 3 + Math.sqrt(s.commits / maxCommits) * 17,
      hue: HUES[dirs.indexOf(s.dir.split('/')[0] || '.') % HUES.length],
      twinkle: rand() * Math.PI * 2,
      born: rand(),
    }
  })

  const links = data.links.map((l) => ({ ...l, from: nodes[l.a], to: nodes[l.b] }))
  const maxWeight = Math.max(...links.map((l) => l.weight), 1)
  for (const l of links) l.strength = l.weight / maxWeight

  // The colours encode top-level directory, which is invisible to a room nobody has told.
  // Two minutes is not enough time to say it out loud, so the picture says it instead.
  const byDir = new Map()
  for (const n of nodes) {
    const key = n.star.dir.split('/')[0] || '.'
    const rec = byDir.get(key) || { name: key === '.' ? 'root' : key, count: 0, hue: n.hue }
    rec.count += 1
    byDir.set(key, rec)
  }
  const legend = [...byDir.values()].sort((a, b) => b.count - a.count).slice(0, 6)

  // Which lines actually get drawn. A star chart draws the few lines that make the figure,
  // not every relationship in the sky -- drawing all 140 edges at equal weight is precisely
  // what made this read as a graph viewer rather than as a constellation. Ranking by
  // confidence rather than raw count keeps a quiet pair that always moves together over a
  // hot pair that merely overlaps a lot.
  // Budgeted against the number of stars, not fixed. A 16-file repo has so few possible
  // pairs that a flat budget of 46 draws nearly all of them, and the picture collapses
  // back into the web this is trying not to be.
  const budget = Math.max(6, Math.min(DRAWN_LINKS, Math.round(nodes.length * 0.55)))
  const ranked = [...links].sort((a, b) => b.confidence - a.confidence).slice(0, budget)
  const hi = ranked[0]?.confidence ?? 1
  const lo = ranked[ranked.length - 1]?.confidence ?? 0
  for (const l of ranked) {
    l.drawn = true
    l.heat = hi > lo ? (l.confidence - lo) / (hi - lo) : 1
  }

  // Diffraction spikes go on the brightest handful only. On every star the sky turns into
  // a pincushion and the size ranking stops being readable.
  const spikeCut = [...nodes].sort((a, b) => b.r - a.r)[SPIKE_STARS]?.r ?? Infinity
  for (const n of nodes) n.spike = n.r > spikeCut

  relax(nodes, links, Math.min(w, h))
  fit(nodes, w - (w < NARROW_AT ? 0 : KEY_COLUMN), h)   // the instrument column is not sky
  return { nodes, links, legend }
}

// A backdrop rendered once per layout and blitted each frame: a nebula tinted by this
// repo's own dominant colours and seeded from its own history, so every repo gets a sky of
// its own instead of the same wallpaper, plus the field of far stars that stops 90 dots
// from floating on flat black.
function buildBackdrop(seed, hues, w, h) {
  const g = createGraphics(w, h)
  const rand = rng((seed ^ 0x9e3779b9) >>> 0)
  g.background(8, 8, 11)
  g.noStroke()

  const tints = hues.length ? hues : [[70, 86, 140]]
  for (let b = 0; b < 3; b++) {
    const cx = (0.15 + rand() * 0.7) * w
    const cy = (0.15 + rand() * 0.7) * h
    const R = (0.34 + rand() * 0.34) * Math.max(w, h)
    const [r, gg, bb] = tints[b % tints.length]
    // p5 has no radial gradient, so stack shrinking discs at very low alpha. The
    // accumulation *is* the falloff.
    for (let i = NEBULA_STEPS; i > 0; i--) {
      g.fill(r, gg, bb, 2.2)
      g.circle(cx, cy, (R * i) / NEBULA_STEPS)
    }
  }

  for (let i = 0; i < FAR_STARS; i++) {
    g.fill(226, 232, 245, 8 + rand() * 62)
    const big = rand() > 0.93
    g.circle(rand() * w, rand() * h, big ? 1.8 + rand() * 1.3 : 0.8 + rand() * 1.1)
  }
  return g
}

function refreshBackdrop() {
  const seed = state ? state.data.seed : 20260923
  const hues = state ? state.legend.map((l) => l.hue) : [[64, 80, 132], [96, 112, 168]]
  bg = buildBackdrop(seed, hues, width, height)
}

// Spring layout with a cooling schedule.
//
// The first attempt used textbook Fruchterman-Reingold, whose attraction term is d*d/k.
// That has no rest length: linked nodes are pulled together until d is nearly zero, so
// every connected cluster collapsed into a single blob and not one edge was visible --
// which, since the edges *are* the idea, made the picture worthless. Unlinked nodes
// meanwhile drifted out to where repulsion balanced the weak centre pull, forming an
// obviously mechanical ring around the outside.
//
// So: real springs with a rest length, and gravity proportional to distance.
function relax(nodes, links, scale) {
  const GRAVITY = 0.012      // toward centre, proportional to distance: no outer ring
  const SPRING = 0.10        // how hard a link pulls back to its rest length
  const REPEL = scale * 0.55 // Coulomb constant, scaled so it works at any viewport size
  const DAMP = 0.86

  // Neighbours sit about this far apart. Scaled by node size so big stars get more room.
  const rest = (a, b) => (a.r + b.r) * 2.2 + 34

  let temp = scale * 0.09

  for (let step = 0; step < 500; step++) {
    for (const n of nodes) { n.vx *= DAMP; n.vy *= DAMP }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        let dx = a.x - b.x, dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { dx = (i % 2 ? 1 : -1); dy = (j % 2 ? 1 : -1); d2 = 2 }
        const d = Math.sqrt(d2)
        // Inverse-square, but capped: without the cap two nodes that land on top of each
        // other fling each other across the canvas and the layout never settles.
        const force = Math.min(REPEL * REPEL / d2, scale * 0.6)
        a.vx += (dx / d) * force; a.vy += (dy / d) * force
        b.vx -= (dx / d) * force; b.vy -= (dy / d) * force
      }
    }

    for (const l of links) {
      const a = l.from, b = l.to
      const dx = a.x - b.x, dy = a.y - b.y
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01
      // Hooke: pull in when stretched past rest, push out when compressed inside it.
      // The push-out half is what keeps linked nodes from ever overlapping.
      const force = (d - rest(a, b)) * SPRING * (0.35 + l.strength * 0.65)
      a.vx -= (dx / d) * force; a.vy -= (dy / d) * force
      b.vx += (dx / d) * force; b.vy += (dy / d) * force
    }

    for (const n of nodes) {
      n.vx -= n.x * GRAVITY
      n.vy -= n.y * GRAVITY
      const speed = Math.hypot(n.vx, n.vy) || 0.01
      const capped = Math.min(speed, temp)
      n.x += (n.vx / speed) * capped
      n.y += (n.vy / speed) * capped
    }
    temp *= 0.992
  }
}

// Scale the settled graph into the viewport with a margin, so a 6-file repo and a
// 90-file repo both fill the frame.
function fit(nodes, w, h) {
  const pad = 90
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const sx = (w - pad * 2) / Math.max(maxX - minX, 1)
  const sy = (skyH(h) - pad * 0.7) / Math.max(maxY - minY, 1)
  const scale = Math.min(sx, sy, 2.8)

  // The relaxation is isotropic, so it settles into a roughly circular blob -- which on a
  // 16:9 projector floats in the middle with dead margins either side. Stretch the axis
  // that has room left over. Capped, because past about 1.5 the springs visibly lie about
  // how far apart two stars are.
  const stretch = Math.min(sx / scale, 1.5)

  // Star radius is in absolute pixels, so a narrow window shrinks the sky and leaves the
  // stars full size: they overlap, the additive glow saturates, and a 90-file repo renders
  // as one white blob.
  //
  // Driven off the viewport, deliberately, not off `scale`. Tying it to `scale` also
  // shrank the stars on a wide screen -- where nothing was wrong -- and drained the
  // picture. 1 at the size this was designed at and below, never more.
  const rScale = Math.max(0.45, Math.min(1, Math.min(w, h * 1.7) / 1100))

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  for (const n of nodes) {
    n.x = (n.x - cx) * scale * stretch
    n.y = (n.y - cy) * scale
    n.r *= rScale
  }
}

// ---------------------------------------------------------------- drawing

function setup() {
  const c = createCanvas(windowWidth, windowHeight)
  c.parent(document.body)
  c.elt.id = 'sky'
  document.querySelectorAll('canvas').forEach((n, i) => { if (i === 0 && n.id !== 'sky') n.remove() })
  refreshBackdrop()
  noLoop()
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
  if (state) state = { ...state, ...buildLayout(state.data, width, height) }
  refreshBackdrop()
  redraw()
}

function draw() {
  if (bg) image(bg, 0, 0)
  else background(8, 8, 11)
  if (!state) return

  const age = (millis() - state.t0) / 1000
  const drift = STILL ? 0 : 1

  push()
  translate(skyX(), skyY())

  // Everything from here is additive, so overlapping light accumulates instead of stacking
  // as flat translucent discs. That is the whole difference between a scatter plot of
  // circles and a sky -- and it is what lets a one-pixel line still read as starlight.
  blendMode(ADD)

  // Constellation lines: few, thin, and the colour of starlight rather than of the folder
  // they came from. Tinting them by directory was half of why this read as a graph.
  strokeCap(ROUND)
  for (const l of state.links) {
    if (!l.drawn) continue
    const reveal = ease(clamp((age - 0.55 - l.from.born * 0.5) / 0.7))
    if (reveal <= 0) continue
    // Twice: a wide dim pass for the halo, a tight bright one for the filament.
    stroke(150, 176, 230, reveal * (14 + l.heat * 40))
    strokeWeight(2.2 + l.heat * 3.4)
    line(px(l.from, age, drift), py(l.from, age, drift), px(l.to, age, drift), py(l.to, age, drift))
    stroke(206, 222, 250, reveal * (52 + l.heat * 150))
    strokeWeight(0.55 + l.heat * 1.15)
    line(px(l.from, age, drift), py(l.from, age, drift), px(l.to, age, drift), py(l.to, age, drift))
  }

  noStroke()
  for (const n of state.nodes) {
    const reveal = ease(clamp((age - n.born * 0.6) / 0.6))
    if (reveal <= 0) continue
    const x = px(n, age, drift), y = py(n, age, drift)
    const pulse = STILL ? 0 : Math.sin(age * 1.1 + n.twinkle) * 0.1
    const r = n.r * reveal * (1 + pulse)
    const [cr, cg, cb] = n.hue
    const boost = hovered === n ? 1.8 : 1

    // Three falloff passes. One halo reads as a ring; three read as glow.
    fill(cr, cg, cb, reveal * 9 * boost);  circle(x, y, r * 7.4)
    fill(cr, cg, cb, reveal * 19 * boost); circle(x, y, r * 4.2)
    fill(cr, cg, cb, reveal * 44 * boost); circle(x, y, r * 2.6)

    if (n.spike) {
      const len = r * (2.4 + (STILL ? 0 : Math.sin(age * 0.8 + n.twinkle) * 0.22))
      spikes(x, y, len, cr, cg, cb, reveal * 66 * boost)
      noStroke()
    }

    // Coloured body, then a white-hot centre: a real star is never a flat coloured disc.
    fill(cr, cg, cb, reveal * 225 * boost); circle(x, y, r * 1.5)
    fill(248, 250, 255, reveal * 185 * boost); circle(x, y, r * 0.72)
  }
  blendMode(BLEND)

  if (hovered) {
    noFill(); stroke(244, 241, 234, 165); strokeWeight(1.2)
    circle(px(hovered, age, drift), py(hovered, age, drift), hovered.r * 4.4)
    noStroke()
  }
  pop()

  // The dial is drawn here because it is part of the plate; the key that explains the
  // colours is DOM, where it can be set in real type instead of canvas fallback glyphs.
  if (!isNarrow()) drawClock(age)

  trackHover(age, drift)
}

const HOUR_LABEL = [
  '12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am',
  '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm',
]

const CLOCK_X = 118, CLOCK_Y = 124, CLOCK_INNER = 28, CLOCK_SPAN = 38
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace'

// The dial and the key occupy a column down the right edge. Centring the sky on the
// viewport therefore centres it on nothing -- it leaves a dead third on the left and
// crowds the instruments on the right. Offset it by half that column.
// Below this the instrument column has nowhere to go: the dial lands on top of the input
// and the key lands on top of the sky. Narrow means the picture only, which is the honest
// degradation -- a dial you cannot read is worse than no dial.
const NARROW_AT = 760
const isNarrow = () => width < NARROW_AT

const KEY_COLUMN = 156
const skyX = () => width / 2 - (isNarrow() ? 0 : KEY_COLUMN / 2)

// The chrome is not symmetric -- the input and status line take the top, the plate caption
// takes considerably more at the bottom -- so a sky centred on the viewport runs stars
// through both. Reserve each edge for what is actually there and centre on what is left.
const TOP_INSET = 150
const BOTTOM_INSET = 240
const skyH = (h) => h - TOP_INSET - BOTTOM_INSET
const skyY = () => TOP_INSET + skyH(height) / 2

// The 24-hour ring: when this repo is actually written. `hours` has been in the payload
// from the first commit and nothing ever drew it, so the most quotable fact about a repo
// -- svelte spiking at 1am against express at 9am -- lived only in the sentence at the
// bottom. Same tool, two different skies is the demo; this is what makes it a *picture*.
function drawClock(age) {
  const h = state.data.hours
  const max = Math.max(...h)
  if (!max) return

  const reveal = ease(clamp((age - 1.1) / 0.8))
  if (reveal <= 0) return

  const peak = h.indexOf(max)
  const outer = CLOCK_INNER + CLOCK_SPAN

  push()
  translate(width - CLOCK_X, CLOCK_Y)

  // A dim disc underneath, so the dial stays readable if a star happens to settle here.
  noStroke()
  fill(10, 10, 12, reveal * 175)
  circle(0, 0, (outer + 24) * 2)

  // Faint inner dial, so an hour with no commits still reads as an hour.
  noFill()
  stroke(244, 241, 234, reveal * 28)
  strokeWeight(1)
  circle(0, 0, CLOCK_INNER * 2)

  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2   // midnight at the top, running clockwise
    const len = CLOCK_INNER + (h[i] / max) * CLOCK_SPAN * reveal
    const night = i >= 23 || i < 5                   // the hours the caption calls "after midnight"
    const lit = i === peak
    strokeWeight(lit ? 4.5 : 3)
    if (lit) stroke(255, 236, 190, reveal * 255)
    else if (night) stroke(126, 154, 214, reveal * 195)
    else stroke(244, 241, 234, reveal * 105)
    line(Math.cos(a) * CLOCK_INNER, Math.sin(a) * CLOCK_INNER, Math.cos(a) * len, Math.sin(a) * len)
  }

  // Outer bezel and cardinal ticks. An instrument has a rim; without one the bars read as
  // a loose sunburst rather than as a reading taken off a dial.
  stroke(236, 230, 217, reveal * 34)
  strokeWeight(1)
  circle(0, 0, (outer + 11) * 2)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2
    const long = i % 6 === 0
    stroke(236, 230, 217, reveal * (long ? 96 : 34))
    const t0 = outer + 11, t1 = outer + (long ? 19 : 15)
    line(Math.cos(a) * t0, Math.sin(a) * t0, Math.cos(a) * t1, Math.sin(a) * t1)
  }

  noStroke()
  textFont(MONO)
  textSize(10)
  fill(236, 230, 217, reveal * 125)
  textAlign(CENTER, CENTER); text('12a', 0, -(outer + 27))
  textAlign(CENTER, CENTER); text('12p', 0, outer + 27)
  textAlign(LEFT, CENTER);   text('6a', outer + 21, 0)
  textAlign(RIGHT, CENTER);  text('6p', -(outer + 21), 0)

  // The peak hour sits in the middle of its own dial -- the one number the room reads.
  textSize(15)
  textAlign(CENTER, CENTER)
  fill(232, 196, 137, reveal * 245)
  text(HOUR_LABEL[peak], 0, 0)
  pop()
}

// Colour -> top-level directory, biggest first. Six at most: past that it is a wall of
// text competing with the thing it is supposed to explain.
function renderKey(legend) {
  keyList.textContent = ''
  for (const it of legend) {
    const li = document.createElement('li')
    const swatch = document.createElement('i')
    swatch.style.color = `rgb(${it.hue[0]},${it.hue[1]},${it.hue[2]})`
    li.textContent = it.name
    li.append(swatch)
    keyList.append(li)
  }
  keyEl.hidden = legend.length === 0
}

// The observation record above the title: where this history starts and ends, and how many
// hands are in it. Deliberately not the peak hour -- the dial states that, and saying it
// twice is how a page stops looking considered.
function observedLine(data) {
  const year = (iso) => new Date(iso).getFullYear()
  const from = year(data.span.first), to = year(data.span.last)
  const authors = data.counts.authors
  // "Observed" because the log is capped at 2,000 commits: for a long-lived repo this is
  // the window we sampled, not the year the project began. Svelte reading "2024 – 2026"
  // without that word is a sentence that lies.
  return [
    `Observed ${from === to ? from : `${from} – ${to}`}`,
    `${authors.toLocaleString()} author${authors === 1 ? '' : 's'}`,
    `${data.span.days.toLocaleString()} days`,
  ].join('  ·  ')
}

// Four tapering spikes. Drawn as one flat-alpha line each they read as a crosshair
// stamped on the star -- the taper is the entire difference between an artefact and light.
function spikes(x, y, len, r, g, b, alpha) {
  const STEPS = 9
  strokeWeight(1)
  for (let i = 0; i < STEPS; i++) {
    const t0 = i / STEPS, t1 = (i + 1) / STEPS
    // Falls off fast, so the spike is bright at the core and gone by the tip.
    stroke(r, g, b, alpha * (1 - t0) * (1 - t0))
    line(x + len * t0, y, x + len * t1, y)
    line(x - len * t0, y, x - len * t1, y)
    line(x, y + len * t0, x, y + len * t1)
    line(x, y - len * t0, x, y - len * t1)
  }
}

// Slow noise drift, so the sky breathes instead of sitting dead on the screen.
function px(n, age, drift) { return n.x + (drift ? Math.sin(age * 0.24 + n.twinkle) * 3.5 : 0) }
function py(n, age, drift) { return n.y + (drift ? Math.cos(age * 0.19 + n.twinkle * 1.3) * 3.5 : 0) }

function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x }
function ease(x) { return 1 - Math.pow(1 - x, 3) }

function trackHover(age, drift) {
  const mx = mouseX - skyX(), my = mouseY - skyY()
  let best = null, bestD = 26
  for (const n of state.nodes) {
    const d = Math.hypot(px(n, age, drift) - mx, py(n, age, drift) - my)
    if (d < Math.max(n.r * 1.6, 10) && d < bestD) { best = n; bestD = d }
  }
  if (best !== hovered) {
    hovered = best
    showTooltip(best)
  }
}

function showTooltip(n) {
  if (!n) { tooltip.hidden = true; return }
  const s = n.star
  tooltip.innerHTML =
    `<b>${escapeHtml(s.path)}</b><br>` +
    `<span>${s.commits} commit${s.commits === 1 ? '' : 's'} &middot; ` +
    `${s.authors.length} author${s.authors.length === 1 ? '' : 's'}</span>`
  tooltip.hidden = false
  const pad = 14
  tooltip.style.left = `${Math.min(mouseX + pad, window.innerWidth - tooltip.offsetWidth - 8)}px`
  tooltip.style.top = `${Math.min(mouseY + pad, window.innerHeight - tooltip.offsetHeight - 8)}px`
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// ---------------------------------------------------------------- loading

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const src = srcInput.value.trim()
  if (!src) return
  await plot(src)
})

// The three example repos in the empty state.
intro.addEventListener('click', (e) => {
  const repo = e.target.closest('button')?.dataset.repo
  if (!repo) return
  srcInput.value = repo
  plot(repo)
})

async function plot(src) {
  const button = form.querySelector('button')
  button.disabled = true
  statusEl.className = ''
  statusEl.textContent = 'READING HISTORY…'
  caption.hidden = true

  try {
    const res = await fetch(`/api/constellation?src=${encodeURIComponent(src)}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not read that repo.')

    // `?still=1` back-dates the clock so everything is already revealed on the first frame.
    // A backgrounded tab gets its animation frames thrown away by the browser, so a
    // screenshot of one taken mid-reveal is a picture of an empty sky -- which is how the
    // docs/ shots get regenerated without babysitting a window.
    const born = STILL || new URLSearchParams(location.search).has('still') ? -9000 : 0
    state = { data, ...buildLayout(data, width, height), t0: millis() + born }
    hovered = null
    tooltip.hidden = true
    refreshBackdrop()   // the sky is tinted by this repo, so it changes with the repo

    el('title').textContent = data.name
    el('read').textContent = data.read
    el('observed').textContent = observedLine(data)
    renderKey(state.legend)
    dialLabel.hidden = false
    intro.hidden = true
    caption.hidden = false

    // Keep the address bar honest, so a reload redraws the same sky and the link can be
    // handed to someone else. replaceState rather than pushState: plotting four repos in a
    // demo should not bury the page under four history entries.
    history.replaceState(null, '', `?src=${encodeURIComponent(src)}`)
    // Cased here rather than with text-transform, so the unit on the timing stays a
    // lowercase "s" instead of being shouted as "0.1S".
    statusEl.textContent = `${data.counts.commits.toLocaleString()} COMMITS · ${data.counts.authors} AUTHOR${data.counts.authors === 1 ? '' : 'S'} · ${(data.tookMs / 1000).toFixed(1)}s`
    loop()
  } catch (err) {
    statusEl.className = 'error'
    statusEl.textContent = err.message
    if (!state) redraw()
  } finally {
    button.disabled = false
  }
}

// ?src=... in the URL plots straight away -- handy for parking a known-good repo on a
// second tab before the demo starts.
window.addEventListener('load', () => {
  const preset = new URLSearchParams(location.search).get('src')
  if (preset) { srcInput.value = preset; plot(preset) }
  else redraw()
})

window.setup = setup
window.draw = draw
window.windowResized = windowResized
