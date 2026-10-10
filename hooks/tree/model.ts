import type { Branch, FileNode, FileTree } from '../../types'

// The file tree's pure helpers: nodes and paths, the rows on screen and the git status parsers.

/** A directory entry as `$.fs.list` reports it, with a link resolved to what it points at. */
export type Entry = { name: string; kind: 'file' | 'dir' | 'other'; isLink: boolean }

/** One row on screen: its node, its depth and whether it is an open folder. */
export type Row = { node: FileNode; depth: number; open: boolean }

/** How git sees one file: new, modified or deleted. */
export type Change = 'new' | 'mod' | 'del'

/** What `git status` says about the tree: a letter per path, ignored paths, untracked folders, the branch and each changed file. */
export type GitStatus = { git: Record<string, string>; ignored: string[]; untrackedDirs: string[]; branch: Branch | null; files: Record<string, Change> }

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Status letters from the one that matters most to the least, so a folder shows its worst child.
const PRIORITY = ['U', 'D', 'M', 'T', 'R', 'C', 'A', '?']

/** An empty tree rooted at `root`. */
export function emptyTree(root: string): FileTree {
  return {
    root, nodes: [], expanded: [], cursor: '', query: '', showHidden: true,
    git: {}, diff: {}, ignored: [], untrackedDirs: [], top: '', prefix: '', branch: null, counts: {},
    flash: [], flashDim: [], flashOn: false, flashTones: {}, scroll: null,
  }
}

/** `dir/name`, without doubling the slash of a root such as `/`. */
export function join(dir: string, name: string): string {
  return dir.endsWith('/') ? dir + name : `${dir}/${name}`
}

/** The folder a path is in; `/` for a top-level path. */
export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}

/** Whether `path` is `root` or lies under it. */
export function inside(root: string, path: string): boolean {
  return path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`)
}

/** `path` relative to `root`; empty for the root itself. */
export function relative(root: string, path: string): string {
  return path === root ? '' : path.slice(root.endsWith('/') ? root.length : root.length + 1)
}

/** The folders between `id` and `root`, nearest first, excluding both. */
export function ancestorsOf(id: string, root: string): string[] {
  const out: string[] = []
  if (!root) return out
  for (let dir = dirname(id), prev = id; dir !== prev && dir !== root && inside(root, dir); prev = dir, dir = dirname(dir)) out.push(dir)
  return out
}

/** Whether `id` or one of its folders up to `root` is in `set`. */
export function underAny(id: string, set: Set<string>, root: string): boolean {
  if (set.size === 0) return false
  let cur = id
  while (cur.length >= root.length) {
    if (set.has(cur)) return true
    const up = dirname(cur)
    if (up === cur) break
    cur = up
  }
  return false
}

/** The entries of `dir` as nodes: folders first, then names in natural order. */
export function toNodes(dir: string, list: Entry[]): FileNode[] {
  return list
    .map(e => ({
      id: join(dir, e.name),
      parent: dir,
      name: e.name,
      kind: e.isLink ? ('link' as const) : e.kind === 'dir' ? ('dir' as const) : ('file' as const),
      hidden: e.name.startsWith('.'),
      loaded: false,
    }))
    .sort((a, b) => (a.kind === 'dir' ? 0 : 1) - (b.kind === 'dir' ? 0 : 1) || collator.compare(a.name, b.name))
}

/** `nodes` with the children of every folder in `listed` replaced by its fresh listing; a folder that vanished takes its subtree with it. */
export function replaceChildren(nodes: FileNode[], listed: Map<string, FileNode[]>): FileNode[] {
  if (listed.size === 0) return nodes
  const keep = new Map<string, FileNode>()
  for (const n of nodes) if (listed.has(n.parent)) keep.set(n.id, n)
  const freshIds = new Set<string>()
  for (const kids of listed.values()) for (const k of kids) freshIds.add(k.id)
  const gone = new Set([...keep.keys()].filter(id => !freshIds.has(id)))
  const under = (id: string) => {
    if (gone.size === 0) return false
    for (let dir = dirname(id), prev = id; dir !== prev; prev = dir, dir = dirname(dir)) if (gone.has(dir)) return true
    return false
  }
  const fresh: FileNode[] = []
  for (const kids of listed.values()) {
    for (const k of kids) {
      if (under(k.id)) continue
      const old = keep.get(k.id)
      fresh.push(old && old.kind === 'dir' && k.kind === 'dir' ? { ...k, loaded: old.loaded } : k)
    }
  }
  const out = nodes.filter(n => !listed.has(n.parent) && !under(n.id))
  return [...out.map(n => (listed.has(n.id) ? { ...n, loaded: true } : n)), ...fresh]
}

/** `nodes` without anything below the folders in `dirs`, which are marked unloaded again. */
export function dropBelow(nodes: FileNode[], dirs: string[]): FileNode[] {
  if (dirs.length === 0) return nodes
  const under = (id: string) => dirs.some(d => id !== d && inside(d, id))
  const gone = new Set(dirs)
  return nodes.filter(n => !under(n.id)).map(n => (gone.has(n.id) && n.loaded ? { ...n, loaded: false } : n))
}

/** The branch line of `git status -b --porcelain`: head, upstream and how far ahead or behind. */
export function parseBranch(record: string): Branch {
  const body = record.replace(/^## /, '')
  if (body.startsWith('HEAD (no branch)')) return { head: 'detached', upstream: '', ahead: 0, behind: 0 }
  const head = body.match(/^(?:No commits yet on |Initial commit on )?(.+?)(?:\.\.\.|\s|$)/)?.[1] ?? body
  const upstream = body.match(/\.\.\.(\S+)/)?.[1] ?? ''
  const ahead = Number(body.match(/ahead (\d+)/)?.[1] ?? 0)
  const behind = Number(body.match(/behind (\d+)/)?.[1] ?? 0)
  return { head, upstream, ahead, behind }
}

/** Maps a path git prints relative to the repository onto the tree, or null when it lies outside `prefix`. */
export function mapper(root: string, prefix: string): (rel: string) => string | null {
  return rel => (rel.startsWith(prefix) ? join(root, rel.slice(prefix.length).replace(/\/$/, '')).replace(/\/$/, '') : null)
}

/** The stronger of two status letters by `PRIORITY`. */
export function stronger(a: string | undefined, b: string): string {
  if (!a) return b
  return PRIORITY.indexOf(b) < PRIORITY.indexOf(a) ? b : a
}

/** Parses `git status --porcelain=v1 -b -z --ignored` into letters per path and folder, ignored paths, untracked folders and the branch. */
export function parseGit(stdout: string, root: string, prefix: string): GitStatus {
  const map = mapper(root, prefix)
  const git: Record<string, string> = {}
  const ignored: string[] = []
  const untrackedDirs: string[] = []
  const files: Record<string, Change> = {}
  let branch: Branch | null = null
  const parts = stdout.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i] ?? ''
    if (rec.startsWith('## ')) {
      branch = parseBranch(rec)
      continue
    }
    if (rec.length < 4) continue
    const xy = rec.slice(0, 2)
    const raw = rec.slice(3)
    if (xy[0] === 'R' || xy[0] === 'C') i++
    const path = map(raw)
    if (!path) continue
    if (xy === '!!') {
      ignored.push(path)
      continue
    }
    if (xy === '??' && raw.endsWith('/')) untrackedDirs.push(path)
    else files[path] = xy === '??' || (xy.includes('A') && !xy.includes('D')) ? 'new' : xy.includes('D') && !/U/.test(xy) ? 'del' : 'mod'
    const letter = xy === '??' ? '?' : /U/.test(xy) || xy === 'AA' || xy === 'DD' ? 'U' : (['D', 'M', 'R', 'C', 'A', 'T'].find(c => xy.includes(c)) ?? '')
    if (!letter) continue
    git[path] = stronger(git[path], letter)
    let dir = dirname(path)
    while (dir.length >= root.length && dir !== '/') {
      git[dir] = stronger(git[dir], letter)
      if (dir === root) break
      dir = dirname(dir)
    }
  }
  return { git, ignored, untrackedDirs, branch, files }
}

/** Adds the lines each file gained and lost from `git diff --numstat -z` into `into`. */
export function parseNumstat(stdout: string, root: string, prefix: string, into: Record<string, [number, number]>): void {
  const map = mapper(root, prefix)
  const parts = stdout.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i] ?? ''
    if (!rec) continue
    const m = rec.match(/^(-|\d+)\t(-|\d+)\t(.*)$/s)
    if (!m) continue
    let path = m[3] ?? ''
    if (path === '') {
      i += 2
      path = parts[i] ?? ''
    }
    if (!path) continue
    const add = m[1] === '-' ? 0 : Number(m[1])
    const del = m[2] === '-' ? 0 : Number(m[2])
    const abs = map(path)
    if (!abs) continue
    const prev = into[abs] ?? [0, 0]
    into[abs] = [prev[0] + add, prev[1] + del]
  }
}

/** `diff` with every folder up to `root` carrying the sum of its files. */
export function rollUp(diff: Record<string, [number, number]>, root: string): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = { ...diff }
  for (const [path, [add, del]] of Object.entries(diff)) {
    let dir = dirname(path)
    while (dir.length >= root.length && dir !== '/') {
      const prev = out[dir] ?? [0, 0]
      out[dir] = [prev[0] + add, prev[1] + del]
      if (dir === root) break
      dir = dirname(dir)
    }
  }
  return out
}

/** How many new, modified and deleted files each folder up to `root` holds. */
export function rollCounts(files: Record<string, Change>, root: string): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {}
  const slot = { new: 0, mod: 1, del: 2 } as const
  for (const [path, change] of Object.entries(files)) {
    let dir = dirname(path)
    while (dir.length >= root.length && dir !== '/') {
      const cur = out[dir] ?? [0, 0, 0]
      cur[slot[change]] += 1
      out[dir] = cur
      if (dir === root) break
      dir = dirname(dir)
    }
  }
  return out
}

/** The rows the tree shows: open folders walked in order, hidden entries dropped when off, and with a query only the matches and their folders. */
export function visibleRows(t: FileTree): Row[] {
  const kids = new Map<string, FileNode[]>()
  for (const n of t.nodes) {
    if (!t.showHidden && n.hidden) continue
    const list = kids.get(n.parent)
    if (list) list.push(n)
    else kids.set(n.parent, [n])
  }
  const q = t.query.trim().toLowerCase()
  let keep: Set<string> | null = null
  if (q) {
    keep = new Set()
    for (const n of t.nodes) {
      if (!relative(t.root, n.id).toLowerCase().includes(q)) continue
      keep.add(n.id)
      for (const a of ancestorsOf(n.id, t.root)) keep.add(a)
    }
  }
  const open = new Set(t.expanded)
  const rows: Row[] = []
  const walk = (dir: string, depth: number) => {
    for (const n of kids.get(dir) ?? []) {
      if (keep && !keep.has(n.id)) continue
      const isOpen = n.kind === 'dir' && (keep ? kids.has(n.id) : open.has(n.id))
      rows.push({ node: n, depth, open: isOpen })
      if (isOpen) walk(n.id, depth + 1)
    }
  }
  walk(t.root, 0)
  return rows
}
