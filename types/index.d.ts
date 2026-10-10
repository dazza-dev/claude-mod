/** One rate-limit window as the API reports it: its kind, percent used and when it resets. */
export type UsageWindow = { kind: string; pct: number; resetsAt?: string; resetText?: string }

/** The usage figures the indicators and the usage panes draw. */
export type Usage = {
  windows: UsageWindow[]
  contextPct?: number
  contextTokens?: number
  contextWindow: number
}

/** One tool call as the activity pane lists it. */
export type Step = { id: string; desc: string; status: 'running' | 'done' | 'error'; turn: number; added?: number; removed?: number }

/** What one finished turn did, as its footer shows it. */
export type TurnStats = { steps: number; added: number; removed: number }

/** One background shell or subagent Claude started, as the background pane lists it. */
export type Shell = {
  id: string
  desc: string
  status: 'running' | 'done' | 'error' | 'stopped'
  startedAt: number
  kind?: 'shell' | 'agent'
  agentType?: string
  doing?: string
  endedAt?: number
  model?: string
  effort?: string
  contextTokens?: number
  contextMax?: number
  tokens?: number
  costUsd?: number
}

/** Which selector the picker pane shows. */
export type Picker = 'model' | 'effort' | 'theme'

/** One entry of the file tree: a folder, a file or a link, with its children loaded or not. */
export type FileNode = { id: string; parent: string; name: string; kind: 'dir' | 'file' | 'link'; hidden: boolean; loaded: boolean }

/** The repository branch as `git status -b` reports it. */
export type Branch = { head: string; upstream: string; ahead: number; behind: number }

/** A palette slot the tree shimmers a file or paints a git action with. */
export type Tone = 'read' | 'write' | 'search' | 'web' | 'mcp' | 'ok' | 'err'

/** One git or gh action Claude ran, as the tree's footer shows it. */
export type Activity = { id: number; kind: string; label: string; state: 'running' | 'done' | 'failed'; detail: string; at: number; tone: Tone; icon: string }

/** The file tree pane: its nodes, what is open and under the cursor, the search, the git status and the rows that shimmer. */
export type FileTree = {
  root: string
  nodes: FileNode[]
  expanded: string[]
  cursor: string
  query: string
  showHidden: boolean
  git: Record<string, string>
  diff: Record<string, [number, number]>
  ignored: string[]
  untrackedDirs: string[]
  top: string
  prefix: string
  branch: Branch | null
  counts: Record<string, [number, number, number]>
  flash: string[]
  flashDim: string[]
  flashOn: boolean
  flashTones: Record<string, Tone>
  scroll: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'friendly-ui': {
      usage: Usage | null
      model: string | null
      effort: string | null
      effortPick: string | null
      cave: string | null
      picker: Picker
      steps: Step[]
      shells: Shell[]
      modelWindows: UsageWindow[]
      turn: number
      userName: string | null
      theme: string | null
      isLight: boolean
      turnStats: Record<string, TurnStats>
      folds: StateFamily<string[]>
      now: number
      openTurns: number[]
      touched: Record<string, 'created' | 'edited'>
      tree: FileTree
      gitActivity: Activity[]
      viewing: string
    }
  }
}
