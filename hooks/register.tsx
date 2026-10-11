import { atom, memberOf, read, update } from 'claude-code'
import type { BuiltinToolResults, EngineInterface, Register, RenderElement, RenderInput, RenderSurface, Timer } from 'claude-code'

import type { Activity, FileNode, FileTree, Picker, Shell, Step, Tone, TurnStats, Usage, UsageWindow } from '../types'
import { commandSegments } from './art/command-output'
import { diffstat } from './art/format'
import { hyperlinksFrom } from './art/links'
import type { Segment } from './art/markdown'
import { CHART_HINT } from './art/mermaid'
import { replySegments } from './art/reply'
import { codeRows } from './art/code-rows'
import { replyRows } from './art/rows'
import type { Look, Ui } from './art/rows'
import { ICONS } from './art/skin'
import type { Palette as ArtPalette } from './art/skin'
import type { Prefs, Touch } from './art/types'
import { findTheme, paletteFor, skinPaletteFor, themeLabel, THEMES } from './themes'
import type { Palette } from './themes'
import { chainOf, gitActions, readOnly, readTargets, resolve } from './tree/commands'
import type { GitAction } from './tree/commands'
import { fileGlyph, glyphWidth } from './tree/icons'
import { ancestorsOf, dirname, dropBelow, emptyTree, inside, join, mapper, parseGit, parseNumstat, relative, replaceChildren, rollCounts, rollUp, toNodes, underAny, visibleRows } from './tree/model'
import type { Row } from './tree/model'
import type { RowSpec, RowsProps, Seg } from './tree/rows'

type $T = EngineInterface

const usage = atom({ plugin: 'friendly-ui', key: 'usage' } as const, null)
const model = atom({ plugin: 'friendly-ui', key: 'model' } as const, null)
const effort = atom({ plugin: 'friendly-ui', key: 'effort' } as const, null)
const effortPick = atom({ plugin: 'friendly-ui', key: 'effortPick' } as const, null)
const cave = atom({ plugin: 'friendly-ui', key: 'cave' } as const, null)
const picker = atom({ plugin: 'friendly-ui', key: 'picker' } as const, 'model')
const steps = atom({ plugin: 'friendly-ui', key: 'steps' } as const, [])
const turn = atom({ plugin: 'friendly-ui', key: 'turn' } as const, 0)
const userName = atom({ plugin: 'friendly-ui', key: 'userName' } as const, null)
const shells = atom({ plugin: 'friendly-ui', key: 'shells' } as const, [])
const modelWindows = atom({ plugin: 'friendly-ui', key: 'modelWindows' } as const, [])
const DEFAULT_THEME = 'catppuccin'
const theme = atom({ plugin: 'friendly-ui', key: 'theme' } as const, DEFAULT_THEME as string | null)
const isLight = atom({ plugin: 'friendly-ui', key: 'isLight' } as const, false)
const turnStats = atom({ plugin: 'friendly-ui', key: 'turnStats' } as const, {})
const folds = atom({ plugin: 'friendly-ui', key: 'folds' } as const, [] as string[])
const now = atom({ plugin: 'friendly-ui', key: 'now' } as const, 0)
const openTurns = atom({ plugin: 'friendly-ui', key: 'openTurns' } as const, [] as number[])
const touched = atom({ plugin: 'friendly-ui', key: 'touched' } as const, {} as Record<string, Touch>)

const ART_PREFS: Prefs = { icons: 'unicode', tables: 'on', markdown: true, charts: true, math: true }

const WRITES = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

const PANE_ACT = 'ua-activity'
const PANE_SHELLS = 'ua-shells'
const PANE_AGENTS = 'ua-agents'
const PANE_USAGE = 'ua-usage'
const PANE_CONTEXT = 'ua-context'
const PANE_PICK = 'ua-picker'

const MODEL_NAMES: Record<string, string> = { fable: 'Fable 5.1', opus: 'Opus 5.5', sonnet: 'Sonnet 5.5', haiku: 'Haiku 5.5' }
const MODEL_HINTS: Record<string, string> = {
  default: 'what Claude Code recommends',
  best: 'the most capable available',
  fable: 'the most capable',
  opus: 'balanced',
  sonnet: 'fast',
  haiku: 'the cheapest',
  opusplan: 'Opus to plan, Sonnet to execute',
}
const EFFORTS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Very high' },
  { id: 'max', label: 'Max' },
] as const

/** Mascot as 8x2 pixels, drawn in one terminal row of quadrant blocks: O body, # eyes, . empty. */
const MASCOT = ['OO#OO#OO', 'O.OOOO.O']
const MASCOT_COLORS: Record<string, number> = { O: 0xe8875b, '#': 0x15171c }
const DEFAULT_COLOR = 0x01000000
const QUADRANTS: Record<number, number> = {
  0b0000: 0x20, 0b1000: 0x2598, 0b0100: 0x259d, 0b0010: 0x2596, 0b0001: 0x2597,
  0b1100: 0x2580, 0b0011: 0x2584, 0b1010: 0x258c, 0b0101: 0x2590, 0b1001: 0x259a,
  0b0110: 0x259e, 0b1110: 0x259b, 0b1101: 0x259c, 0b1011: 0x2599, 0b0111: 0x259f, 0b1111: 0x2588,
}

/** Encodes bytes as padded standard base64. */
function toBase64(bytes: Uint8Array): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += abc[(n >> 18) & 63]! + abc[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? abc[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? abc[n & 63]! : '='
  }
  return out
}

/** Packs the mascot into one row of Raster cells, each cell a 2x2 quadrant block in at most two colors. */
function mascotCells(): string {
  const cols = MASCOT[0]!.length / 2
  const words = new Uint32Array(cols * 3)
  for (let c = 0; c < cols; c++) {
    const px = [MASCOT[0]![c * 2]!, MASCOT[0]![c * 2 + 1]!, MASCOT[1]![c * 2]!, MASCOT[1]![c * 2 + 1]!]
    const fgKey = 'O'
    const bgKey = px.find(p => p !== fgKey)
    const mask = px.reduce((m, p, i) => (p === fgKey ? m | (1 << (3 - i)) : m), 0)
    words[c * 3] = QUADRANTS[mask] ?? 0x20
    words[c * 3 + 1] = MASCOT_COLORS[fgKey]!
    words[c * 3 + 2] = (bgKey === undefined ? undefined : MASCOT_COLORS[bgKey]) ?? DEFAULT_COLOR
  }
  return toBase64(new Uint8Array(words.buffer))
}

const MASCOT_CELLS = mascotCells()

/** Palette of the chosen theme for Claude Code's current light or dark theme. */
async function colors($: $T): Promise<Palette> {
  return paletteFor(await read($, theme), await read($, isLight))
}

/** Palette color for a usage percentage. */
function pctColor(p: Palette, pct: number | undefined): string {
  if (pct === undefined) return p.muted
  return levelColor(p, compactLevel(pct))
}

/** Palette color for a compaction level. */
const levelColor = (p: Palette, lvl: 0 | 1 | 2): string => [p.ok, p.warn, p.err][lvl]!

/** Applies theme `name` (null for Claude Code's own colors) to this and later sessions. */
async function setTheme($: $T, name: string | null): Promise<void> {
  await update($, theme, () => name)
  await $.store.set('theme', name)
}

let hyperlinks = false

/** Reads once whether the terminal draws OSC 8 links, so bare URLs in replies become links. */
async function readHyperlinks($: $T): Promise<void> {
  hyperlinks = hyperlinksFrom({
    FORCE_HYPERLINK: await $.env.get('FORCE_HYPERLINK'),
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    TERM_PROGRAM_VERSION: await $.env.get('TERM_PROGRAM_VERSION'),
    TERM: await $.env.get('TERM'),
    WT_SESSION: await $.env.get('WT_SESSION'),
    VTE_VERSION: await $.env.get('VTE_VERSION'),
    KONSOLE_VERSION: await $.env.get('KONSOLE_VERSION'),
    TMUX: await $.env.get('TMUX'),
    CI: await $.env.get('CI'),
  })
}

/** Hex palette of the chosen theme, for drawings that need real colors. */
async function artColors($: $T): Promise<ArtPalette> {
  return skinPaletteFor(await read($, theme), await read($, isLight))
}

/** The drawing context for one transcript row: palette, copy to clipboard, links, touched files and the row's folds. */
async function lookFor($: $T, e: { requestId: string; surface: RenderSurface }, ui: Ui, text: string): Promise<Look> {
  const rowFolds = memberOf(folds, e)
  const open = new Set(await read($, rowFolds))
  const files = await read($, touched)
  return {
    ui,
    skin: { name: 'friendly-ui', label: '', palette: await artColors($), spinner: [], done: [] },
    icons: ICONS.unicode,
    prefs: ART_PREFS,
    surface: e.surface,
    copy: (copied: string) => void $.ui.copy({ text: copied, surface: e.surface }).then(r => $.ui.toast(r.isCopied ? '✓ Copied' : 'Could not copy here')),
    links: hyperlinks && /https?:\/\//.test(text),
    ...(Object.keys(files).length > 0 ? { touched: { files, cwd: await $.session.cwd() } } : {}),
    folds: {
      open,
      toggle: (key: string) => void update($, rowFolds, keys => (keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key])),
    },
  }
}

/** Whether Claude Code's theme setting names a light theme. */
async function refreshLight($: $T): Promise<void> {
  const row = (await $.config.list()).find(r => r.key === 'theme')
  const light = typeof row?.value === 'string' && row.value.includes('light')
  if (light !== (await read($, isLight))) await update($, isLight, () => light)
}

/** Compaction suggestion level from context percent: 0 fine, 1 suggested, 2 urgent. */
export function compactLevel(pct: number | undefined): 0 | 1 | 2 {
  if (pct === undefined) return 0
  if (pct >= 80) return 2
  if (pct >= 50) return 1
  return 0
}

// The eight dots of a two-cell braille ring, clockwise from the top: [cell, bit].
const RING_DOTS: readonly (readonly [0 | 1, number])[] = [[1, 0x01], [1, 0x10], [1, 0x20], [1, 0x40], [0, 0x80], [0, 0x04], [0, 0x02], [0, 0x08]]

/** A dial filled clockwise from the top in eighths to `pct`: a Nerd Font pie slice (an outlined circle when empty), or a two-cell braille ring whose whole track shows when nothing is filled. */
export function ring(pct: number | undefined, nerd = false): { glyph: string; isEmpty: boolean } {
  const steps = Math.max(0, Math.min(8, Math.round((pct ?? 0) / 12.5)))
  if (nerd) return { glyph: String.fromCodePoint(steps === 0 ? 0xf0766 : 0xf0a9d + steps), isEmpty: steps === 0 }
  const cells = [0, 0]
  for (const [cell, bit] of RING_DOTS.slice(0, steps === 0 ? 8 : steps)) cells[cell]! |= bit
  return { glyph: cells.map(c => String.fromCodePoint(0x2800 + c)).join(''), isEmpty: steps === 0 }
}

/** Text bar of `width` cells filled to `pct`. */
function bar(pct: number, width: number): string {
  const n = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(n) + '░'.repeat(width - n)
}

/** Short local time or weekday for an ISO reset timestamp. */
function resetLabel(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const isToday = d.toDateString() === new Date().toDateString()
  return isToday ? `Resets ${hm}` : `Resets ${days[d.getDay()]} ${hm}`
}

/** Display label for a model alias or full id, falling back to the raw value. */
export function modelLabel(value: string | null): string {
  if (!value) return '—'
  const isLong = /\[1m\]$/i.test(value)
  const base = value.replace(/\[1m\]$/i, '')
  if (base === 'default') return 'Default'
  if (base === 'best') return 'Best'
  if (base === 'opusplan') return 'Opus plan'
  const key = Object.keys(MODEL_NAMES).find(k => base === k || base.startsWith(`claude-${k}`))
  const name = key ? MODEL_NAMES[key]! : base.replace(/^claude-/, '')
  return isLong ? `${name} · 1M` : name
}

/** Help text for a model alias in the picker. */
function modelHint(alias: string): string {
  const hint = MODEL_HINTS[alias.replace(/\[1m\]$/i, '')] ?? ''
  return /\[1m\]$/i.test(alias) ? `${hint}, 1M token context` : hint
}

/** The model config row: its options and current alias. */
async function modelRow($: $T): Promise<{ options: readonly string[]; value: string | null }> {
  const row = (await $.config.list()).find(r => r.key === 'model')
  return { options: row?.options ?? [], value: typeof row?.value === 'string' ? row.value : null }
}

/** Switches the session model through the config row; false when refused. */
async function setModel($: $T, alias: string): Promise<boolean> {
  try {
    const res = await $.config.set({ key: 'model', value: alias })
    return res.deny === undefined
  } catch {
    return false
  }
}

/** Switches the effort level through the /effort command; false when it fails. */
async function setEffort($: $T, level: string): Promise<boolean> {
  try {
    await $.command.run({ command: 'effort', args: level })
    return true
  } catch {
    return false
  }
}

/** Reads the usage figures from the engine into state. */
async function refreshUsage($: $T): Promise<void> {
  const u = await $.session.usage()
  const snap: Usage = {
    windows: u.rateLimits.map(r => ({ kind: r.kind, pct: r.percentUsed, resetsAt: r.resetsAt })),
    contextPct: u.context.percent,
    contextTokens: u.context.tokens,
    contextWindow: u.context.window,
  }
  await update($, usage, () => snap)
}

/** Per-model weekly windows from the text `/usage` prints, such as `Current week (Fable): 0% used · resets Oct 12 at 3pm (…)`. */
export function parseUsageText(text: string): UsageWindow[] {
  const out: UsageWindow[] = []
  for (const m of text.matchAll(/Current week \(([^)]+)\): (\d+(?:\.\d+)?)% used(?: · resets ([^(\n]+))?/g)) {
    const name = m[1]!.trim()
    if (/all models/i.test(name)) continue
    out.push({ kind: `seven_day_${name.toLowerCase()}`, pct: Number(m[2]), resetText: m[3] ? `Resets ${m[3].trim()}` : undefined })
  }
  return out
}

/** Reads the per-model weekly windows by running `/usage` headless in safe mode, so the child loads no plugins (this mod included) and spends no model tokens. */
async function refreshModelWindows($: $T): Promise<void> {
  const r = await $.process.run(['claude', '-p', '--safe-mode', '/usage'], { timeoutMs: 60000 })
  if (r.exitCode !== 0) return
  const list = parseUsageText(r.stdout)
  await update($, modelWindows, () => list)
}

/** Reads this session's caveman mode from the caveman plugin's flag files. */
async function refreshCave($: $T): Promise<void> {
  const home = await $.env.get('HOME')
  if (!home) return
  const sid = await $.session.id()
  const candidates = [`${home}/.claude/.caveman-sessions/${sid}.mode`, `${home}/.claude/.caveman-active`]
  for (const file of candidates) {
    const r = await $.process.run(['cat', file])
    if (r.exitCode === 0 && r.stdout.trim()) {
      const value = r.stdout.trim()
      await update($, cave, () => value)
      return
    }
  }
  await update($, cave, () => 'off')
}

/** Reads the logged-in account's display name from Claude Code's own config file. */
async function refreshUserName($: $T): Promise<void> {
  const home = await $.env.get('HOME')
  if (!home) return
  const r = await $.process.run(['cat', `${home}/.claude.json`])
  if (r.exitCode !== 0) return
  const account = (JSON.parse(r.stdout) as { oauthAccount?: { displayName?: string } }).oauthAccount
  const name = account?.displayName?.trim()
  if (name) await update($, userName, () => name)
}

/** Refreshes every figure the indicators draw, ignoring a source that fails. */
async function refreshAll($: $T): Promise<void> {
  await Promise.allSettled([refreshUsage($), refreshCave($)])
}

const openPanes = new Set<string>()
let openPickerKind: Picker | null = null

/** Opens a pane, or closes it when it is already open; the open call is made at once so it counts as the person's. */
function togglePane($: $T, id: string, title: string, rows?: number): boolean {
  if (openPanes.has(id)) {
    openPanes.delete(id)
    void $.ui.close({ id })
    return false
  }
  openPanes.add(id)
  void $.ui.open({ id, title, focus: true, closeOnEscape: true, ...(rows ? { rows } : {}) })
  return true
}

/** Opens the selector pane on one of its lists, switches list, or closes it when that list is already shown. */
async function openPicker($: $T, kind: Picker): Promise<void> {
  const titles = { model: 'Model', effort: 'Effort', theme: 'Color theme' }
  if (openPanes.has(PANE_PICK) && openPickerKind !== kind) {
    openPickerKind = kind
    void $.ui.open({ id: PANE_PICK, title: titles[kind], focus: true, closeOnEscape: true })
    await update($, picker, () => kind)
    return
  }
  const isOpen = togglePane($, PANE_PICK, titles[kind], kind === 'theme' ? THEMES.length + 1 : undefined)
  openPickerKind = isOpen ? kind : null
  if (isOpen) await update($, picker, () => kind)
}

/** The shells or agents pane: one row per task, newest first; agents add model, context, tokens and cost, and their totals. */
// Cells between a docked pane's frame and its content.
const PANE_PAD = 1

type PaneEvent = RenderInput<'Pane'>

/** The columns a pane's content may use: the body less the padding a docked pane keeps from its frame. */
function paneWidth(e: PaneEvent): number {
  return e.props.bodyColumns - (e.props.placement === 'dock' ? PANE_PAD : 0)
}

/** A pane's tree set `PANE_PAD` cells from the frame while the pane is docked beside the transcript; untouched inline. */
function padded($: $T, e: PaneEvent, tree: RenderElement): RenderElement {
  if (e.props.placement !== 'dock') return tree
  const { Box } = $.ui.resolve(e)
  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={PANE_PAD}>
      {tree}
    </Box>
  )
}

async function backgroundPane($: $T, e: Parameters<$T['ui']['resolve']>[0], columns: number, kind: 'shell' | 'agent') {
  const { Box, Text } = $.ui.resolve(e)
  const list = [...(await read($, shells))].filter(s => (s.kind === 'agent') === (kind === 'agent')).reverse()
  if (list.length === 0) return <Text dimColor>{kind === 'agent' ? 'No agents yet.' : 'No shells yet.'}</Text>
  const p = await colors($)
  const look: Record<Shell['status'], { icon: string; color: string; label: string }> = {
    running: { icon: '◌', color: p.accent, label: 'Running' },
    done: { icon: '✓', color: p.ok, label: 'Done' },
    error: { icon: '✗', color: p.err, label: 'Failed' },
    stopped: { icon: '■', color: p.muted, label: 'Stopped' },
  }
  const fit = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text.padEnd(n))
  const at = Math.max(await read($, now), Date.now())
  const typeWidth = kind === 'agent' ? 14 : 0
  const doingWidth = Math.max(12, Math.min(26, Math.floor((columns - 16 - typeWidth) / 2)))
  const descWidth = Math.max(12, columns - doingWidth - typeWidth - 16)
  const totalTokens = list.reduce((n, s) => n + (s.tokens ?? 0), 0)
  const totalCost = list.reduce((n, s) => n + (s.costUsd ?? 0), 0)
  const active = list.filter(s => s.status === 'running')
  const finished = list.filter(s => s.status !== 'running')
  const row = (s: Shell) => {
    const isLive = s.status === 'running'
    const state = isLive && s.doing ? s.doing : look[s.status].label
    const ctx = s.contextMax ? Math.min(100, Math.round(((s.contextTokens ?? 0) / s.contextMax) * 100)) : undefined
    const filled = ctx === undefined ? 0 : Math.round(ctx / 12.5)
    const effortLabel = EFFORTS.find(x => x.id === s.effort)?.label
    return (
      <Box key={s.id} flexDirection="column">
        <Text wrap="truncate-end" dimColor={!isLive}>
          <Text color={look[s.status].color}>{`${look[s.status].icon} `}</Text>
          <Text>{fit(s.desc, descWidth)}</Text>
          {kind === 'agent' && <Text dimColor>{`  ${fit(s.agentType ?? 'Agent', typeWidth)}`}</Text>}
          <Text color={look[s.status].color}>{`  ${fit(state, doingWidth)}`}</Text>
          <Text dimColor>{`  ${elapsed((s.endedAt ?? at) - s.startedAt).padStart(6)}`}</Text>
        </Text>
        {kind === 'agent' && (
          <Text wrap="truncate-end" dimColor>
            {`  ${modelLabel(s.model ?? null)}${effortLabel ? ` · ${effortLabel}` : ''}`}
            {ctx !== undefined && <Text>{'  · '}</Text>}
            {ctx !== undefined && <Text color={pctColor(p, ctx)}>{`${'▰'.repeat(filled)}${'▱'.repeat(8 - filled)} ${ctx}%`}</Text>}
            {`  · ${shortTokens(s.tokens ?? 0)} tokens  · ${shortCost(s.costUsd ?? 0)}`}
          </Text>
        )}
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      {active.length > 0 && <Text bold color={p.accent}>{`Running · ${active.length}`}</Text>}
      {active.map(row)}
      {finished.length > 0 && (
        <Box marginTop={active.length > 0 ? 1 : 0}>
          <Text bold color={p.muted}>{`Finished · ${finished.length}`}</Text>
        </Box>
      )}
      {finished.map(row)}
      {kind === 'agent' && (
        <Text color={p.muted}>
          {`Total: ${list.length} ${list.length === 1 ? 'agent' : 'agents'} · ${shortTokens(totalTokens)} tokens · ${shortCost(totalCost)} estimated`}
        </Text>
      )}
    </Box>
  )
}

/** Usage bars in a rounded card, one band per row: name, bar and percent, with its note on the line below. */
function usageCard($: $T, e: Parameters<$T['ui']['resolve']>[0], p: Palette, rows: { label: string; pct: number | undefined; note: string }[], columns: number) {
  const { Box, Text } = $.ui.resolve(e)
  const labelWidth = Math.min(16, Math.max(...rows.map(r => r.label.length)) + 2)
  const width = Math.max(8, Math.min(40, columns - labelWidth - 10))
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={p.muted} alignSelf="flex-start">
      {rows.map((r, i) => (
        <Box key={r.label} flexDirection="column" paddingX={1} marginTop={i > 0 ? 1 : 0}>
          <Text wrap="truncate-end">
            <Text color={p.fg} bold>{r.label.padEnd(labelWidth)}</Text>
            <Text color={pctColor(p, r.pct)}>{bar(r.pct ?? 0, width)}</Text>
            <Text color={pctColor(p, r.pct)} bold>{` ${r.pct === undefined ? '—' : `${Math.round(r.pct)}%`}`.padStart(5)}</Text>
          </Text>
          {r.note && <Text color={p.muted} wrap="truncate-end">{`${' '.repeat(labelWidth)}${r.note}`}</Text>}
        </Box>
      ))}
    </Box>
  )
}

/** Short and long names for a rate-limit window kind: `five_hour`, `seven_day`, `seven_day_<model>`, `spend_limit`. */
export function windowLabel(kind: string): { short: string; long: string } {
  if (kind === 'five_hour') return { short: '5h', long: 'Session 5h' }
  if (kind === 'seven_day') return { short: 'Week', long: 'Week' }
  if (kind === 'spend_limit') return { short: 'Spend', long: 'Spend limit' }
  const modelKey = Object.keys(MODEL_NAMES).find(k => kind.includes(k))
  if (modelKey) {
    const name = MODEL_NAMES[modelKey]!.split(' ')[0]!
    return kind.startsWith('five_hour') ? { short: `${name} 5h`, long: `${name} · 5h` } : { short: name, long: `${name} · week` }
  }
  const spaced = kind.replace(/_/g, ' ')
  const plain = spaced.charAt(0).toUpperCase() + spaced.slice(1)
  return { short: plain, long: plain }
}

/** Background task id a tool result reports, if it started one. */
export function backgroundId(result: unknown, text: string | undefined): string | null {
  const blob = `${text ?? ''} ${JSON.stringify(result ?? '')}`
  const m = blob.match(/background with ID: ([\w-]+)/i) ?? blob.match(/"backgroundTaskId":"([\w-]+)"/)
  return m?.[1] ?? null
}

/** Task id and final status a task notification carries. */
export function taskNotice(text: string): { id: string; status: Shell['status'] } | null {
  const id = text.match(/<task-id>([^<]+)<\/task-id>/)?.[1]
  if (!id) return null
  const raw = text.match(/<status>([^<]+)<\/status>/)?.[1] ?? 'completed'
  const status: Shell['status'] = /fail|error/i.test(raw) ? 'error' : /kill|stop/i.test(raw) ? 'stopped' : 'done'
  return { id: id.trim(), status }
}

/** Elapsed time as `m:ss`, or `h:mm:ss` from one hour. */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// USD per million tokens by model: input, output, cache read, cache write.
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/fable|mythos/, [10, 50, 0.25, 12.5]],
  [/opus-5-5/, [4, 20, 0.2, 5]],
  [/opus/, [5, 25, 0.5, 6.25]],
  [/sonnet/, [2, 10, 0.2, 2.5]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]

type TokenUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }

/** Estimated cost in USD of one request's token counts on `model`. */
export function costOf(model: string, u: TokenUsage): number {
  const [i, o, r, w] = PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? [4, 20, 0.2, 5]
  return ((u.input_tokens ?? 0) * i + (u.output_tokens ?? 0) * o + (u.cache_read_input_tokens ?? 0) * r + (u.cache_creation_input_tokens ?? 0) * w) / 1e6
}

/** All tokens one request counted: input, output and both cache kinds. */
const tokensOf = (u: TokenUsage): number =>
  (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)

/** Context window of `model` in tokens. */
const windowOf = (model: string): number => (/haiku/i.test(model) ? 200_000 : 1_000_000)

/** Token count as `850`, `18k` or `1.2M`. */
export function shortTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** Estimated cost as `~$0,12`, or `<$0,01` under a cent. */
export function shortCost(usd: number): string {
  return usd < 0.01 ? '<$0,01' : `~$${usd.toFixed(2).replace('.', ',')}`
}

/** Band label for the running shells and subagents, or null when none runs. */
export function backgroundLabel(list: Shell[], kind: 'shell' | 'agent'): string | null {
  const live = list.filter(s => s.status === 'running' && (s.kind === 'agent') === (kind === 'agent')).length
  if (live === 0) return null
  return kind === 'agent'
    ? `✦ ${live} ${live === 1 ? 'agent running' : 'agents running'}`
    : `⚙ ${live} ${live === 1 ? 'shell running' : 'shells running'}`
}

/** A shell command as one short line: `$ ` and its first line, a leading `cd … &&` dropped, cut at 60 characters. */
export function shortCommand(command: string): string {
  const line = command.split('\n')[0]!.replace(/^\s*cd\s+\S+\s*&&\s*/, '').replace(/\s+/g, ' ').trim()
  if (!line) return 'Running a command'
  return `$ ${line.length > 60 ? `${line.slice(0, 59)}…` : line}`
}

/** Plain-language sentence for what a tool call does. */
export function friendlyTool(tool: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const file = str(i.file_path).split('/').pop() ?? ''
  switch (tool) {
    case 'Read': return `Reading ${file}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': return `Editing ${file}`
    case 'Write': return `Writing ${file}`
    case 'Bash': return str(i.description) || shortCommand(str(i.command))
    case 'Grep':
    case 'Glob': return 'Searching the code'
    case 'WebFetch': return 'Fetching a web page'
    case 'WebSearch': return 'Searching the web'
    case 'Agent': return str(i.description) || 'Working with an agent'
    case 'Skill': return `Using the ${str(i.skill)} skill`
    case 'ToolSearch': return 'Preparing tools'
    case 'Artifact': return 'Publishing the artifact'
    default: return str(i.description) || `Using ${tool.replace(/^mcp__[^_]+__/, '')}`
  }
}

// The file tree pane: the session folder with git status per file and folder, a search, and a shimmer on what Claude reads, writes and commits.

const tree = atom({ plugin: 'friendly-ui', key: 'tree' } as const, emptyTree(''))
const gitActivity = atom({ plugin: 'friendly-ui', key: 'gitActivity' } as const, [] as Activity[])
const viewing = atom({ plugin: 'friendly-ui', key: 'viewing' } as const, '')

const PANE_TREE = 'ua-tree'
const PANE_VIEW = 'ua-view'
const VIEW_MAX_BYTES = 512_000
const VIEW_MAX_LINES = 3000
const BRANCH_ROW = '#branch'
const UP_ROW = '#up'
const FLASH_MS = 2700
const RUNNING_MAX_MS = 600_000
const NO_REPO_DEPTH = 4
const DOUBLE_MS = 450
const FIND_LIMIT = 200
const READ_REVEAL_LIMIT = 12
const SEARCH_REVEAL_LIMIT = 60
const ACTIVITY_TTL_MS = 45_000
const PRUNE = ['.git', 'node_modules', 'vendor', 'target', '.venv', '__pycache__', 'dist', '.next']
const HOME_PRUNE = ['Library', '.Trash']
const TONES: readonly Tone[] = ['read', 'write', 'search', 'web', 'mcp', 'ok', 'err']

type Since = { ms: number; mark: string }
type Pending = { actions: GitAction[]; ids: number[]; command: string; head: string }
type Job = { actions: GitAction[]; since: Since; initRepo: boolean; readOnly: boolean }
type Background = { p: Pending | null; job: Job; reads: string[] }
type GitOperation = NonNullable<BuiltinToolResults['Bash']['gitOperation']>
type Outcome = { state: 'done' | 'failed'; label: string; detail: string }
type TreePrep = { command: string; cwd: string; actions: GitAction[]; quiet: boolean; since: Since; pending: Pending | null } | null
type ToolOutcome = { deny?: unknown; isError?: boolean; isReadOnly?: boolean; result?: unknown }

let blink: Timer | null = null
let generation = 0
let lastPress = { key: '', at: 0 }
let follow = true
let scanning: Promise<void> | null = null
let scanJobs: Job[] = []
let gitRun: Promise<void> | null = null
let gitNext: Promise<void> | null = null
let queuedReads: string[] = []
let searchIndex: { root: string; paths: Promise<string[]> } | null = null
let activityId = 0
let view = { from: 0, max: 0 }
let nativeScroll = false
let lastSync = 0
let noDock = false
let home = ''
let nerd = false
let platform: Promise<'linux' | 'darwin'> | null = null
let markId = 0
let listSeq = 0
let lastRoot = ''
const listLatest = new Map<string, number>()
const unreadable = new Set<string>()
const background = new Map<string, Background>()

// What a Bash tool result proves about each action, beyond its exit code.
const PROOF: Record<string, (op: GitOperation) => boolean> = {
  push: op => Boolean(op.push),
  merge: op => op.branch?.action === 'merged',
  rebase: op => op.branch?.action === 'rebased',
  'pr create': op => op.pr?.action === 'created',
  'pr merge': op => op.pr?.action === 'merged',
  'pr comment': op => op.pr?.action === 'commented',
}

/** `hex` moved `amount` of the way toward `to`. */
function mix(hex: string, to: string, amount: number): string {
  const at = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16)
  const ch = (i: number) => Math.round(at(hex, i) + (at(to, i) - at(hex, i)) * amount)
  return `#${[1, 3, 5].map(i => Math.max(0, Math.min(255, ch(i))).toString(16).padStart(2, '0')).join('')}`
}

/** The four bright and four dim shades the shimmer sweeps a tone's color through. */
function shades(hex: string): { bright: string[]; dim: string[] } {
  return {
    bright: [hex, mix(hex, '#ffffff', 0.25), mix(hex, '#ffffff', 0.5), mix(hex, '#ffffff', 0.8)],
    dim: [mix(hex, '#000000', 0.6), mix(hex, '#000000', 0.5), mix(hex, '#000000', 0.35), mix(hex, '#000000', 0.2)],
  }
}

/** Symbol and color of a git status letter: + new, • modified, → renamed, × deleted, ! conflict. */
function gitMark(p: ArtPalette, status: string): { glyph: string; color: string } {
  if (status === 'D') return { glyph: '×', color: p.err }
  if (status === 'U') return { glyph: '!', color: p.err }
  if (status === 'A' || status === '?') return { glyph: '+', color: p.ok }
  if (status === 'R' || status === 'C') return { glyph: '→', color: p.read }
  return { glyph: '•', color: p.warn }
}

/** The store key of the icons choice for the terminal program in use, so each terminal keeps its own. */
async function iconsKey($: $T): Promise<string> {
  return `icons:${(await $.env.get('TERM_PROGRAM')) || 'terminal'}`
}

// JXA for Terminal.app, run with the session's tty as its argument: prints `on` when the tab already uses a Nerd Font, `set` after switching the tab to an installed one (a non-Mono family first), else `off`.
const TERMINAL_FONT_JS = `
ObjC.import("AppKit");
function run(argv) {
  var isNerd = function (name) { return /nerd|NFM?P?(-|$)/i.test(name || ""); };
  var fm = $.NSFontManager.sharedFontManager;
  var families = ObjC.deepUnwrap(fm.availableFontFamilies).filter(function (f) { return /nerd font/i.test(f); });
  families.sort(function (a, b) { return (/mono$|propo$/i.test(a) ? 1 : 0) - (/mono$|propo$/i.test(b) ? 1 : 0); });
  var ps = null;
  if (families.length) {
    var members = ObjC.deepUnwrap(fm.availableMembersOfFontFamily(families[0])) || [];
    var regular = members.filter(function (m) { return /^regular$/i.test(m[1]); })[0] || members[0];
    ps = regular ? regular[0] : null;
  }
  var T = Application("Terminal");
  var tty = argv[0] && argv[0] !== "??" ? "/dev/" + argv[0] : null;
  var tab = null;
  var windows = T.windows();
  for (var i = 0; i < windows.length && !tab; i++) {
    var tabs = windows[i].tabs();
    for (var j = 0; j < tabs.length; j++) {
      if (tty ? tabs[j].tty() === tty : tabs[j].selected()) { tab = tabs[j]; break; }
    }
  }
  if (!tab) return "off";
  if (isNerd(tab.currentSettings.fontName())) return "on";
  if (!ps) return "off";
  tab.currentSettings.fontName = ps;
  return "set";
}
`

/** In Terminal.app: whether this tab draws a Nerd Font, switching the tab to an installed one when it does not. */
async function terminalNerdFont($: $T): Promise<boolean> {
  try {
    const tty = (await $.process.run(['sh', '-c', 'ps -o tty= -p $PPID'], { timeoutMs: 3_000 })).stdout.trim()
    const run = await $.process.run(['osascript', '-l', 'JavaScript', '-e', TERMINAL_FONT_JS, tty], { timeoutMs: 10_000 })
    return run.stdout.trim() !== 'off'
  } catch {
    return false
  }
}

/** Whether to draw Nerd Font icons: the choice saved with /icons, else in Terminal.app whether the tab shows one, else whether a Nerd Font file is installed. */
async function hasNerdFont($: $T): Promise<boolean> {
  const saved = await $.store.get(await iconsKey($))
  if (saved === 'on' || saved === 'off') return saved === 'on'
  if ((await $.env.get('TERM_PROGRAM')) === 'Apple_Terminal') return terminalNerdFont($)
  try {
    const run = await $.process.run(
      ['sh', '-c', 'find "$HOME/Library/Fonts" /Library/Fonts "$HOME/.local/share/fonts" /usr/share/fonts -iname "*nerd*" 2>/dev/null | head -n1'],
      { timeoutMs: 5_000 },
    )
    return run.stdout.trim() !== ''
  } catch {
    return false
  }
}

// Installs Blex Mono Nerd Font: the Homebrew cask on macOS when brew is there, else the release zip unpacked into the user's font folder.
const INSTALL_NERD_FONT_SH = `
export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1
if [ "$(uname -s)" = Darwin ]; then
  command -v brew >/dev/null 2>&1 && brew install --cask font-blex-mono-nerd-font >/dev/null 2>&1 && exit 0
  d="$HOME/Library/Fonts"
else
  d="$HOME/.local/share/fonts"
fi
t=$(mktemp -d) || exit 1
mkdir -p "$d" && curl -fsSL -o "$t/f.zip" https://github.com/ryanoasis/nerd-fonts/releases/latest/download/IBMPlexMono.zip && unzip -oqj "$t/f.zip" '*.ttf' -d "$d"
s=$?
rm -rf "$t"
command -v fc-cache >/dev/null 2>&1 && fc-cache -f "$d" >/dev/null 2>&1
exit $s
`

/** Installs a Nerd Font in the background when none is detected and no /icons choice is saved, then redraws with icons. */
async function ensureNerdFont($: $T): Promise<void> {
  if (nerd || (await $.store.get(await iconsKey($)))) return
  await $.process.run(['sh', '-c', INSTALL_NERD_FONT_SH], { timeoutMs: 300_000 }).catch(() => undefined)
  // macOS takes a few seconds to list a font it just installed.
  for (let i = 0; i < 6 && !nerd; i++) {
    if (i) await new Promise<void>(resolve => $.clock.after(3_000, resolve))
    nerd = await hasNerdFont($)
  }
  if (nerd) await patchTree($, () => ({}))
}

/** The platform, asked of `uname` once. */
function osName($: $T): Promise<'linux' | 'darwin'> {
  platform ??= $.process.run(['uname', '-s'], { timeoutMs: 3_000 }).then(r => (r.stdout.trim() === 'Darwin' ? 'darwin' : 'linux'), () => 'linux')
  return platform
}

/** Segments without their undefined fields, so they serialize small. */
function clean(segs: Seg[]): Seg[] {
  for (const seg of segs) for (const k of Object.keys(seg) as (keyof Seg)[]) if (seg[k] === undefined) delete seg[k]
  return segs
}

/** The tree state, every field present. */
async function treeState($: $T): Promise<FileTree> {
  return { ...emptyTree(''), ...(await read($, tree)) }
}

/** Applies `fn`'s fields onto the tree state. */
function patchTree($: $T, fn: (t: FileTree) => Partial<FileTree>): Promise<void> {
  return update($, tree, cur => {
    const t = { ...emptyTree(''), ...cur }
    return { ...t, ...fn(t) }
  })
}

/** The git actions the footer shows. */
const activities = ($: $T): Promise<Activity[]> => read($, gitActivity)

/** Replaces the git actions, keeping the last six. */
const setActivities = ($: $T, fn: (list: Activity[]) => Activity[]): Promise<void> => update($, gitActivity, cur => fn(cur ?? []).slice(-6))

/** `path` with the home folder as `~`. */
function shortPath(path: string): string {
  return home && inside(home, path) ? `~${path.slice(home.length)}` : path
}

/** Whether `path` exists. */
async function exists($: $T, path: string): Promise<boolean> {
  try {
    await $.fs.stat(path)
    return true
  } catch {
    return false
  }
}

/** The nodes of `dir`, links resolved; an empty list for a folder that is gone, null when it cannot be read. */
async function listDir($: $T, dir: string): Promise<FileNode[] | null> {
  try {
    const entries = await $.fs.list(dir)
    const resolved = await Promise.all(
      entries.map(async e => {
        if (!e.isLink) return { name: e.name, kind: e.kind, isLink: false }
        try {
          const target = await $.fs.stat(join(dir, e.name))
          return target.kind === 'dir' ? { name: e.name, kind: 'dir' as const, isLink: false } : { name: e.name, kind: 'file' as const, isLink: true }
        } catch {
          return { name: e.name, kind: 'other' as const, isLink: true }
        }
      }),
    )
    unreadable.delete(dir)
    return toNodes(dir, resolved)
  } catch (err) {
    if (!(await exists($, dir))) return []
    if (!unreadable.has(dir)) {
      unreadable.add(dir)
      $.ui.toast(`Could not list ${shortPath(dir)}: ${err instanceof Error ? err.message : String(err)}`)
    }
    return null
  }
}

/** Lists `dirs` and puts their children in the tree; an older listing never overwrites a newer one. */
async function loadDirs($: $T, dirs: string[]): Promise<Map<string, FileNode[]>> {
  const root = (await treeState($)).root
  const seq = ++listSeq
  for (const dir of dirs) listLatest.set(dir, seq)
  const results = await Promise.all(dirs.map(async dir => [dir, await listDir($, dir)] as const))
  const listed = new Map<string, FileNode[]>()
  for (const [dir, kids] of results) {
    if (listLatest.get(dir) !== seq) continue
    listLatest.delete(dir)
    if (kids) listed.set(dir, kids)
  }
  await patchTree($, t => (t.root === root ? { nodes: replaceChildren(t.nodes, listed) } : {}))
  return listed
}

/** Runs git in `cwd` without taking the index lock. */
function runGit($: $T, cwd: string, args: string[], timeoutMs = 20_000) {
  return $.process.run(['git', '--no-optional-locks', '-C', cwd, ...args], { timeoutMs, env: { GIT_OPTIONAL_LOCKS: '0' } })
}

/** Finds the repository the root is in: its top folder and the root's path inside it. */
async function detectRepo($: $T): Promise<void> {
  const t = await treeState($)
  if (!t.root) return
  let top = ''
  let prefix = ''
  try {
    const run = await runGit($, t.root, ['rev-parse', '--show-prefix', '--show-toplevel'], 5_000)
    const [p = '', tl = ''] = run.exitCode === 0 ? run.stdout.split('\n') : []
    prefix = p.trim()
    top = tl.trim()
  } catch {
    top = ''
  }
  await patchTree($, cur => (cur.root === t.root ? { top, prefix } : {}))
}

/** Reads the git status, the lines changed and the files inside untracked folders into the tree. */
async function readTreeGit($: $T): Promise<void> {
  const t = await treeState($)
  if (!t.root || !t.top) return
  const root = t.root
  try {
    const status = await runGit($, root, ['status', '--porcelain=v1', '-b', '-z', '--ignored=traditional', '--untracked-files=normal', '--', '.'])
    if (status.exitCode !== 0) return
    const parsed = parseGit(status.stdout, root, t.prefix)
    const diff: Record<string, [number, number]> = {}
    const head = await runGit($, root, ['diff', 'HEAD', '--numstat', '-z', '--', '.'])
    if (head.exitCode === 0) parseNumstat(head.stdout, root, t.prefix, diff)
    const files = { ...parsed.files }
    if (parsed.untrackedDirs.length) {
      const others = await runGit($, root, ['ls-files', '-o', '--exclude-standard', '-z', '--', ...parsed.untrackedDirs.map(d => d.slice(root.length + 1) || '.')])
      if (others.exitCode === 0) for (const rel of others.stdout.split('\0').filter(Boolean)) files[join(root, rel)] = 'new'
    }
    for (const path of Object.keys(diff)) if (files[path] === 'new') delete diff[path]
    await patchTree($, cur =>
      cur.root === root
        ? { git: parsed.git, ignored: parsed.ignored, untrackedDirs: parsed.untrackedDirs, branch: parsed.branch, counts: rollCounts(files, root), diff: rollUp(diff, root) }
        : {},
    )
  } catch {
    return
  }
}

/** Reads git once; a call during a read queues one more read after it. */
function refreshTreeGit($: $T): Promise<void> {
  if (!gitRun) {
    gitRun = readTreeGit($).finally(() => {
      gitRun = null
    })
    return gitRun
  }
  const rerun = () => {
    gitNext = null
    return refreshTreeGit($)
  }
  gitNext ??= gitRun.then(rerun, rerun)
  return gitNext
}

/** Opens the tree pane titled after `root`, with the keyboard when `focus`, and notes it as open for the band's button. */
async function openTree($: $T, root: string, focus: boolean): Promise<void> {
  openPanes.add(PANE_TREE)
  await $.ui.open({ id: PANE_TREE, title: `Files: ${root.split('/').pop() || root}`, ...(focus ? { focus: true } : {}) })
}

/** From the band's button: closes the tree pane when it is open, else opens it at its root or the session folder. */
async function toggleTree($: $T): Promise<void> {
  if (openPanes.has(PANE_TREE)) {
    openPanes.delete(PANE_TREE)
    await $.ui.close({ id: PANE_TREE })
    return
  }
  noDock = false
  const t = await treeState($)
  if (t.root && t.nodes.length > 0) {
    await openTree($, t.root, true)
    return
  }
  follow = true
  await resetTree($, await $.session.cwd(), true)
}

/** Starts the tree over at `root`, opens the pane and loads the first level and the git status. */
async function resetTree($: $T, root: string, focus = false): Promise<void> {
  const prev = await treeState($)
  generation += 1
  blink?.cancel()
  blink = null
  lastRoot = root
  searchIndex = null
  await update($, tree, () => ({ ...emptyTree(root), showHidden: prev.showHidden }))
  if (focus || !noDock) await openTree($, root, focus)
  await loadDirs($, [root])
  await detectRepo($)
  await refreshTreeGit($)
}

/** Loads every folder on the way to each path, so the paths have nodes. */
async function revealPaths($: $T, paths: string[]): Promise<void> {
  const tried = new Set<string>()
  for (let pass = 0; pass < 32; pass++) {
    const t = await treeState($)
    const loaded = new Set(t.nodes.filter(n => n.loaded).map(n => n.id))
    if (t.nodes.some(n => n.parent === t.root)) loaded.add(t.root)
    const need = new Set<string>()
    for (const p of paths) {
      for (const dir of [t.root, ...ancestorsOf(p, t.root).reverse()]) {
        if (!loaded.has(dir)) {
          if (!tried.has(dir)) need.add(dir)
          break
        }
      }
    }
    if (need.size === 0) return
    for (const dir of need) tried.add(dir)
    await loadDirs($, [...need])
  }
}

/** `find` arguments that prune the heavy folders, the system folders at home or the disk root, and the paths in `ignored`. */
function pruneArgs(root: string, ignored: string[] = []): string[] {
  const names = root === home || root === '/' ? [...PRUNE, ...HOME_PRUNE] : PRUNE
  return ['(', ...names.flatMap((name, i) => (i === 0 ? ['-name', name] : ['-o', '-name', name])), ...ignored.flatMap(p => ['-o', '-path', p]), ')', '-prune', '-o']
}

/** The paths under `root` changed after `since`, by `find`; `depth` 0 means unlimited. */
async function changedSince($: $T, root: string, since: Since, depth: number, ignored: string[] = []): Promise<string[]> {
  if (root === '/') return []
  const test = since.mark ? ['-newer', since.mark] : ['-newermt', `@${(since.ms / 1000).toFixed(3)}`]
  try {
    const run = await $.process.run(
      ['find', '-H', root, '-xdev', ...(depth ? ['-maxdepth', String(depth)] : []), ...pruneArgs(root, ignored.filter(p => inside(root, p)).slice(0, 40)), ...test, '-print0'],
      { timeoutMs: 8_000 },
    )
    return run.stdout.split('\0').filter(p => p && p !== root)
  } catch {
    return []
  }
}

/** The moment before a tool runs; on macOS, where `find` cannot take a timestamp, a marker file touched now. */
async function sinceNow($: $T, writes: boolean): Promise<Since> {
  const ms = await $.clock.now()
  if (!writes || (await osName($)) !== 'darwin') return { ms, mark: '' }
  const mark = `${((await $.env.get('TMPDIR')) || '/tmp').replace(/\/+$/, '')}/ua-tree-${await $.session.id()}-${++markId}.mark`
  try {
    await $.process.run(['touch', mark], { timeoutMs: 3_000 })
    return { ms, mark }
  } catch {
    return { ms, mark: '' }
  }
}

/** The open folders whose children are loaded. */
function openDirs(t: FileTree): string[] {
  const open = new Set(t.expanded)
  return t.nodes.filter(n => n.kind === 'dir' && n.loaded && open.has(n.id)).map(n => n.id)
}

/** Lights the paths in `tones` for a moment without opening folders or scrolling; a path under a closed folder lights that folder dim instead. */
async function flash($: $T, tones: Record<string, Tone>): Promise<void> {
  const unique = Object.keys(tones)
  if (unique.length === 0) return
  const mine = ++generation
  const root = (await treeState($)).root
  blink?.cancel()
  blink = null
  await patchTree($, cur => {
    if (cur.root !== root) return {}
    const open = new Set(cur.expanded)
    const bright = new Set([...(cur.flashOn ? cur.flash.filter(id => !unique.includes(id)) : []), ...unique])
    const dim = new Set<string>(cur.flashOn ? cur.flashDim : [])
    const all: Record<string, Tone> = cur.flashOn ? { ...cur.flashTones } : {}
    for (const id of unique) {
      const tone = tones[id] ?? 'write'
      all[id] = tone
      if (id === BRANCH_ROW) continue
      const closed = ancestorsOf(id, cur.root).reverse().find(a => !open.has(a))
      if (!closed) continue
      dim.add(closed)
      all[closed] = all[closed] ?? tone
    }
    for (const id of bright) dim.delete(id)
    return { flash: [...bright], flashDim: [...dim], flashOn: true, flashTones: all }
  })
  if (generation !== mine) return
  blink = $.clock.after(FLASH_MS, () => {
    if (generation !== mine) return
    blink = null
    void patchTree($, () => (generation === mine ? { flash: [], flashDim: [], flashOn: false, flashTones: {} } : {}))
  })
}

/** Moves the tree to the session folder when it follows the cwd and the cwd moved; true when it moved. */
async function followCwd($: $T): Promise<boolean> {
  if (!follow) return false
  const cwd = await $.session.cwd()
  const t = await treeState($)
  if (t.root === cwd) return false
  await resetTree($, cwd)
  return true
}

/** Adds the actions to the footer as running and returns their ids. */
async function startGit($: $T, actions: GitAction[]): Promise<number[]> {
  const at = await $.clock.now()
  const ids = actions.map(() => ++activityId)
  await setActivities($, cur => [
    ...cur.filter(a => a.state === 'running' || at - a.at < ACTIVITY_TTL_MS),
    ...actions.map((a, i) => ({ id: ids[i] ?? 0, kind: a.kind, label: a.running, state: 'running' as const, detail: '', at, tone: a.tone, icon: a.icon })),
  ])
  return ids
}

/** The commit `HEAD` points at, or empty. */
async function headOf($: $T, cwd: string): Promise<string> {
  try {
    const run = await runGit($, cwd, ['rev-parse', 'HEAD'], 5_000)
    return run.exitCode === 0 ? run.stdout.trim() : ''
  } catch {
    return ''
  }
}

/** What became of each pending action: a commit by a moved HEAD, the rest by the tool's proof or the chain's exit. */
async function outcomes($: $T, p: Pending, ok: boolean, op: GitOperation | undefined): Promise<Outcome[]> {
  const chain = chainOf(p.command)
  const after = p.actions.some(a => a.verb === 'commit') && !op?.commit ? await headOf($, (await treeState($)).root || (await $.session.cwd())) : ''
  return p.actions.map(a => {
    if (a.verb === 'commit') {
      const sha = op?.commit?.sha || (after && after !== p.head ? after : '')
      return sha ? { state: 'done', label: a.done, detail: sha.slice(0, 7) } : { state: 'failed', label: `${a.verb} failed`, detail: '' }
    }
    if ((op && PROOF[a.verb]?.(op)) || (ok && chain.and)) return { state: 'done', label: a.done, detail: '' }
    if (!ok && chain.and && chain.size === 1) return { state: 'failed', label: `${a.verb} failed`, detail: '' }
    return { state: 'done', label: `ran ${a.kind}`, detail: '' }
  })
}

/** Writes the outcomes onto the footer and drops them after their time. */
async function finishGit($: $T, p: Pending, results: Outcome[]): Promise<void> {
  const at = await $.clock.now()
  await setActivities($, cur =>
    cur.map(a => {
      const i = p.ids.indexOf(a.id)
      const result = i < 0 ? undefined : results[i]
      return result ? { ...a, ...result, at } : a
    }),
  )
  $.clock.after(ACTIVITY_TTL_MS + 500, () => void setActivities($, cur => cur.filter(a => a.state === 'running' || a.at > at)))
}

/** Every pending action marked failed. */
function failAll(p: Pending): Outcome[] {
  return p.actions.map(a => ({ state: 'failed', label: `${a.verb} failed`, detail: '' }))
}

/** The pending actions that did not fail. */
function proven(p: Pending | null, results: Outcome[]): GitAction[] {
  return p ? p.actions.filter((_, i) => results[i]?.state !== 'failed') : []
}

/** Task id and status of each task notification in `text`. */
function taskEnds(text: string): [string, string][] {
  return [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)].flatMap(m => {
    const id = /<task-id>([^<]*)<\/task-id>/.exec(m[1] ?? '')?.[1]?.trim()
    const status = /<status>([^<]*)<\/status>/.exec(m[1] ?? '')?.[1]?.trim()
    return id && status ? [[id, status] as [string, string]] : []
  })
}

/** Finishes the background Bash tasks a prompt's notifications report. */
async function settleBackground($: $T, text: string): Promise<void> {
  if (background.size === 0 || !text.includes('<task-notification>')) return
  for (const [id, status] of taskEnds(text)) {
    const task = background.get(id)
    if (!task) continue
    background.delete(id)
    const ok = status === 'completed'
    const results = task.p ? await outcomes($, task.p, ok, undefined) : []
    if (task.p) await finishGit($, task.p, results)
    queuedReads.push(...task.reads)
    scheduleScan($, { ...task.job, actions: proven(task.p, results) })
  }
}

/** The paths of the last commit, or of the index, as tree paths. */
async function gitPaths($: $T, root: string, prefix: string, committed: boolean): Promise<string[]> {
  const map = mapper(root, prefix)
  try {
    const run = committed
      ? await runGit($, root, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD'], 5_000)
      : await runGit($, root, ['diff', '--cached', '--name-only', '-z'], 5_000)
    return run.exitCode === 0 ? run.stdout.split('\0').filter(Boolean).flatMap(rel => map(rel) ?? []) : []
  } catch {
    return []
  }
}

/** The `.git` folder of the repository `cwd` is in, following a `gitdir:` file; empty outside a repository. */
async function gitDir($: $T, cwd: string): Promise<string> {
  for (let dir = cwd, i = 0; i < 64; i++) {
    try {
      const dot = join(dir, '.git')
      const st = await $.fs.stat(dot)
      if (st.kind === 'dir') return dot
      const ref = /^gitdir:\s*(.+)$/m.exec(String(await $.fs.read(dot)))?.[1]?.trim()
      if (ref) return resolve(dir, ref, home)
    } catch {
      const up = dirname(dir)
      if (up === dir) return ''
      dir = up
      continue
    }
    return ''
  }
  return ''
}

/** Relists the open folders and rereads git, at most every two seconds unless forced. */
async function syncTree($: $T, force = false): Promise<void> {
  const at = await $.clock.now()
  if (!force && at - lastSync < 2_000) return
  lastSync = at
  searchIndex = null
  const t = await treeState($)
  if (!t.root) return
  await loadDirs($, [t.root, ...openDirs(t)])
  if (t.top) await refreshTreeGit($)
}

/** Copies a path to the clipboard, relative to the root unless `absolute`. */
async function copyPath($: $T, id: string, absolute: boolean, surface?: string): Promise<void> {
  const t = await treeState($)
  const text = !absolute && id !== t.root && inside(t.root, id) ? relative(t.root, id) : id
  const done = await $.ui.copy({ text, ...(surface ? { surface: surface as 'terminal' } : {}) })
  $.ui.toast(done.isCopied ? `Copied ${text}` : 'Could not copy the path')
}

/** After Bash jobs: rereads git, finds and reveals what they wrote, reveals what they read, and lights it all. */
async function afterBash($: $T, jobs: Job[]): Promise<void> {
  const reads = queuedReads
  queuedReads = []
  if (await followCwd($)) return
  const t = await treeState($)
  if (!t.root) return
  const actions = jobs.flatMap(j => j.actions)
  const writers = jobs.filter(j => !j.readOnly)
  const since = (writers.length ? writers : jobs).reduce((a, j) => (j.since.ms < a.ms ? j.since : a), (writers[0] ?? jobs[0])?.since ?? { ms: 0, mark: '' })
  const writes = writers.length > 0
  if (jobs.some(j => j.initRepo)) await detectRepo($)
  else if (!t.top && (await exists($, join(t.root, '.git')))) await detectRepo($)
  const probed = await treeState($)
  if (probed.top && (writes || probed.top !== t.top)) await refreshTreeGit($)
  if (writes) searchIndex = null
  const fresh = await treeState($)
  const ignored = new Set(fresh.ignored)
  const tones: Record<string, Tone> = {}
  if (writes) {
    const found = fresh.top ? await changedSince($, t.root, since, 0, fresh.ignored) : await changedSince($, t.root, since, NO_REPO_DEPTH)
    const hits = found.filter(x => inside(t.root, x) && !underAny(x, ignored, t.root)).slice(0, FIND_LIMIT)
    await revealPaths($, hits)
    const loaded = await treeState($)
    const dirs = [...new Set([loaded.root, ...openDirs(loaded), ...hits.map(dirname)])].filter(d => inside(loaded.root, d))
    await loadDirs($, dirs)
    await patchTree($, cur => {
      const ids = new Set(cur.nodes.map(n => n.id))
      return { expanded: cur.expanded.filter(id => ids.has(id)) }
    })
    const present = new Set((await treeState($)).nodes.map(n => n.id))
    const touchTone = actions.find(a => !['commit', 'push', 'add'].includes(a.verb))?.tone ?? 'write'
    for (const id of hits) if (present.has(id)) tones[id] = touchTone
  }
  const found: string[] = []
  for (const r of reads) {
    if (found.length >= READ_REVEAL_LIMIT) break
    if (r !== t.root && inside(t.root, r) && !underAny(r, ignored, t.root) && (await exists($, r))) found.push(r)
  }
  if (found.length) {
    await revealPaths($, found)
    const shown = new Set((await treeState($)).nodes.map(n => n.id))
    for (const r of found) if (shown.has(r) && !tones[r]) tones[r] = 'search'
  }
  if (actions.length) {
    const final = await treeState($)
    const committed = actions.some(a => a.verb === 'commit')
    if ((committed || actions.some(a => a.verb === 'add')) && final.top) {
      const paths = (await gitPaths($, final.root, final.prefix, committed)).filter(x => !underAny(x, ignored, final.root)).slice(0, READ_REVEAL_LIMIT)
      await revealPaths($, paths)
      const shown = new Set((await treeState($)).nodes.map(n => n.id))
      for (const x of paths) if (shown.has(x)) tones[x] = 'ok'
    }
    const pushLike = actions.find(a => ['push', 'pull', 'fetch', 'checkout', 'switch', 'branch', 'merge', 'rebase', 'tag'].includes(a.verb) || a.kind.startsWith('gh '))
    if (pushLike) tones[BRANCH_ROW] = pushLike.tone
    else if (committed) tones[BRANCH_ROW] = 'ok'
  }
  await flash($, tones)
}

/** Queues a job for `afterBash`; jobs that arrive during a scan run together in the next one. */
function scheduleScan($: $T, job: Job): void {
  scanJobs.push(job)
  if (scanning) return
  scanning = (async () => {
    while (scanJobs.length) {
      const jobs = scanJobs
      scanJobs = []
      try {
        await afterBash($, jobs)
      } finally {
        const marks = jobs.map(j => j.since.mark).filter(Boolean)
        if (marks.length) await $.process.run(['rm', '-f', ...marks], { timeoutMs: 3_000 }).catch(() => undefined)
      }
    }
  })().finally(() => {
    scanning = null
  })
}

/** Reveals and lights the paths a tool touched; a write also relists their folders and rereads git. */
async function lightPaths($: $T, paths: string[], tone: Tone): Promise<void> {
  if (await followCwd($)) return
  const t = await treeState($)
  if (!t.root) return
  const within = paths.filter(p => inside(t.root, p))
  if (within.length === 0) return
  if (tone !== 'search') {
    searchIndex = null
    await revealPaths($, within.map(dirname))
    await loadDirs($, [...new Set(within.map(dirname))].filter(d => inside(t.root, d)))
    await refreshTreeGit($)
  } else await revealPaths($, within)
  const tones: Record<string, Tone> = {}
  for (const p of within) tones[p] = tone
  await flash($, tones)
}

/** Opens the folders down to each path and puts the cursor on the last one. */
async function reveal($: $T, paths: string[]): Promise<void> {
  if (await followCwd($)) return
  await revealPaths($, paths)
  await patchTree($, cur => {
    const open = new Set(cur.expanded)
    for (const p of paths) for (const a of ancestorsOf(p, cur.root)) open.add(a)
    return { expanded: [...open], cursor: paths[paths.length - 1] ?? cur.cursor, scroll: null }
  })
}

/** Every file under the root for the search: git's listing in a repository, `find` elsewhere; null when it fails. */
async function listAll($: $T, t: FileTree): Promise<string[] | null> {
  try {
    const run = t.top
      ? await runGit($, t.root, ['ls-files', '-co', '--exclude-standard', '-z'], 10_000)
      : await $.process.run(['find', '-H', t.root, '-xdev', '-maxdepth', t.root === '/' ? '3' : '6', ...pruneArgs(t.root), '-type', 'f', '-print0'], { timeoutMs: 10_000 })
    if (t.top && run.exitCode !== 0) return null
    const paths = run.stdout.split('\0').filter(Boolean)
    if (run.isStdoutTruncated) paths.pop()
    return paths.map(p => (p.startsWith('/') ? p : join(t.root, p)))
  } catch {
    return null
  }
}

/** The search index of the current root, built once per root. */
function indexPaths($: $T, t: FileTree): Promise<string[]> {
  if (searchIndex?.root !== t.root) {
    const index: { root: string; paths: Promise<string[]> } = {
      root: t.root,
      paths: listAll($, t).then(paths => {
        if (paths === null && searchIndex === index) searchIndex = null
        return paths ?? []
      }),
    }
    searchIndex = index
  }
  return searchIndex.paths
}

/** Filters the tree by `query`, loading the folders of the matches so they show. */
async function searchTree($: $T, query: string): Promise<string[]> {
  if (!(await treeState($)).query.trim()) searchIndex = null
  await patchTree($, () => ({ query }))
  const q = query.trim().toLowerCase()
  if (!q) return []
  const t = await treeState($)
  const hits = (await indexPaths($, t)).filter(p => relative(t.root, p).toLowerCase().includes(q)).slice(0, SEARCH_REVEAL_LIMIT)
  if ((await treeState($)).query !== query) return []
  await revealPaths($, hits)
  const shown = await treeState($)
  const ids = new Set(shown.nodes.map(n => n.id))
  const stale = [...new Set(hits.filter(p => !ids.has(p)).map(dirname))].filter(d => inside(shown.root, d))
  if (stale.length) await loadDirs($, stale)
  return hits
}

/** Clears the search and lands the cursor on its first match, folders open. */
async function jumpTo($: $T, query: string): Promise<void> {
  const hits = (await searchTree($, query)).slice(0, 10)
  await patchTree($, cur => {
    const open = new Set(cur.expanded)
    for (const p of hits) for (const a of ancestorsOf(p, cur.root)) open.add(a)
    return { query: '', expanded: [...open], cursor: hits[0] ?? cur.cursor, scroll: null }
  })
}

/** Opens a file in its default app. */
async function openFile($: $T, path: string): Promise<void> {
  const argv = (await osName($)) === 'darwin' ? ['open', '--', path] : ['sh', '-c', 'setsid -f xdg-open "$1" </dev/null >/dev/null 2>&1', 'sh', path]
  try {
    const run = await $.process.run(argv, { timeoutMs: 10_000 })
    if (run.exitCode !== 0) $.ui.toast(`Could not open ${path}: ${run.stderr.trim().split('\n')[0] || `exit ${run.exitCode}`}`)
  } catch {
    $.ui.toast(`Could not open ${path}`)
  }
}

/** How the viewer draws a file: `md` as a reply, `pdf` as its text, else highlighted as the language its extension or name names. */
export function viewKind(path: string): string {
  const name = (path.split('/').pop() ?? '').toLowerCase()
  const ext = /\.([^.]+)$/.exec(name)?.[1] ?? name
  return ext === 'markdown' || ext === 'mdx' ? 'md' : ext
}

/** The text the viewer shows for a file, or a note saying why it shows none. */
async function viewSource($: $T, path: string): Promise<{ text: string } | { note: string }> {
  if (viewKind(path) === 'pdf') {
    try {
      const run = await $.process.run(['pdftotext', '-layout', '-enc', 'UTF-8', path, '-'], { timeoutMs: 20_000 })
      return run.exitCode === 0 ? { text: run.stdout.slice(0, VIEW_MAX_BYTES) } : { note: run.stderr.trim().split('\n')[0] || 'Could not read the PDF' }
    } catch {
      return { note: 'PDF text needs pdftotext: brew install poppler' }
    }
  }
  try {
    const st = await $.fs.stat(path)
    if (st.kind !== 'file') return { note: 'Not a file' }
    if (st.size > VIEW_MAX_BYTES) return { note: `Too large to view here (${Math.round(st.size / 1024)} KB)` }
    const text = String(await $.fs.read(path))
    return text.includes('\u0000') ? { note: 'Binary file' } : { text }
  } catch {
    return { note: 'Could not read the file' }
  }
}

/** Shows a file in the viewer pane, titled after its name, or opens it in its app when the viewer cannot show it. */
async function openViewer($: $T, path: string): Promise<void> {
  if ('note' in (await viewSource($, path))) return openFile($, path)
  await update($, viewing, () => path)
  openPanes.add(PANE_VIEW)
  await $.ui.open({ id: PANE_VIEW, title: `View: ${path.split('/').pop() || path}`, focus: true, closeOnEscape: true })
}

/** Puts the node's path in the prompt box at the cursor: relative to the session folder when inside it, a folder with a trailing slash. */
async function insertPath($: $T, n: FileNode): Promise<void> {
  const cwd = await $.session.cwd()
  const path = inside(cwd, n.id) ? relative(cwd, n.id) : n.id
  await $.prompt.fill({ text: `${path}${n.kind === 'dir' ? '/' : ''} `, mode: 'insert' })
}

/** Opens or closes a folder and moves the cursor there; a file only takes the cursor. */
async function toggleNode($: $T, n: FileNode): Promise<void> {
  if (n.kind === 'dir' && !(await treeState($)).expanded.includes(n.id)) await loadDirs($, [n.id])
  await patchTree($, t => {
    const open = new Set(t.expanded)
    if (n.kind === 'dir') open.has(n.id) ? open.delete(n.id) : open.add(n.id)
    return { expanded: [...open], cursor: n.id }
  })
}

/** Makes a folder the root, or opens a file in its app. */
async function openNode($: $T, n: FileNode): Promise<void> {
  if (n.kind === 'dir') {
    follow = false
    await resetTree($, n.id)
  } else await openFile($, n.id)
}

/** A click toggles a folder or moves the cursor; a second click within `DOUBLE_MS` opens a file in the viewer or puts a folder's path in the prompt box. */
async function pressNode($: $T, n: FileNode): Promise<void> {
  const at = await $.clock.now()
  const isDouble = lastPress.key === n.id && at - lastPress.at < DOUBLE_MS
  lastPress = { key: isDouble ? '' : n.id, at }
  if (!isDouble) {
    await toggleNode($, n)
    return
  }
  if (n.kind === 'dir') await insertPath($, n)
  else await openViewer($, n.id)
}

/** At session start: registers `/tree` and `/icons`, clears a leftover shimmer and opens the pane on the session folder. */
async function treeSessionStart($: $T): Promise<void> {
  await $.command.register({ name: 'tree', description: 'Shows the file tree; args: [path] (defaults to the session folder)' })
  await $.command.register({ name: 'icons', description: 'Nerd Font icons in the tree and the band; args: on | off | auto (saved per terminal)' })
  home = ((await $.env.get('HOME')) || '').replace(/\/+$/, '')
  nerd = await hasNerdFont($)
  void ensureNerdFont($).catch(() => undefined)
  activityId =Math.max(activityId, ...(await activities($)).map(a => a.id))
  void (async () => {
    const t = await treeState($)
    if (t.flashOn) await patchTree($, () => ({ flash: [], flashDim: [], flashOn: false, flashTones: {} }))
    await setActivities($, cur => cur.map(a => (a.state === 'running' ? { ...a, state: 'failed', label: `${a.kind} interrupted` } : a)))
    const cwd = await $.session.cwd()
    if (!t.root || t.nodes.length === 0 || (follow && t.root !== cwd)) await resetTree($, cwd)
    else if (!noDock) await openTree($, t.root, false)
  })().catch(() => undefined)
}

/** On a prompt: settles background tasks, follows the cwd and reveals `@path` mentions. */
async function treePrompt($: $T, text: string): Promise<void> {
  void settleBackground($, text)
  if (!(await followCwd($))) void syncTree($)
  const t = await treeState($)
  const mentions = [...text.matchAll(/@([^\s"'`]+)/g)]
    .map(m => (m[1] ?? '').replace(/[.,;:!?)]+$/, ''))
    .filter(Boolean)
    .map(p => resolve(t.root, p, home))
    .filter(p => inside(t.root, p))
  if (mentions.length) {
    void (async () => {
      const found: string[] = []
      for (const p of mentions) if (await exists($, p)) found.push(p.replace(/\/$/, ''))
      if (found.length) await reveal($, found)
    })()
  }
}

/** Before a tool runs: for Bash and the write tools, the git actions it holds, a marker of the moment, and the footer chips started. */
async function treeBefore($: $T, e: { tool: string; command?: unknown }): Promise<TreePrep> {
  if (e.tool !== 'Edit' && e.tool !== 'Write' && e.tool !== 'NotebookEdit' && e.tool !== 'Bash') return null
  const command = e.tool === 'Bash' && typeof e.command === 'string' ? e.command : ''
  const cwd = e.tool === 'Bash' ? await $.session.cwd() : ''
  const actions = gitActions(command)
  const quiet = !actions.length && readOnly(command)
  const since = await sinceNow($, e.tool === 'Bash' && !quiet)
  const before = actions.some(a => a.verb === 'commit') ? await treeState($) : null
  const head = before?.top ? await headOf($, before.root) : ''
  const pending: Pending | null = actions.length ? { actions, ids: await startGit($, actions), command, head } : null
  return { command, cwd, actions, quiet, since, pending }
}

/** When a tool throws: its git chips fail and its marker goes. */
async function treeFailed($: $T, prep: TreePrep): Promise<void> {
  if (!prep) return
  if (prep.pending) await finishGit($, prep.pending, failAll(prep.pending))
  if (prep.since.mark) void $.process.run(['rm', '-f', prep.since.mark], { timeoutMs: 3_000 }).catch(() => undefined)
}

/** After a tool ran: a Read lights its file; a write lights it and rereads git; Bash settles its git chips and schedules the scan of what it changed. */
async function treeAfter($: $T, prep: TreePrep, e: { tool: string; file_path?: unknown; notebook_path?: unknown }, res: ToolOutcome): Promise<void> {
  if (e.tool === 'Read') {
    if (res.deny === undefined && !res.isError && typeof e.file_path === 'string') void lightPaths($, [e.file_path], 'search')
    return
  }
  if (!prep) return
  const { command, cwd, actions, quiet, since, pending } = prep
  if (pending && res.deny !== undefined) {
    const ids = pending.ids
    void setActivities($, cur => cur.filter(a => !ids.includes(a.id)))
  }
  if (res.deny !== undefined || (res.isError && e.tool !== 'Bash')) {
    if (since.mark) void $.process.run(['rm', '-f', since.mark], { timeoutMs: 3_000 }).catch(() => undefined)
    return
  }
  if (e.tool !== 'Bash') {
    const file = typeof e.file_path === 'string' ? e.file_path : typeof e.notebook_path === 'string' ? e.notebook_path : ''
    if (file) void lightPaths($, [file], 'write')
    return
  }
  const out: Partial<BuiltinToolResults['Bash']> = !res.isError && res.result && typeof res.result === 'object' ? (res.result as Partial<BuiltinToolResults['Bash']>) : {}
  const reads = readTargets(command, cwd, typeof out.stdout === 'string' ? out.stdout : '', home)
  const job: Job = { actions: [], since, initRepo: actions.some(a => a.init), readOnly: quiet || res.isReadOnly === true }
  if (out.backgroundTaskId) background.set(out.backgroundTaskId, { p: pending, job, reads })
  else {
    const results = pending ? await outcomes($, pending, !res.isError, out.gitOperation) : []
    if (pending) await finishGit($, pending, results)
    queuedReads.push(...reads)
    scheduleScan($, { ...job, actions: proven(pending, results) })
  }
  if (follow && /(^|[;&|\s])(cd|pushd|popd)(\s|$)/.test(command)) $.clock.after(400, () => void followCwd($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void refreshAll($)
    void refreshUserName($).catch(() => undefined)
    void refreshModelWindows($).catch(() => undefined)
    $.clock.every(20000, () => void refreshAll($))
    $.clock.every(300000, () => void refreshModelWindows($).catch(() => undefined))
    const saved = await $.store.get('theme')
    // A stored null is the person choosing Claude Code's own colors; nothing stored is a fresh install.
    if (saved === null || (typeof saved === 'string' && findTheme(saved) !== undefined)) await update($, theme, () => saved)
    void refreshLight($).catch(() => undefined)
    void readHyperlinks($).catch(() => undefined)
    $.clock.every(20000, () => void refreshLight($).catch(() => undefined))
    $.clock.every(1000, () => {
      void (async () => {
        if (!openPanes.has(PANE_SHELLS) && !openPanes.has(PANE_AGENTS)) return
        if (!(await read($, shells)).some(s => s.status === 'running')) return
        await update($, now, () => Date.now())
      })()
    })
    await $.command.register({ name: 'palette', description: 'Changes the color theme of the interface (/palette or /palette <name>)' })
    await treeSessionStart($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'palette' }, async ($, e) => {
    const query = e.args.trim()
    if (query) {
      const found = findTheme(query)
      if (found === undefined) return { text: `Unknown theme "${query}". Themes: Claude, ${THEMES.map(t => t.label).join(', ')}.` }
      const name = found === 'claude' ? null : found.name
      await setTheme($, name)
      return { text: `✓ Theme: ${themeLabel(name)}` }
    }
    await openPicker($, 'theme')
    return { text: `Themes: Claude, ${THEMES.map(t => t.label).join(', ')}. Pick one in the pane or type /palette <name>.` }
  })

  on('ui.close', ($, e, next) => {
    openPanes.delete(e.id)
    if (e.id === PANE_PICK) openPickerKind = null
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      void refreshAll($)
      const current = await read($, turn)
      const done = (await read($, steps)).filter(s => s.turn === current)
      const stats: TurnStats = {
        steps: done.length,
        added: done.reduce((n, s) => n + (s.added ?? 0), 0),
        removed: done.reduce((n, s) => n + (s.removed ?? 0), 0),
      }
      // shortcut: keyed by duration because TurnDuration only carries durationMs, so two turns of the same length share a footer; key by a turn id when the engine exposes one.
      await update($, turnStats, all => Object.fromEntries([...Object.entries(all), [String(e.durationMs), stats]].slice(-40)))
      return next(e)
    }
    const status: Shell['status'] = e.reason === 'aborted' ? 'stopped' : e.reason === 'answer' ? 'done' : 'error'
    const id = e.agentId
    const u = e.usage
    await update($, shells, list => list.map((s): Shell => {
      if (s.id !== id) return s
      const unseen = (s.tokens ?? 0) === 0 && u !== undefined
      return {
        ...s, status, endedAt: Date.now(),
        ...(unseen ? { model: u.model || s.model, tokens: tokensOf(u), costUsd: costOf(u.model || s.model || '', u) } : {}),
      }
    }))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const res = await next(e)
    if (res.agentId && e.parentAgentId === undefined) {
      const agent: Shell = {
        id: res.agentId, desc: e.description, status: 'running', startedAt: Date.now(),
        kind: 'agent', agentType: e.subagentType, doing: 'Starting',
        model: res.model, contextMax: windowOf(res.model), contextTokens: 0, tokens: 0, costUsd: 0,
      }
      await update($, shells, list => [...list, agent].slice(-20))
    }
    return res
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const result = yield* next(e)
      const u = result.usage
      if (!u) return result
      const used = u.model || e.model
      const effortNow = typeof e.effort === 'string' ? e.effort : undefined
      await update($, shells, list => list.map((s): Shell => s.id !== agentId ? s : {
        ...s,
        model: used,
        ...(effortNow ? { effort: effortNow } : {}),
        contextTokens: tokensOf(u),
        contextMax: windowOf(used),
        tokens: (s.tokens ?? 0) + tokensOf(u),
        costUsd: (s.costUsd ?? 0) + costOf(used, u),
      }))
      return result
    }
    const ef = await read($, effortPick)
    const step = { ...e, ...(ef ? { effort: ef as 'low' | 'medium' | 'high' | 'xhigh' | 'max' } : {}) }
    await update($, model, () => step.model)
    await update($, effort, () => (step.effort === undefined ? null : String(step.effort)))
    return yield* next(step)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'composer') {
      await update($, turn, n => n + 1)
      await update($, touched, () => ({}))
    }
    const notice = e.origin?.kind === 'task-notification' ? taskNotice(e.text) : null
    if (notice) {
      await update($, shells, list => list.map((s): Shell =>
        s.id === notice.id && s.status === 'running' ? { ...s, status: notice.status, endedAt: Date.now() } : s))
    }
    void treePrompt($, e.text).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const agentId = (e as { agentId?: string }).agentId
    const prep = await treeBefore($, e).catch(() => null)
    const run = async () => {
      try {
        return await next(e)
      } catch (err) {
        await treeFailed($, prep).catch(() => undefined)
        throw err
      }
    }
    if (agentId !== undefined) {
      const doing = friendlyTool(e.tool, e)
      await update($, shells, list => list.map(s => (s.id === agentId && s.status === 'running' ? { ...s, doing } : s)))
      const out = await run()
      void treeAfter($, prep, e, out).catch(() => undefined)
      return out
    }
    const step: Step = { id: e.tool_use_id, desc: friendlyTool(e.tool, e), status: 'running', turn: await read($, turn) }
    await update($, steps, list => [...list, step].slice(-300))
    const res = await run()
    void treeAfter($, prep, e, res).catch(() => undefined)
    const status: Step['status'] = res.deny !== undefined || res.isError === true ? 'error' : 'done'
    const diff = diffstat(res.result) ?? { added: 0, removed: 0 }
    await update($, steps, list => list.map(s => (s.id === step.id ? { ...s, status, ...diff } : s)))
    const file = (e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path
    if (WRITES.has(e.tool) && status === 'done' && typeof file === 'string' && file !== '') {
      const touch: Touch = (res.result as { type?: unknown } | undefined)?.type === 'create' ? 'created' : 'edited'
      await update($, touched, all => (all[file] === 'created' ? all : { ...all, [file]: touch }))
    }
    const args = e as { run_in_background?: boolean; task_id?: string; shell_id?: string }
    if (args.run_in_background && status === 'done' && e.tool !== 'Agent') {
      const id = backgroundId(res.result, res.text)
      const shell: Shell = { id: id ?? e.tool_use_id, desc: step.desc, status: 'running', startedAt: Date.now(), kind: 'shell' }
      await update($, shells, list => [...list, shell].slice(-20))
    }
    const stopped = args.task_id ?? args.shell_id
    if (e.tool === 'TaskStop' && stopped) {
      await update($, shells, list => list.map((s): Shell => (s.id === stopped ? { ...s, status: 'stopped', endedAt: Date.now() } : s)))
    }
    return res
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: 'Thinking' } }),
  )

  on('ui.render', { component: 'ToolUse' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box marginTop={-1} height={0} />
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolGroup' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box marginTop={-1} height={0} />
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolResult' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box marginTop={-1} height={0} />
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'TurnDuration' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    const p = await colors($)
    const stats = (await read($, turnStats))[String(e.props.durationMs)]
    const s = Math.round(e.props.durationMs / 1000)
    const label = s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
    const changed = stats !== undefined && stats.added + stats.removed > 0
    return (
      <Text color={p.muted}>
        <Text color={p.ok}>✓ </Text>
        {`Done in ${label}`}
        {stats && stats.steps > 0 ? `  ·  ${stats.steps} ${stats.steps === 1 ? 'step' : 'steps'}` : ''}
        {changed && '  ·  '}
        {changed && <Text color={p.ok}>{`+${stats.added}`}</Text>}
        {changed && <Text color={p.err}>{` −${stats.removed}`}</Text>}
      </Text>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.origin.kind !== 'composer') return next(e)
    const name = (await read($, userName)) ?? 'You'
    const p = await colors($)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="quote" borderColor={p.user} paddingLeft={1}>
        <Box flexDirection="row" gap={1} marginBottom={1}>
          <Text bold color={p.pillText} backgroundColor={p.user}>
            {' YOU '}
          </Text>
          <Text bold color={p.user}>{name}</Text>
        </Box>
        <Text color={p.fg}>{e.props.text}</Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Markdown, Raster, Text } = ui
    const p = await colors($)
    const width = Math.max(30, (e.viewport?.columns ?? 100) - 4)
    const segments = replySegments(e.props.text, ART_PREFS, e.surface)
    const body = segments === null
      ? <Markdown text={e.props.text} />
      : replyRows(await lookFor($, e, ui, e.props.text), segments, width, segments.length > 1 ? e.props.text : undefined)
    return (
      <Box flexDirection="column" borderStyle="quote" borderColor={p.accent} paddingLeft={1}>
        {e.props.isFirstOfReply && (
          <Box flexDirection="row" gap={1} marginBottom={1}>
            <Raster key="mascot" columns={MASCOT[0]!.length / 2} rows={1} cells={MASCOT_CELLS} />
            <Text color={p.accent} bold>Claude</Text>
          </Box>
        )}
        {body}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.isErrored || e.props.text.length > 9000 || e.props.command === 'palette') return next(e)
    const segments: Segment[] | null = commandSegments(e.props.text, e.props.command)
    if (segments === null) return next(e)
    const width = Math.max(30, (e.viewport?.columns ?? 100) - 2)
    return replyRows(await lookFor($, e, $.ui.resolve(e), e.props.text), segments, width)
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const isHeadless = e.surfaces.length === 0 || e.traits.includes('bare') || e.traits.includes('print')
    if (isHeadless) return result
    return { sections: [...result.sections, { id: 'friendly-ui:charts', text: CHART_HINT, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const mine = await next(e)
    const headers = e.props.questions
      .map(q => (q as { header?: unknown } | null)?.header)
      .filter((x): x is string => typeof x === 'string' && x !== '')
    if (headers.length === 0) return mine
    const p = await colors($)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold color={p.pillText} backgroundColor={p.accent}>{' QUESTION '}</Text>
          {headers.map((h, i) => <Text key={`q-${i}`} color={i === 0 ? p.fg : p.muted} bold={i === 0}>{`${i > 0 ? '· ' : ''}${h}`}</Text>)}
        </Box>
        {mine}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const u = await read($, usage)
    const current = await read($, turn)
    const turnSteps = (await read($, steps)).filter(s => s.turn === current)
    const lvl = compactLevel(u?.contextPct)
    const running = [...turnSteps].reverse().find(s => s.status === 'running')
    const errors = turnSteps.filter(s => s.status === 'error').length
    const windows = [...(u?.windows ?? []), ...(await read($, modelWindows))]
    const background = await read($, shells)
    const shellText = backgroundLabel(background, 'shell')
    const agentText = backgroundLabel(background, 'agent')
    const shellRows = background.filter(s => s.kind !== 'agent').length
    const agentRows = background.filter(s => s.kind === 'agent').length
    const p = await colors($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const more = nerd ? ' \u{eab6}' : ' ▸'
    return (
      <Box flexDirection="column" alignItems="flex-start">
        <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
          {turnSteps.length > 0 && (
            <Button key="activity" plain onPress={() => void togglePane($, PANE_ACT, 'Activity')}>
              {running ? (
                <Text color={p.accent}>{`◌ ${running.desc}`}</Text>
              ) : (
                <Text color={p.ok}>{`✓ ${turnSteps.length} ${turnSteps.length === 1 ? 'step' : 'steps'}`}</Text>
              )}
              {errors > 0 && <Text color={p.err}>{` · ${errors} with ${errors === 1 ? 'an error' : 'errors'}`}</Text>}
              <Text dimColor>{more}</Text>
            </Button>
          )}
        </Box>
        {(shellText || agentText) && (
          <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
            {agentText && (
              <Button key="agents" plain onPress={() => void togglePane($, PANE_AGENTS, 'Agents', Math.min(18, agentRows * 2 + 4))}>
                <Text color={p.accent}>{agentText}</Text>
                <Text dimColor>{more}</Text>
              </Button>
            )}
            {shellText && (
              <Button key="shells" plain onPress={() => void togglePane($, PANE_SHELLS, 'Shells', Math.min(14, shellRows + 3))}>
                <Text color={p.accent}>{shellText}</Text>
                <Text dimColor>{more}</Text>
              </Button>
            )}
          </Box>
        )}
        <Box flexDirection="row" flexWrap="wrap" columnGap={4}>
          <Button key="tree" plain onPress={() => void toggleTree($).catch(() => undefined)}>
            <Text dimColor>{`${nerd ? '\u{eaf7} ' : ''}Files`}</Text>
            <Text dimColor>{more}</Text>
          </Button>
          {windows.length > 0 && (
            <Button key="account" plain onPress={() => void togglePane($, PANE_USAGE, 'Account usage', windows.length * 3 + 2)}>
              <Text dimColor>Usage: </Text>
              {windows.map((w, i) => (
                <Text key={w.kind}>
                  <Text dimColor>{`${i > 0 ? '   ' : ''}${windowLabel(w.kind).short} `}</Text>
                  <Text color={ring(w.pct, nerd).isEmpty ? p.muted : pctColor(p, w.pct)}>{`${ring(w.pct, nerd).glyph} `}</Text>
                  <Text color={pctColor(p, w.pct)}>{`${Math.round(w.pct)}%`}</Text>
                </Text>
              ))}
              <Text dimColor>{more}</Text>
            </Button>
          )}
          {u && (
            <Button key="context" plain onPress={() => void togglePane($, PANE_CONTEXT, 'Conversation context', 8)}>
              <Text dimColor>Context: </Text>
              <Text color={ring(u.contextPct, nerd).isEmpty ? p.muted : levelColor(p, lvl)}>{`${ring(u.contextPct, nerd).glyph} `}</Text>
              <Text color={levelColor(p, lvl)}>{`${u.contextPct ?? 0}%`}</Text>
              {lvl > 0 && <Text color={levelColor(p, lvl)}>{`${nerd ? ' \u{ea6c}' : ' ●'}${lvl === 2 ? ' Compact now' : ' Compact'}`}</Text>}
              <Text dimColor>{more}</Text>
            </Button>
          )}
        </Box>
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'PromptHint' }, async ($, e) => {
    const current = (await modelRow($)).value ?? (await read($, model)) ?? (await $.session.model())
    const ef = (await read($, effortPick)) ?? (await read($, effort))
    const efIndex = EFFORTS.findIndex(x => x.id === ef)
    const cv = await read($, cave)
    const p = await colors($)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Button key="model" plain onPress={() => void openPicker($, 'model')}>
          <Text color={p.user}>{modelLabel(current)}</Text>
          <Text dimColor> ▾</Text>
        </Button>
        <Button key="effort" plain onPress={() => void openPicker($, 'effort')}>
          <Text color={p.accent}>{'▮'.repeat(efIndex + 1)}</Text>
          <Text dimColor>{'▯'.repeat(EFFORTS.length - efIndex - 1)} </Text>
          <Text color={p.user}>{efIndex >= 0 ? EFFORTS[efIndex]!.label : '—'}</Text>
          <Text dimColor> ▾</Text>
        </Button>
        {cv && cv !== 'off' && (
          <Text color={p.accent}>{cv === 'caveman' ? '● Caveman' : `● Caveman ${cv}`}</Text>
        )}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE_PICK }, async ($, e) => padded($, e, await (async (): Promise<RenderElement> => {
    const kind = await read($, picker)
    const p = await colors($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const close = () => void $.ui.close({ id: PANE_PICK })
    if (kind === 'theme') {
      const chosen = await read($, theme)
      const light = await read($, isLight)
      const options = [null, ...THEMES.map(t => t.name)]
      return (
        <Box flexDirection="column">
          {options.map(name => {
            const sw = paletteFor(name, light)
            return (
              <Button key={name ?? 'claude'} plain onPress={async () => {
                await setTheme($, name)
                $.ui.toast(`✓ Theme: ${themeLabel(name)}`)
              }}>
                <Text color={chosen === name ? p.user : p.fg}>{`${chosen === name ? '●' : '○'} ${themeLabel(name).padEnd(14)}`}</Text>
                <Text color={sw.accent}>{' ██'}</Text>
                <Text color={sw.user}>{'██'}</Text>
                <Text color={sw.ok}>{'██'}</Text>
                <Text color={sw.err}>{'██'}</Text>
                <Text dimColor>{name === null ? '  Claude Code colors' : ''}</Text>
              </Button>
            )
          })}
        </Box>
      )
    }
    if (kind === 'model') {
      const { options, value } = await modelRow($)
      return (
        <Box flexDirection="column">
          {options.map(alias => (
            <Button key={alias} plain onPress={async () => {
              close()
              if (await setModel($, alias)) {
                $.ui.toast(`✓ Model: ${modelLabel(alias)}`)
              } else {
                $.ui.toast(`Could not switch to ${modelLabel(alias)}`)
              }
            }}>
              <Text color={value === alias ? p.user : p.fg}>{`${value === alias ? '●' : '○'} ${modelLabel(alias)}`}</Text>
              <Text dimColor>{`  ${modelHint(alias)}`}</Text>
            </Button>
          ))}
        </Box>
      )
    }
    const current = (await read($, effortPick)) ?? (await read($, effort))
    return (
      <Box flexDirection="column">
        {EFFORTS.map(x => (
          <Button key={x.id} plain onPress={async () => {
            close()
            if (await setEffort($, x.id)) {
              await update($, effortPick, () => null)
              await update($, effort, () => x.id)
            } else {
              await update($, effortPick, () => x.id)
            }
            $.ui.toast(`✓ Effort: ${x.label}`)
          }}>
            <Text color={current === x.id ? p.user : p.fg}>{`${current === x.id ? '●' : '○'} ${x.label}`}</Text>
            <Text dimColor>{`  ${x.id}`}</Text>
          </Button>
        ))}
      </Box>
    )
  })()))

  on('ui.render', { component: 'Pane', requestId: PANE_ACT }, async ($, e) => padded($, e, await (async (): Promise<RenderElement> => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const p = await colors($)
    const all = await read($, steps)
    if (all.length === 0) return <Text dimColor>No activity yet.</Text>
    const turns = [...new Set(all.map(s => s.turn))].slice(-5).reverse()
    const latest = turns[0]
    const opened = await read($, openTurns)
    return (
      <Box flexDirection="column">
        {turns.map(t => {
          const isLatest = t === latest
          const turnSteps = all.filter(s => s.turn === t).reverse()
          const isOpen = isLatest || opened.includes(t)
          const errors = turnSteps.filter(s => s.status === 'error').length
          const label = `${isLatest ? 'Latest message' : `Message ${t}`} · ${turnSteps.length} ${turnSteps.length === 1 ? 'step' : 'steps'}`
          return (
            <Box key={`turn-${t}`} flexDirection="column" marginBottom={isOpen ? 1 : 0}>
              {isLatest ? (
                <Text bold>{label}</Text>
              ) : (
                <Button key={`toggle-${t}`} plain onPress={() => void update($, openTurns, list => (list.includes(t) ? list.filter(x => x !== t) : [...list, t]))}>
                  <Text dimColor>{`${isOpen ? '▾' : '▸'} ${label}`}</Text>
                  {errors > 0 && <Text color={p.err}>{` · ${errors} with ${errors === 1 ? 'an error' : 'errors'}`}</Text>}
                </Button>
              )}
              {isOpen && turnSteps.map(s => (
                <Text key={s.id} wrap="truncate-end" dimColor={!isLatest}>
                  <Text color={s.status === 'running' ? p.accent : s.status === 'error' ? p.err : p.ok}>
                    {`${isLatest ? '' : '  '}${s.status === 'running' ? '◌ ' : s.status === 'error' ? '✗ ' : '✓ '}`}
                  </Text>
                  {s.desc}
                </Text>
              ))}
            </Box>
          )
        })}
      </Box>
    )
  })()))

  on('ui.render', { component: 'Pane', requestId: PANE_SHELLS }, async ($, e) => padded($, e, await backgroundPane($, e, paneWidth(e), 'shell')))

  on('ui.render', { component: 'Pane', requestId: PANE_AGENTS }, async ($, e) => padded($, e, await backgroundPane($, e, paneWidth(e), 'agent')))

  on('ui.render', { component: 'Pane', requestId: PANE_USAGE }, async ($, e) => padded($, e, await (async (): Promise<RenderElement> => {
    const u = await read($, usage)
    const windows = [...(u?.windows ?? []), ...(await read($, modelWindows))]
    const { Text } = $.ui.resolve(e)
    if (windows.length === 0) return <Text dimColor>No account usage data yet.</Text>
    const p = await colors($)
    const rows = windows.map(w => ({ label: windowLabel(w.kind).long, pct: w.pct, note: w.resetText ?? resetLabel(w.resetsAt) }))
    return usageCard($, e, p, rows, paneWidth(e))
  })()))

  on('ui.render', { component: 'Pane', requestId: PANE_CONTEXT }, async ($, e) => padded($, e, await (async (): Promise<RenderElement> => {
    const u = await read($, usage)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (!u) return <Text dimColor>No context data yet.</Text>
    const lvl = compactLevel(u.contextPct)
    const p = await colors($)
    const tokens = u.contextTokens === undefined ? '' : `${Math.round(u.contextTokens / 1000)}k of ${Math.round(u.contextWindow / 1000)}k tokens`
    const advice = [
      'Context is light, no need to compact.',
      'Compacting suggested: the context is already half full.',
      'Compact now: near the limit, it will compact on its own soon.',
    ][lvl]
    return (
      <Box flexDirection="column">
        {usageCard($, e, p, [{ label: 'Context', pct: u.contextPct, note: tokens }], paneWidth(e))}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={1}>
          <Text color={levelColor(p, lvl)}>{`● ${advice}`}</Text>
          <Button key="compact" variant="primary" label="⇣ Compact conversation" onPress={async () => {
            await $.ui.close({ id: PANE_CONTEXT })
            $.ui.toast('Compacting the conversation…')
            const res = await $.session.compact()
            if (res.messages === undefined) {
              $.ui.toast(`Not compacted: ${res.skip}`)
            } else {
              const before = res.tokensBefore ? `${Math.round(res.tokensBefore / 1000)}k` : ''
              $.ui.toast(`✓ Conversation compacted${before ? ` (was ${before})` : ''}`)
            }
            await refreshUsage($)
          }} />
        </Box>
      </Box>
    )
  })()))

  on('command.run', { command: 'icons' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    const key = await iconsKey($)
    if (arg === 'on' || arg === 'off') await $.store.set(key, arg)
    else if (arg === 'auto' || arg === '') await $.store.delete(key)
    else return { text: 'Usage: /icons on | off | auto' }
    nerd = await hasNerdFont($)
    await patchTree($, () => ({}))
    if (!nerd) void ensureNerdFont($).catch(() => undefined)
    return { text: `Nerd Font icons ${nerd ? 'on' : `off${arg === 'off' ? '' : ', installing a Nerd Font in the background'}`}${arg === 'on' || arg === 'off' ? ' for this terminal' : ' (auto-detected)'}.` }
  })

  on('command.run', { command: 'tree' }, async ($, e) => {
    const terminal = await $.session.surfaces().then(s => s.includes('terminal'), () => true)
    if (terminal && !e.presentation.isFullscreen) return { text: 'The tree lives in the sidebar, which needs fullscreen: run /tui fullscreen and then /tree.' }
    if (terminal && e.presentation.columns < 110) return { text: 'The tree lives in the sidebar, which needs a terminal at least 110 columns wide. Widen it and run /tree again.' }
    noDock = false
    const arg = (e.args ?? '').trim()
    const cwd = await $.session.cwd()
    follow = !arg
    const root = arg ? resolve(cwd, arg, home) : cwd
    await resetTree($, root, true)
    return { text: `File tree at ${shortPath(root)}${follow ? ' (follows the session folder)' : ''}.` }
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE_TREE || e.element !== 'rows' || !e.data || typeof e.data !== 'object') return next(e)
    const data = e.data as { press?: unknown; add?: unknown; key?: unknown; ctrl?: unknown; shift?: unknown; scrollTo?: unknown; copy?: unknown }
    void syncTree($)
    const t = await treeState($)
    if (typeof data.copy === 'string') {
      await copyPath($, data.copy, Boolean(data.shift), e.surface)
      return {}
    }
    if (typeof data.scrollTo === 'number') {
      const to = Math.round(Math.max(0, Math.min(1, data.scrollTo)) * view.max)
      if (to !== t.scroll) await patchTree($, () => ({ scroll: to }))
      return {}
    }
    if (typeof data.add === 'string') {
      const n = t.nodes.find(x => x.id === data.add)
      if (n) await insertPath($, n)
      return {}
    }
    if (data.press === UP_ROW) {
      follow = false
      await resetTree($, dirname(t.root))
      return {}
    }
    if (typeof data.press === 'string') {
      const n = t.nodes.find(x => x.id === data.press)
      if (!n) return {}
      if (t.scroll === null) await patchTree($, () => ({ scroll: view.from }))
      if (data.ctrl || data.shift) await openNode($, n)
      else await pressNode($, n)
      return {}
    }
    if (typeof data.key !== 'string') return {}
    const rows = visibleRows(t)
    const at = rows.findIndex(r => r.node.id === t.cursor)
    const cur = rows[at]?.node
    const move = (d: number) => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, (at < 0 ? 0 : at) + d))]
      return target ? patchTree($, () => ({ cursor: target.node.id, scroll: null })) : Promise.resolve()
    }
    if (data.key === 'up' || data.key === 'k') await move(-1)
    else if (data.key === 'down' || data.key === 'j') await move(1)
    else if (data.key === 'pageup') await move(-10)
    else if (data.key === 'pagedown') await move(10)
    else if (data.key === 'home') await move(-rows.length)
    else if (data.key === 'end') await move(rows.length)
    else if (cur && (data.key === 'y' || data.key === 'Y')) await copyPath($, cur.id, data.key === 'Y' || Boolean(data.shift), e.surface)
    else if (cur && (data.key === 'right' || data.key === 'l') && cur.kind === 'dir' && !t.expanded.includes(cur.id)) await toggleNode($, cur)
    else if (cur && (data.key === 'left' || data.key === 'h')) {
      if (cur.kind === 'dir' && t.expanded.includes(cur.id)) await toggleNode($, cur)
      else if (cur.parent !== t.root) await patchTree($, () => ({ cursor: cur.parent }))
    } else if (cur && data.key === 'return') await insertPath($, cur)
    else if (cur && data.key === ' ') await toggleNode($, cur)
    else if (cur && cur.kind !== 'dir' && data.key === 'v') await openViewer($, cur.id)
    return {}
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'clear' || e.source === 'resume' || e.source === 'fork') {
      void (async () => {
        nerd = await hasNerdFont($)
        const root = follow || !lastRoot ? await $.session.cwd() : lastRoot
        const t = await treeState($)
        if (t.root !== root || t.nodes.length === 0) await resetTree($, root)
      })().catch(() => undefined)
    }
    const gd = await gitDir($, e.cwd)
    return gd ? { ...result, watchPaths: [...(result.watchPaths ?? []), join(gd, 'index'), join(gd, 'HEAD')] } : result
  })

  on('classic.CwdChanged', async ($, e, next) => {
    const result = await next(e)
    void followCwd($)
    return result
  })

  on('classic.FileChanged', async ($, e, next) => {
    const result = await next(e)
    if (/\/\.git\/|\/(index|HEAD)$/.test(e.file_path)) $.clock.after(300, () => void syncTree($, true))
    return result
  })

  on('ui.focus', { component: 'Pane', requestId: PANE_TREE }, async ($, e, next) => {
    const result = await next(e)
    void syncTree($)
    return result
  })

  on('ui.scroll', { component: 'Pane', requestId: PANE_TREE }, async ($, e, next) => {
    if (nativeScroll) return next(e)
    const t = await treeState($)
    const to = Math.max(0, Math.min(view.max, (t.scroll ?? view.from) + Math.sign(e.by) * Math.max(3, Math.abs(e.by))))
    if (to !== t.scroll) await patchTree($, () => ({ scroll: to }))
    return {}
  })

  on('prompt.attachment', async ($, e, next) => {
    void settleBackground($, e.text)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_VIEW }, async ($, e) => padded($, e, await (async (): Promise<RenderElement> => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Markdown, Text } = ui
    const p = await colors($)
    const path = await read($, viewing)
    const width = Math.max(30, paneWidth(e))
    const kind = viewKind(path)
    const source = await viewSource($, path)
    const lines = 'text' in source ? source.text.split('\n') : []
    const text = lines.length > VIEW_MAX_LINES ? lines.slice(0, VIEW_MAX_LINES).join('\n') : 'text' in source ? source.text : ''
    const { folds: _, ...look } = await lookFor($, e, ui, text)
    const segments = kind === 'md' ? replySegments(text, ART_PREFS, e.surface) : null
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Box flexGrow={1} flexShrink={1}>
            <Text color={p.muted} wrap="truncate-start">{path}</Text>
          </Box>
          <Button key="open" plain dimColor label="↗ Open" onPress={() => void openFile($, path)} />
        </Box>
        {'note' in source ? (
          <Text color={p.warn}>{source.note}</Text>
        ) : kind === 'md' ? (
          segments === null ? <Markdown text={text} /> : replyRows(look, segments, width)
        ) : (
          codeRows(look, kind === 'pdf' ? 'text' : kind, text)
        )}
        {lines.length > VIEW_MAX_LINES && <Text color={p.muted}>{`… ${lines.length - VIEW_MAX_LINES} more lines; open it to see the rest`}</Text>}
      </Box>
    )
  })()))

  on('ui.render', { component: 'Pane', requestId: PANE_TREE }, async ($, e, next) => padded($, e, await (async (): Promise<RenderElement> => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    if (e.surface === 'terminal' && e.props.placement === 'inline') {
      noDock = true
      void $.ui.close({ id: PANE_TREE }).catch(() => undefined)
      const { Box: Empty } = $.ui.resolve(e)
      return <Empty />
    }
    const { Box, Text, Button, Input, Client } = $.ui.resolve(e)
    const t = await treeState($)
    const p = await artColors($)
    const tones = Object.fromEntries(TONES.map(k => [k, shades(p[k])])) as RowsProps['tones']
    nativeScroll = e.surface === 'desktop'
    const at = await $.clock.now()
    const live = (await activities($)).filter(a => at - a.at < (a.state === 'running' ? RUNNING_MAX_MS : ACTIVITY_TTL_MS))
    const latest = [...live].reverse().find(a => a.state === 'running') ?? live[live.length - 1]
    const bright = new Set(t.flashOn ? t.flash : [])
    const dimmed = new Set(t.flashOn ? t.flashDim : [])
    const ignored = new Set(t.ignored)
    const untracked = new Set(t.untrackedDirs)
    const width = Math.max(24, paneWidth(e))
    const rows = visibleRows(t)
    const fixed = 5 + (t.top ? 2 : 1) + (latest ? 1 : 0) + (t.root !== '/' ? 1 : 0)
    const room = nativeScroll ? Math.max(1, rows.length) : Math.max(5, (e.props.scroll?.bodyRows ?? 40) - fixed)
    const isLit = (id: string) => bright.has(id) || dimmed.has(id)
    const focus = t.flashOn ? ([...t.flash].reverse().find(id => id !== BRANCH_ROW) ?? t.cursor) : t.cursor
    const cursorAt = Math.max(0, rows.findIndex(r => r.node.id === focus))
    const litAt = t.flashOn ? rows.findIndex(r => isLit(r.node.id)) : -1
    const cap = Math.max(1, Math.floor(room / 3))
    let from = Math.max(0, Math.min(litAt >= 0 && cursorAt - litAt < room - 2 ? Math.max(0, litAt - 1) : cursorAt - Math.floor(room / 2), rows.length - room))
    let pinned = !nativeScroll && t.flashOn ? rows.slice(0, from).filter(r => isLit(r.node.id)).slice(-cap) : []
    if (pinned.length) {
      const rest = Math.max(3, room - pinned.length)
      from = Math.max(0, Math.min(cursorAt - Math.floor(rest / 2), rows.length - rest))
      pinned = rows.slice(0, from).filter(r => isLit(r.node.id)).slice(-cap)
    }
    const max = Math.max(0, rows.length - room)
    if (t.scroll !== null) {
      from = Math.max(0, Math.min(t.scroll, max))
      pinned = []
    }
    view = { from, max }
    const shown = rows.slice(from, from + room - pinned.length)
    const totals: [number, number] = t.top ? (t.diff[t.root] ?? [0, 0]) : [0, 0]
    const countSegs = (c: [number, number, number] | undefined): Seg[] => {
      if (!c) return []
      const out: Seg[] = []
      if (c[0] > 0) out.push({ t: ` +${c[0]}`, c: p.ok })
      if (c[1] > 0) out.push({ t: ` •${c[1]}`, c: p.warn })
      if (c[2] > 0) out.push({ t: ` ×${c[2]}`, c: p.err })
      return out
    }
    const rootCounts = t.top ? countSegs(t.counts[t.root]) : []
    const header = t.top ? [t.top.split('/').pop() ?? t.top, t.prefix.replace(/\/$/, '')].filter(Boolean).join('/') : t.root.split('/').pop() || t.root

    const rowSpec = (r: Row): RowSpec => {
      const n = r.node
      const own = t.git[n.id]
      const status = own ?? (underAny(dirname(n.id), untracked, t.root) ? '?' : undefined)
      const isIgnored = !status && underAny(n.id, ignored, t.root)
      const mark = status ? gitMark(p, status) : undefined
      const isBright = bright.has(n.id)
      const isDim = !isBright && dimmed.has(n.id)
      const tone = t.flashTones[n.id] ?? 'write'
      const nameColor = isIgnored ? p.muted : (mark?.color ?? (n.hidden ? p.muted : p.fg))
      const loc = t.diff[n.id]
      const locText = loc ? `${loc[0] ? ` +${loc[0]}` : ''}${loc[1] ? ` −${loc[1]}` : ''}` : ''
      const dirCounts = n.kind === 'dir' ? countSegs(t.counts[n.id]) : []
      const badge = dirCounts.length ? '' : mark ? ` ${mark.glyph}` : isIgnored ? ' ⊘' : '  '
      const countsText = dirCounts.map(c => c.t).join('')
      const caret = nerd ? '' : n.kind === 'dir' ? `${r.open ? '▾' : '▸'} ` : '  '
      // 6: the `+` zone's four cells, the scrollbar and one spare cell.
      const cols = Math.max(4, width - r.depth * 3 - 6 - caret.length - glyphWidth(nerd) - locText.length - badge.length - countsText.length)
      const name = n.name.length > cols ? `${n.name.slice(0, cols - 1)}…` : n.name
      const glyph = fileGlyph(n, r.open, nerd)
      const isLitRow = isBright || isDim
      const left: Seg[] = [
        { t: '   '.repeat(r.depth) },
        ...(caret === '' ? [] : [{ t: caret, c: p.muted }]),
        ...(glyph === '' ? [] : [isLitRow ? { t: `${glyph} `, sh: tone, dim: isDim, one: true } : { t: `${glyph} `, c: p.muted }]),
        isLitRow ? { t: name, sh: tone, dim: isDim, b: isBright } : { t: name, c: nameColor, b: n.id === t.cursor, s: status === 'D' && n.kind !== 'dir' },
      ]
      const right: Seg[] = []
      if (loc && loc[0] > 0) right.push({ t: ` +${loc[0]}`, c: p.ok })
      if (loc && loc[1] > 0) right.push({ t: ` −${loc[1]}`, c: p.err })
      right.push(...dirCounts)
      if (badge) right.push({ t: badge, c: mark?.color ?? p.muted })
      return { id: n.id, left: clean(left), right: clean(right) }
    }

    const note = (text: string): RowSpec => ({ id: '', left: [{ t: text, c: p.muted }], right: [] })
    const upRow: RowSpec = { id: UP_ROW, left: [{ t: nerd ? '' : '▴ ' }, ...(nerd ? [{ t: '\u{eaf7} ', c: p.muted }] : []), { t: '..', c: p.muted }], right: [] }
    const specs: RowSpec[] = [
      ...(t.root !== '/' ? [upRow] : []),
      ...(rows.length === 0 ? [note('empty')] : []),
      ...pinned.map(rowSpec),
      ...(pinned.length > 0 ? [note('  ⋮')] : []),
      ...shown.map(rowSpec),
    ]
    const barSize = Math.max(1, Math.round((specs.length * shown.length) / Math.max(1, rows.length)))
    const scrollbar =
      !nativeScroll && rows.length > shown.length + pinned.length
        ? { pos: max ? Math.round((from / max) * (specs.length - barSize)) : 0, size: barSize, thumb: p.write, track: p.muted }
        : undefined

    const branchRow = () => {
      if (!t.top || !t.branch) return null
      const b = t.branch
      const isFlash = bright.has(BRANCH_ROW)
      const flashColor = p[t.flashTones[BRANCH_ROW] ?? 'mcp']
      return (
        <Box flexDirection="row" height={1} overflow="hidden">
          <Box flexDirection="row" flexShrink={0}>
            <Text color={isFlash ? flashColor : p.write}>⑂ </Text>
            <Text bold color={isFlash ? flashColor : p.fg}>{b.head}</Text>
            {b.ahead > 0 && <Text color={p.mcp}>{` ↑${b.ahead}`}</Text>}
            {b.behind > 0 && <Text color={p.read}>{` ↓${b.behind}`}</Text>}
          </Box>
          {b.upstream && (
            <Box flexShrink={1} overflow="hidden">
              <Text color={p.muted} wrap="truncate-end">{` ${b.upstream}`}</Text>
            </Box>
          )}
          <Box flexGrow={1} />
          <Box flexDirection="row" flexShrink={0}>
            {totals[0] > 0 && <Text color={p.ok}>{` +${totals[0]}`}</Text>}
            {totals[1] > 0 && <Text color={p.err}>{` −${totals[1]}`}</Text>}
            {rootCounts.map(c => (
              <Text color={c.c}>{c.t}</Text>
            ))}
            {rootCounts.length === 0 && totals[0] === 0 && totals[1] === 0 && <Text color={p.muted}> clean</Text>}
          </Box>
        </Box>
      )
    }

    const chip = (a: Activity) => {
      const color = p[a.state === 'failed' ? 'err' : a.tone]
      const hash = a.state === 'done' && a.kind === 'git commit' ? (a.detail.split(' ')[0] ?? '') : ''
      return (
        <Box flexDirection="row" marginLeft={2}>
          <Text color={color}>{`${a.icon} `}</Text>
          <Text bold={a.state === 'running'} color={color}>{a.state === 'running' ? `${a.label}…` : a.label}</Text>
          {hash && <Text color={p.muted}>{` ${hash}`}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" minHeight={Math.max(1, e.props.scroll?.bodyRows ?? 1)}>
        <Text bold color={p.write} wrap="truncate-start">{header}</Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button key="cwd" plain dimColor={!follow} label={`${nerd ? '\u{eb06}' : '⌂'} Root`} onPress={() => void (async () => {
            follow = true
            await resetTree($, await $.session.cwd())
          })()} />
          <Button key="refresh" plain dimColor label={`${nerd ? '\u{eb37}' : '↻'} Refresh`} onPress={() => void (async () => {
            const cur = await treeState($)
            searchIndex = null
            await loadDirs($, [cur.root, ...cur.expanded])
            await detectRepo($)
            await refreshTreeGit($)
            if (cur.query.trim()) await searchTree($, cur.query)
          })()} />
          <Button key="hidden" plain dimColor={!t.showHidden} label={`${nerd ? (t.showHidden ? '\u{eae6}' : '\u{eae7}') : t.showHidden ? '◉' : '○'} Hidden`} onPress={() => void patchTree($, cur => ({ showHidden: !cur.showHidden }))} />
          <Button key="collapse" plain dimColor label={`${nerd ? '\u{eac5}' : '⊟'} Collapse`} onPress={() => void patchTree($, cur => ({ expanded: [], nodes: dropBelow(cur.nodes, cur.nodes.filter(x => x.parent === cur.root && x.kind === 'dir').map(x => x.id)) }))} />
        </Box>
        <Box flexDirection="row" borderStyle="round" borderColor={t.query ? p.write : p.muted} paddingX={1} gap={1}>
          <Text color={p.muted}>{nerd ? '\u{f002}' : '⌕'}</Text>
          <Box flexGrow={1}>
            <Input key="q" placeholder="Search files…" submitLabel="go" autoFocus value={t.query} onInput={(v: string) => void searchTree($, v)} onSubmit={(v: string) => void jumpTo($, v)} />
          </Box>
          {t.query ? <Button key="clear" plain dimColor label="×" onPress={() => void searchTree($, '')} /> : null}
        </Box>
        <Client
          key="rows"
          module="./tree/rows.tsx"
          props={{ rows: specs, active: t.cursor, activeBg: p.muted, activeFg: p.surface, hoverBg: p.surface, plus: p.write, tones, ...(scrollbar ? { bar: scrollbar } : {}) } satisfies RowsProps}
        />
        <Box flexGrow={1} />
        {branchRow()}
        {!t.top && <Text color={p.muted}>± no git repo · status shows after git init</Text>}
        {latest && (
          <Box flexDirection="row">
            <Box flexGrow={1} />
            {chip(latest)}
          </Box>
        )}
        {t.top && (
          <Box flexDirection="row" gap={2}>
            <Text dimColor><Text color={p.ok}>+</Text> new</Text>
            <Text dimColor><Text color={p.warn}>•</Text> modified</Text>
            <Text dimColor><Text color={p.err}>×</Text> deleted</Text>
            <Text dimColor><Text color={p.read}>→</Text> renamed</Text>
          </Box>
        )}
      </Box>
    )
  })()))
}
