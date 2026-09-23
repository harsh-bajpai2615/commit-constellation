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

const STILL = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// One hue per top-level directory. Muted enough to sit on black without vibrating,
// separated enough to stay distinct on a washed-out projector.
const HUES = [
  [ 92, 141, 214], [214, 128, 106], [126, 196, 148], [201, 158,  92],
  [172, 130, 205], [ 96, 186, 196], [212, 124, 168], [150, 158, 174],
]

let state = null   // { nodes, links, data, t0 }
let hovered = null

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

  relax(nodes, links, Math.min(w, h))
  fit(nodes, w, h)
  return { nodes, links }
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
  const scale = Math.min(
    (w - pad * 2) / Math.max(maxX - minX, 1),
    (h - pad * 2.4) / Math.max(maxY - minY, 1),
    2.8,
  )
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  for (const n of nodes) {
    n.x = (n.x - cx) * scale
    n.y = (n.y - cy) * scale
  }
}

// ---------------------------------------------------------------- drawing

function setup() {
  const c = createCanvas(windowWidth, windowHeight)
  c.parent(document.body)
  c.elt.id = 'sky'
  document.querySelectorAll('canvas').forEach((n, i) => { if (i === 0 && n.id !== 'sky') n.remove() })
  noLoop()
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
  if (state) {
    state = { ...state, ...buildLayout(state.data, width, height) }
    redraw()
  }
}

function draw() {
  background(10, 10, 12)
  if (!state) return drawIdle()

  translate(width / 2, height / 2)

  const age = (millis() - state.t0) / 1000
  const drift = STILL ? 0 : 1

  // Links first, so stars sit on top of them.
  for (const l of state.links) {
    const reveal = ease(clamp((age - 0.55 - l.from.born * 0.5) / 0.7))
    if (reveal <= 0) continue
    const [r, g, b] = l.from.hue
    strokeWeight(0.8 + l.strength * 2.4)
    stroke(r, g, b, reveal * (58 + l.strength * 150))
    line(px(l.from, age, drift), py(l.from, age, drift), px(l.to, age, drift), py(l.to, age, drift))
  }

  noStroke()
  for (const n of state.nodes) {
    const reveal = ease(clamp((age - n.born * 0.6) / 0.6))
    if (reveal <= 0) continue
    const x = px(n, age, drift), y = py(n, age, drift)
    const pulse = STILL ? 0 : Math.sin(age * 1.1 + n.twinkle) * 0.12
    const r = n.r * reveal * (1 + pulse)
    const [cr, cg, cb] = n.hue
    const lit = hovered === n

    // Halo, then core. Two passes is cheaper and softer than a real blur.
    fill(cr, cg, cb, reveal * (lit ? 70 : 34))
    circle(x, y, r * 3.4)
    fill(cr, cg, cb, reveal * (lit ? 255 : 210))
    circle(x, y, r * 2)
    if (lit) {
      stroke(244, 241, 234, 200); strokeWeight(1.5); noFill()
      circle(x, y, r * 3.6)
      noStroke()
    }
  }

  trackHover(age, drift)
}

// Slow noise drift, so the sky breathes instead of sitting dead on the screen.
function px(n, age, drift) { return n.x + (drift ? Math.sin(age * 0.24 + n.twinkle) * 3.5 : 0) }
function py(n, age, drift) { return n.y + (drift ? Math.cos(age * 0.19 + n.twinkle * 1.3) * 3.5 : 0) }

function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x }
function ease(x) { return 1 - Math.pow(1 - x, 3) }

function drawIdle() {
  // A quiet scatter before anything is loaded, so the first screen is never empty.
  const rand = rng(20260923)
  noStroke()
  for (let i = 0; i < 140; i++) {
    const x = rand() * width, y = rand() * height
    const a = 12 + rand() * 45
    fill(244, 241, 234, a)
    circle(x, y, 1 + rand() * 2)
  }
}

function trackHover(age, drift) {
  const mx = mouseX - width / 2, my = mouseY - height / 2
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

async function plot(src) {
  const button = form.querySelector('button')
  button.disabled = true
  statusEl.className = ''
  statusEl.textContent = 'Reading history…'
  caption.hidden = true

  try {
    const res = await fetch(`/api/constellation?src=${encodeURIComponent(src)}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not read that repo.')

    state = { data, ...buildLayout(data, width, height), t0: millis() }
    hovered = null
    tooltip.hidden = true

    el('title').textContent = data.name
    el('read').textContent = data.read
    caption.hidden = false
    statusEl.textContent = `${data.counts.commits.toLocaleString()} commits · ${data.counts.authors} author${data.counts.authors === 1 ? '' : 's'} · ${(data.tookMs / 1000).toFixed(1)}s`
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
