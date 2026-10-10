import type { ClientModule } from 'claude-code'

import type { Tone } from '../../types'

// The tree's rows, drawn on the client so hover, the shimmer and the scrollbar drag redraw without a round trip to the engine.

/** One piece of a row's text: its color, weight and strike, or a shimmer tone (dim for a closed folder, `one` for a single sweeping color). */
export type Seg = { t: string; c?: string; b?: boolean; s?: boolean; sh?: Tone; dim?: boolean; one?: boolean }
/** One row: its node id and the segments on its left and right. */
export type RowSpec = { id: string; left: Seg[]; right: Seg[] }
/** What the rows module draws: the rows, the active id, the row backgrounds, the text color of the active row, the color of the `+` after the name on the hovered and active rows, the shimmer shades per tone and the scrollbar. */
export type RowsProps = {
  rows: RowSpec[]
  active: string
  activeBg: string
  activeFg: string
  hoverBg: string
  plus: string
  tones: Record<string, { bright: string[]; dim: string[] }>
  bar?: { pos: number; size: number; thumb: string; track: string }
}

// Cells the `+` zone takes right after a row's name: a space, then the `+` padded on both sides.
const PLUS_WIDTH = 4
type Local = { hover: number; onPlus: boolean; phase: number; drag: boolean; ref: { stop?: () => void } }

const TICK_MS = 90

/** The shade of character `i` under a band of light that sweeps the text as `phase` advances. */
function shimmer(i: number, phase: number, len: number, palette: string[]): string {
  const band = ((phase * 1.6) % (len + 8)) - 4
  const d = Math.abs(i - band)
  return palette[d < 0.8 ? 3 : d < 1.8 ? 2 : d < 2.8 ? 1 : 0] ?? palette[0] ?? '#ffffff'
}

const Rows: ClientModule<RowsProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = { hover: -1, onPlus: false, phase: 0, drag: false, ref: {} }
    surface.setState(state)
  }
  const lit = props.rows.some(r => r.left.some(s => s.sh) || r.right.some(s => s.sh))
  if (lit && !state.ref.stop) {
    state.ref.stop = surface.every(TICK_MS, () => {
      const cur = surface.state
      if (cur) surface.setState({ ...cur, phase: cur.phase + 1 })
    })
  } else if (!lit && state.ref.stop) {
    state.ref.stop()
    state.ref.stop = undefined
  }
  surface.onPointer(e => {
    const cur = surface.state ?? state
    const span = Math.max(1, props.rows.length - 1)
    const onBar = Boolean(props.bar) && e.x >= surface.columns - 1
    if (props.bar && (cur.drag || (onBar && e.type === 'down' && (e.button ?? 'left') === 'left'))) {
      if (e.type === 'up' || e.type === 'leave') {
        surface.setState({ ...cur, drag: false })
        return
      }
      if (e.type === 'down' || e.type === 'move') {
        if (!cur.drag) surface.setState({ ...cur, drag: true, hover: -1 })
        surface.post({ scrollTo: Math.max(0, Math.min(1, e.y / span)) })
        return
      }
    }
    if (e.type === 'leave' || e.y < 0 || e.y >= props.rows.length) {
      if (cur.hover !== -1) surface.setState({ ...cur, hover: -1, onPlus: false })
      return
    }
    const row = props.rows[e.y]
    const leftWidth = row ? row.left.reduce((n, s) => n + [...s.t].length, 0) : 0
    const onPlus = Boolean(row?.id) && !row?.id.startsWith('#') && e.x >= leftWidth && e.x < leftWidth + PLUS_WIDTH
    if (e.type === 'move' && !e.button && (cur.hover !== e.y || cur.onPlus !== onPlus)) surface.setState({ ...cur, hover: e.y, onPlus })
    if (e.type === 'down' && e.button === 'right' && row?.id) {
      surface.post({ copy: row.id, shift: Boolean(e.shift) })
      return
    }
    if (e.type !== 'down' || (e.button ?? 'left') !== 'left' || !row?.id) return
    if (onPlus) {
      surface.post({ add: row.id })
      return
    }
    surface.post({ press: row.id, ctrl: Boolean(e.ctrl), shift: Boolean(e.shift) })
  })
  surface.onKey(e => surface.post({ key: e.key, ctrl: Boolean(e.ctrl), shift: Boolean(e.shift) }))
  const draw = (s: Seg, active = false) => {
    const palette = s.sh ? (s.dim ? props.tones[s.sh]?.dim : props.tones[s.sh]?.bright) : undefined
    if (!palette) {
      return (
        <Text color={active ? props.activeFg : s.c} bold={s.b} strikethrough={s.s}>
          {s.t}
        </Text>
      )
    }
    if (s.one) return <Text color={shimmer(-1, state.phase, s.t.length, palette)}>{s.t}</Text>
    const chars = [...s.t]
    return (
      <Text bold={s.b}>
        {chars.map((ch, i) => (
          <Text color={shimmer(i, state.phase, chars.length, palette)}>{ch}</Text>
        ))}
      </Text>
    )
  }
  return (
    <Box flexDirection="column">
      {props.rows.map((r, i) => {
        const active = Boolean(r.id) && r.id === props.active
        return (
        <Box
          flexDirection="row"
          height={1}
          overflow="hidden"
          backgroundColor={active ? props.activeBg : r.id && i === state.hover ? props.hoverBg : undefined}
        >
          <Box flexShrink={1} overflow="hidden">
            {r.left.map(s => draw(s, active))}
            {r.id && !r.id.startsWith('#') && (i === state.hover || active) ? (
              <Text>
                {' '}
                <Text bold color={i === state.hover && state.onPlus ? props.activeFg : props.plus} backgroundColor={i === state.hover && state.onPlus ? props.plus : undefined}>
                  {' + '}
                </Text>
              </Text>
            ) : (
              <Text>{' '.repeat(PLUS_WIDTH)}</Text>
            )}
          </Box>
          <Box flexGrow={1} />
          {r.right.map(s => draw(s, active))}
          {props.bar && (
            <Text color={i >= props.bar.pos && i < props.bar.pos + props.bar.size ? props.bar.thumb : props.bar.track}>
              {i >= props.bar.pos && i < props.bar.pos + props.bar.size ? '┃' : '│'}
            </Text>
          )}
        </Box>
        )
      })}
    </Box>
  )
}

export default Rows
