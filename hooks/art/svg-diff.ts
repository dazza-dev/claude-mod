export type Hunk = { oldStart: number; newStart: number; lines: readonly string[] }

export type DiffInput = { path: string; hunks: readonly Hunk[]; isNewFile: boolean }

type Line = { kind: 'add' | 'del' | 'ctx'; text: string; old?: number; new?: number } | { kind: 'gap'; at: number }

/** The patch's lines in order, numbered on each side, with a gap mark between hunks. */
export function diffLines(hunks: readonly Hunk[]): Line[] {
  return hunks.flatMap((hunk, h) => {
    let oldNo = hunk.oldStart
    let newNo = hunk.newStart
    const lines: Line[] = h === 0 ? [] : [{ kind: 'gap', at: hunk.newStart }]
    for (const raw of hunk.lines) {
      if (raw.startsWith('\\')) continue
      const text = raw.slice(1).replace(/\t/g, '  ')
      if (raw.startsWith('+')) lines.push({ kind: 'add', text, new: newNo++ })
      else if (raw.startsWith('-')) lines.push({ kind: 'del', text, old: oldNo++ })
      else lines.push({ kind: 'ctx', text, old: oldNo++, new: newNo++ })
    }
    return lines
  })
}
