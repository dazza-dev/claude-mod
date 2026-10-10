import type { Palette, Slot } from './skin'

const SERIES: readonly Slot[] = ['user', 'read', 'ok', 'warn', 'web', 'mcp', 'search', 'err']

// Redmean distance two colors need for neighbouring series to tell apart.
const DISTINCT = 85

/** Color of series `i`: the palette's accents in order, a repeated color skipped and near-duplicates last. */
export function seriesColor(palette: Palette, i: number): string {
  const colors = SERIES.map(slot => palette[slot].toLowerCase()).filter((color, at, all) => all.indexOf(color) === at)
  const distinct: string[] = []
  const close: string[] = []
  for (const color of colors) {
    ;(distinct.every(other => distance(color, other) >= DISTINCT) ? distinct : close).push(color)
  }
  const order = [...distinct, ...close]
  return order[i % order.length] ?? palette.user
}

/** Red, green and blue of a `#rrggbb` color. */
const channels = (color: string): number[] => [1, 3, 5].map(at => Number.parseInt(color.slice(at, at + 2), 16))

/** Redmean distance between two `#rrggbb` colors. */
function distance(a: string, b: string): number {
  const [r1 = 0, g1 = 0, b1 = 0] = channels(a)
  const [r2 = 0, g2 = 0, b2 = 0] = channels(b)
  const red = (r1 + r2) / 2
  return Math.sqrt((2 + red / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - red) / 256) * (b1 - b2) ** 2)
}
