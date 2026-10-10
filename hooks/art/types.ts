/** Every color a palette names: `fg` body text, `muted` secondary text, `surface` a table header's band, `zebra` every other table row. */
export type SkinSlot =
  | 'read'
  | 'write'
  | 'run'
  | 'search'
  | 'web'
  | 'mcp'
  | 'other'
  | 'user'
  | 'fg'
  | 'muted'
  | 'surface'
  | 'zebra'
  | 'ok'
  | 'err'
  | 'warn'

/** Which reply parts the renderer draws itself. */
export type Prefs = {
  icons: 'unicode' | 'ascii'
  tables: 'on' | 'text' | 'off'
  markdown: boolean
  charts: boolean
  math: boolean
}

/** What this turn did to a file: made it, or changed one that was there. */
export type Touch = 'created' | 'edited'
