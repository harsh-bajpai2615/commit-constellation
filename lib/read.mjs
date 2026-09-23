// The one line under the picture.
//
// Every candidate sentence is gated on a number from the log, so the read can only ever
// say something the history actually supports. It is deliberately dumb and deterministic:
// at the venue this gets swapped for a Claude call, and this stays as the offline
// fallback for when the wifi gives out mid-demo.

// Each observation returns a clause plus a weight. Highest weights win, so the line leads
// with whatever is most unusual about this repo rather than always the same fact.
const OBSERVATIONS = [
  (t) => t.nightShare > 0.25 && {
    weight: t.nightShare,
    clause: `${pct(t.nightShare)} of it written after midnight`,
  },
  (t) => t.weekendShare > 0.4 && {
    weight: t.weekendShare * 0.9,
    clause: `${pct(t.weekendShare)} of it on weekends`,
  },
  (t) => t.busFactor === 1 && t.topAuthorShare > 0.9 && {
    weight: 0.85,
    clause: `one person, start to finish`,
  },
  (t) => t.busFactor === 1 && t.topAuthorShare <= 0.9 && {
    weight: 0.7,
    clause: `half of it from a single pair of hands`,
  },
  (t) => t.busFactor > 1 && {
    weight: 0.5,
    clause: `${t.busFactor} people carrying half the commits`,
  },
  (t) => t.hottestFileShare > 0.3 && {
    weight: t.hottestFileShare,
    clause: `everything circling ${base(t.hottestFile)}`,
  },
  (t) => t.commitsPerDay > 3 && {
    weight: 0.6,
    clause: `${t.commitsPerDay.toFixed(1)} commits a day`,
  },
  (t) => t.dormant > 365 && {
    weight: 0.8,
    clause: `quiet for ${Math.floor(t.dormant / 365)} year${t.dormant > 730 ? 's' : ''}`,
  },
]

export function read(data) {
  const t = data.traits
  const found = OBSERVATIONS
    .map((fn) => fn(t))
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((o) => o.clause)

  const shape = `${data.counts.commits.toLocaleString()} commits across ${data.counts.files.toLocaleString()} files`

  // No peak hour here on purpose: the dial states it, and in a bigger, more legible way
  // than a sentence can. Saying it twice is how a page stops looking considered.
  if (found.length === 0) return `${shape}.`
  return `${shape} — ${join(found)}.`
}

function join(parts) {
  return parts.length < 2 ? parts[0] : `${parts[0]}, ${parts[1]}`
}

function pct(x) {
  return `${Math.round(x * 100)}%`
}

function base(p) {
  return p ? p.split('/').pop() : 'one file'
}
