import type { FileNode } from '../../types'

// Glyphs for the tree's rows: flat outline Nerd Font icons by kind, name or extension when the machine has such a font; no icon otherwise, the caret alone tells folders apart.

const cp = (n: number) => String.fromCodePoint(n)

const FOLDER = 0xeaf7
const FOLDER_OPEN = 0xeaf6
const FILE = 0xea7b
const LINK = 0xf0c1

const NAMES: Record<string, number> = {
  'readme.md': 0xf0354, 'changelog.md': 0xf0354, 'contributing.md': 0xf0354, 'claude.md': 0xf0354, 'agents.md': 0xf0354,
  license: 0xe60a, dockerfile: 0xf0868, makefile: 0xf1064, 'composer.json': 0xe608, 'composer.lock': 0xe608, artisan: 0xe608,
  'package.json': 0xf0626, 'package-lock.json': 0xf0626, 'tsconfig.json': 0xf0626, 'pnpm-lock.yaml': 0xe6a8, 'yarn.lock': 0xe6a8,
  '.gitignore': 0xf02a2, '.gitmodules': 0xf0493, '.editorconfig': 0xe652, '.env': 0xf0493, '.env.example': 0xf0493,
}

const EXTS: Record<string, number> = {
  py: 0xe606, js: 0xe60c, mjs: 0xe60c, cjs: 0xe60c, ts: 0xe628, jsx: 0xe625, tsx: 0xe7ba, json: 0xe60b, yaml: 0xe6a8, yml: 0xe6a8,
  sh: 0xe795, bash: 0xe795, zsh: 0xe795, md: 0xf0354, css: 0xe6b8, scss: 0xf031c, html: 0xe736, go: 0xe627, rs: 0xe68b, rb: 0xe791,
  php: 0xe608, blade: 0xe608, java: 0xe738, kt: 0xe634, swift: 0xe755, dart: 0xe798, cs: 0xf031b, sql: 0xe706, prisma: 0xe684,
  graphql: 0xf20e, gql: 0xf20e, xml: 0xf05c0, toml: 0xe6b2, ini: 0xf0bc2, conf: 0xf0493, lock: 0xf033e, pdf: 0xeaeb, svg: 0xf0721,
  jpg: 0xf0225, jpeg: 0xf0225, png: 0xe60d, gif: 0xf0d78, webp: 0xf021f, mp4: 0xf022b, mp3: 0xf0223, zip: 0xf05c4, gz: 0xf05c4,
  tar: 0xf05c4, vue: 0xe6a0, svelte: 0xe697, csv: 0xe64a, txt: 0xf09aa, log: 0xf0bc2,
}

/** Terminal cells the glyph and its trailing space take: two with a Nerd Font, none without. */
export const glyphWidth = (nerd: boolean): number => (nerd ? 2 : 0)

/** The glyph for a node: a folder outline open or closed, a link, or a file by its name or extension; empty without a Nerd Font. */
export function fileGlyph(n: FileNode, open: boolean, nerd: boolean): string {
  if (!nerd) return ''
  if (n.kind === 'link') return cp(LINK)
  if (n.kind === 'dir') return cp(open ? FOLDER_OPEN : FOLDER)
  const lower = n.name.toLowerCase()
  const named = NAMES[lower]
  if (named) return cp(named)
  const dot = lower.lastIndexOf('.')
  return cp((dot >= 0 ? EXTS[lower.slice(dot + 1)] : undefined) ?? FILE)
}
