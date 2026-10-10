// Plain string helpers behind the row builders.

export const slashed = (path: string): string => path.replace(/\\/g, '/')

// A path under the session's directory shows relative to it; any other stays as given.
export function shortenPath(path: string, cwd: string): string {
  const full = slashed(path)
  const root = slashed(cwd).replace(/\/+$/, '')

  if (root === '' || !full.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return path
  }

  return full.slice(root.length + 1)
}

// Lines added and removed, read from an Edit or Write record's patch.
export function diffstat(output: unknown): { added: number; removed: number } | null {
  const patch = (output as { structuredPatch?: unknown } | null)?.structuredPatch

  if (!Array.isArray(patch)) {
    return null
  }

  const lines = patch.flatMap(hunk => {
    const hunkLines = (hunk as { lines?: unknown } | null)?.lines

    return Array.isArray(hunkLines) ? hunkLines.filter(line => typeof line === 'string') : []
  }) as string[]

  return {
    added: lines.filter(line => line.startsWith('+')).length,
    removed: lines.filter(line => line.startsWith('-')).length,
  }
}

// The same seed always picks the same item, so a row keeps its word when it redraws.
export function pick<T>(items: readonly T[], seed: string): T | undefined {
  let hash = 5381

  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33 + seed.charCodeAt(i)) >>> 0
  }

  return items[hash % items.length]
}
