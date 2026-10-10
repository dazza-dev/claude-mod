import type { ElementTable, RenderSurface } from 'claude-code'

import { artRows, chartRows } from './chart-rows'
import { chartArt } from './chart-art'
import { blockRows } from './prose'
import { codeRows } from './code-rows'
import { diffRows, fenceDiff, newOnly } from './diff-fence'
import { FOLD_ROWS, foldButton, shownCount } from './fold'
import { languageOf } from './highlight'
import { columnWidths, cutCell, tableArt, widthOf } from './markdown'
import type { Segment, Table } from './markdown'
import { inlineMath, mathArt, parseTex } from './math'
import { chartHeading, parseMermaid } from './mermaid'
import type { Chart } from './mermaid'
import { mermaidArt } from './mermaid-art'
import type { Art } from './mermaid-art'
import { splitBlocks } from './blocks'
import type { Icons, Skin } from './skin'
import type { DiffInput } from './svg-diff'
import type { Prefs, Touch } from './types'

export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Markdown' | 'Button' | 'Code' | 'Link'>

/** What a drawing needs: the elements, the palette, the glyphs, the prefs, and optional copy, links, touched files and folds. */
export type Look = {
  ui: Ui
  skin: Skin
  icons: Icons
  prefs: Prefs
  surface: RenderSurface
  copy?: (text: string) => void
  links?: boolean
  touched?: { files: Readonly<Record<string, Touch>>; cwd: string }
  folds?: { open: ReadonlySet<string>; toggle: (key: string) => void }
}

const CELL_PAD = 1
const BESIDE_GAP = 2
const JUSTIFY = { left: 'flex-start', right: 'flex-end', center: 'center' } as const
// Share of the width a table may take at its natural size before it spans the column.
const NATURAL_SHARE = 0.55

/** A grid of cells with the header on the surface band and alternate rows banded; `control` sits on the top border, and past FOLD_ROWS rows it folds under `foldKey`. */
export function tableRows(look: Look, table: Table, maxWidth: number, control?: ReturnType<Ui['Button']>, foldKey = 'fold-table') {
  const { Box, Text } = look.ui
  const rows = table.rows.slice(0, shownCount(look, foldKey, table.rows.length, FOLD_ROWS))
  const { palette } = look.skin
  const widths = columnWidths(table, maxWidth - 4, CELL_PAD * 2)
  const natural = widths.reduce((sum, width) => sum + width + CELL_PAD * 2, 2)
  const isFluid = natural > maxWidth * NATURAL_SHARE
  const size = (i: number) =>
    isFluid ? { width: 0, flexGrow: Math.max(1, widths[i] ?? 1), flexShrink: 1 } : { width: (widths[i] ?? 0) + CELL_PAD * 2, flexShrink: 0 }
  const row = (cells: readonly string[], isHeader: boolean, band: string | undefined) => (
    <Box flexDirection="row" {...(band === undefined ? {} : { backgroundColor: band })}>
      {cells.map((cell, i) => (
        <Box {...size(i)} paddingX={CELL_PAD} justifyContent={JUSTIFY[table.align[i] ?? 'left']}>
          <Text color={palette.fg} bold={isHeader} wrap="truncate-end">
            {cutCell(cell, widths[i] ?? 0)}
          </Text>
        </Box>
      ))}
    </Box>
  )
  const fold = foldButton(look, foldKey, table.rows.length, FOLD_ROWS)
  const frame = (
    <Box
      flexDirection="column"
      marginY={fold === '' ? 1 : 0}
      borderStyle="round"
      borderColor={palette.muted}
      {...(isFluid ? { width: '100%' } : { alignSelf: 'flex-start' as const })}
    >
      {row(table.header, true, palette.surface)}
      {rows.map((cells, i) => row(cells, false, i % 2 === 1 ? palette.zebra : undefined))}
      {control === undefined ? '' : (
        <Box position="absolute" top={-1} right={1}>
          {control}
        </Box>
      )}
    </Box>
  )
  return fold === '' ? frame : (
    <Box flexDirection="column" marginY={1}>
      {frame}
      {fold}
    </Box>
  )
}

/** A table as markdown again, for the clipboard. */
const tableMarkdown = (table: Table): string =>
  [table.header, table.header.map(() => '---'), ...table.rows].map(cells => `| ${cells.join(' | ')} |`).join('\n')

/** A copy button padded to sit on a border line; nothing where nothing can copy. */
export function copyButton(look: Look, key: string, text: string, label = ' Copy ') {
  const { Button } = look.ui
  const copy = look.copy
  return copy === undefined ? undefined : <Button key={key} label={label} plain dimColor onPress={() => copy(text)} />
}

/** A small copy button under a block, flush right; nothing where nothing can copy. */
export function copyRow(look: Look, key: string, text: string, label = 'Copy') {
  const { Box, Button } = look.ui
  const copy = look.copy
  if (copy === undefined) return ''
  return (
    <Box flexDirection="row" justifyContent="flex-end">
      <Button key={key} label={label} plain dimColor onPress={() => copy(text)} />
    </Box>
  )
}

/** The table's two copies on its frame: markdown, and the table as drawn. */
function tableControls(look: Look, key: string, table: Table) {
  const { Box } = look.ui
  const markdown = copyButton(look, key, tableMarkdown(table))
  const art = copyButton(look, `${key}-art`, tableArt(table), ' as text ')
  return markdown === undefined || art === undefined ? undefined : (
    <Box flexDirection="row">
      {markdown}
      {art}
    </Box>
  )
}

/** A formula in cells: stacked fractions, radicals and tall brackets, one Text per row. */
function mathRows(look: Look, tex: string, maxWidth: number, key: string) {
  const { Box, Text } = look.ui
  const { palette } = look.skin
  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={palette.muted} bold>
        FORMULA
      </Text>
      <Box flexDirection="column" marginTop={1} paddingLeft={2}>
        {mathArt(parseTex(tex), Math.max(10, maxWidth - 2)).map(row => (
          <Text color={palette.fg}>{row === '' ? ' ' : row}</Text>
        ))}
      </Box>
      {copyRow(look, key, tex.trim())}
    </Box>
  )
}

/** A diff fence as numbered rows, with copy for the fence and for the code as it stands after the change. */
function diffFence(look: Look, diff: DiffInput, code: string, i: number) {
  const { Box } = look.ui
  const whole = copyButton(look, `copy-${i}`, code)
  const fresh = copyButton(look, `copy-${i}-new`, newOnly(diff), ' new only ')
  const controls = whole === undefined || fresh === undefined ? undefined : (
    <Box flexDirection="row">
      {whole}
      {fresh}
    </Box>
  )
  return diffRows(look, diff, controls, `fold-${i}`)
}

// A Mermaid fence's chart and its drawing in cells, kept per segment and width.
const drawings = new WeakMap<Segment, Map<string, { chart: Chart | null; art: Art | null }>>()

/** The chart a Mermaid fence parses to and its terminal drawing: ours for the kinds we parse, the vendored renderer for the rest. */
function drawingOf(look: Look, segment: Segment & { kind: 'code' }, maxWidth: number) {
  const key = `${maxWidth}|${look.prefs.charts}|${look.prefs.icons}`
  const kept = drawings.get(segment)?.get(key)
  if (kept !== undefined) return kept
  const chart = segment.lang === 'mermaid' && look.prefs.charts ? parseMermaid(segment.code) : null
  const ascii = look.prefs.icons === 'ascii'
  const ours = chart !== null ? chartArt(chart, maxWidth, ascii) : null
  const vendored = segment.lang === 'mermaid' && look.prefs.charts && (chart === null || chart.kind === 'flow' || chart.kind === 'xy')
  const drawing = { chart, art: ours ?? (vendored ? mermaidArt(segment.code, maxWidth, ascii) : null) }
  drawings.set(segment, (drawings.get(segment) ?? new Map()).set(key, drawing))
  return drawing
}

/** One block of a reply, `maxWidth` columns wide. */
function segmentRow(look: Look, segment: Segment, i: number, maxWidth: number) {
  const { Box, Markdown } = look.ui

  if (segment.kind === 'text') {
    const text = look.prefs.math ? inlineMath(segment.text) : segment.text
    return look.prefs.markdown ? (
      <Box flexDirection="column">{blockRows(look, splitBlocks(text, { prose: true }))}</Box>
    ) : (
      <Markdown text={text} />
    )
  }

  if (segment.kind === 'math') return mathRows(look, segment.tex, maxWidth, `copy-${i}`)

  if (segment.kind === 'code') {
    const diff = segment.lang === 'diff' || segment.lang === 'patch' ? fenceDiff(segment.code) : null
    if (diff !== null) return diffFence(look, diff, segment.code, i)

    const { chart, art } = drawingOf(look, segment, maxWidth)
    if (art !== null) {
      return (
        <Box flexDirection="column">
          {artRows(look, art, chart === null ? '' : chartHeading(chart).count)}
          {copyRow(look, `copy-${i}`, segment.code)}
        </Box>
      )
    }
    if (chart !== null && (chart.kind === 'flow' || chart.kind === 'xy' || chart.kind === 'pie')) {
      return (
        <Box flexDirection="column">
          {chartRows(look, chart, maxWidth)}
          {copyRow(look, `copy-${i}`, segment.code)}
        </Box>
      )
    }
    if (languageOf(segment.lang) !== undefined) {
      return codeRows(look, segment.lang, segment.code, copyButton(look, `copy-${i}`, segment.code), `fold-${i}`)
    }
    return (
      <Box flexDirection="column">
        <Markdown text={segment.raw} />
        {copyRow(look, `copy-${i}`, segment.code)}
      </Box>
    )
  }

  return tableRows(look, segment, maxWidth, tableControls(look, `copy-${i}`, segment), `fold-${i}`)
}

/** How wide a block is when it may stand beside another (a table or a drawn diagram), or null for any other block. */
function besideWidth(look: Look, segment: Segment, maxWidth: number): number | null {
  if (segment.kind === 'table') {
    return columnWidths(segment, maxWidth - 4, CELL_PAD * 2).reduce((sum, width) => sum + width + CELL_PAD * 2, 2)
  }
  if (segment.kind !== 'code' || segment.lang !== 'mermaid' || !look.prefs.charts) return null
  const { art } = drawingOf(look, segment, maxWidth)
  return art === null ? null : Math.max(...art.rows.map(row => row.reduce((sum, run) => sum + widthOf(run.text), 0)))
}

type Placed = { segment: Segment; i: number; width: number }

/** Fills rows left to right; a block that does not fit starts the next row. */
function packRun(run: readonly Placed[], maxWidth: number): Placed[][] {
  const rows: Placed[][] = []
  let row: Placed[] = []
  let used = 0
  for (const placed of run) {
    const width = Math.min(placed.width, maxWidth)
    if (row.length > 0 && used + BESIDE_GAP + width > maxWidth) {
      rows.push(row)
      row = []
      used = 0
    }
    used += (row.length === 0 ? 0 : BESIDE_GAP) + width
    row.push({ ...placed, width: row.length === 0 && width === maxWidth ? maxWidth : width })
  }
  return [...rows, ...(row.length === 0 ? [] : [row])].map(placed => (placed.length === 1 ? placed.map(one => ({ ...one, width: maxWidth })) : placed))
}

/** The reply's blocks in rows: tables and diagrams with only blank text between them share a row while it has room. */
export function layoutRows(look: Look, segments: readonly Segment[], maxWidth: number): Placed[][] {
  const rows: Placed[][] = []
  let run: Placed[] = []
  const flush = () => {
    rows.push(...packRun(run, maxWidth))
    run = []
  }
  for (const [i, segment] of segments.entries()) {
    const width = besideWidth(look, segment, maxWidth)
    if (width !== null) {
      run.push({ segment, i, width })
    } else if (!(segment.kind === 'text' && segment.text.trim() === '' && run.length > 0)) {
      flush()
      rows.push([{ segment, i, width: maxWidth }])
    }
  }
  flush()
  return rows
}

/** A reply drawn block by block; `whole`, the reply as written, adds a copy control under it. */
export function replyRows(look: Look, segments: readonly Segment[], maxWidth: number, whole?: string) {
  const { Box } = look.ui
  return (
    <Box flexDirection="column">
      {layoutRows(look, segments, maxWidth).map(row =>
        row.length === 1 ? (
          segmentRow(look, row[0]!.segment, row[0]!.i, maxWidth)
        ) : (
          <Box flexDirection="row" columnGap={BESIDE_GAP} alignItems="flex-start">
            {row.map(placed => (
              <Box flexDirection="column" flexShrink={0} width={placed.width}>
                {segmentRow(look, placed.segment, placed.i, placed.width)}
              </Box>
            ))}
          </Box>
        ),
      )}
      {whole === undefined ? '' : copyRow(look, 'copy-reply', whole, 'copy reply')}
    </Box>
  )
}
