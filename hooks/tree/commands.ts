import type { Tone } from '../../types'

// What a Bash command does to git and to files: the git and gh actions in it, whether it only reads, and which paths it reads.

/** One git or gh action found in a command, with the labels and tone its footer chip shows; `init` when it creates a repository. */
export type GitAction = { kind: string; verb: string; running: string; done: string; tone: Tone; icon: string; init?: boolean }

const ICON = { commit: '●', push: '↑', pull: '↓', branch: '⑂', merge: '⑃', pr: '⇄', github: '◎', stash: '≡', undo: '↶', tag: '⌖', git: '±' }

const GIT_VERBS: Record<string, Omit<GitAction, 'kind'>> = {
  commit: { verb: 'commit', running: 'committing', done: 'committed', tone: 'ok', icon: ICON.commit },
  push: { verb: 'push', running: 'pushing', done: 'pushed', tone: 'mcp', icon: ICON.push },
  pull: { verb: 'pull', running: 'pulling', done: 'pulled', tone: 'read', icon: ICON.pull },
  fetch: { verb: 'fetch', running: 'fetching', done: 'fetched', tone: 'read', icon: ICON.pull },
  checkout: { verb: 'checkout', running: 'switching branch', done: 'branch switched', tone: 'read', icon: ICON.branch },
  switch: { verb: 'switch', running: 'switching branch', done: 'branch switched', tone: 'read', icon: ICON.branch },
  branch: { verb: 'branch', running: 'creating branch', done: 'branch created', tone: 'read', icon: ICON.branch },
  merge: { verb: 'merge', running: 'merging', done: 'merged', tone: 'search', icon: ICON.merge },
  rebase: { verb: 'rebase', running: 'rebasing', done: 'rebased', tone: 'search', icon: ICON.merge },
  'cherry-pick': { verb: 'cherry-pick', running: 'cherry-picking', done: 'cherry-picked', tone: 'search', icon: ICON.merge },
  stash: { verb: 'stash', running: 'stashing', done: 'stashed', tone: 'write', icon: ICON.stash },
  reset: { verb: 'reset', running: 'resetting', done: 'reset done', tone: 'err', icon: ICON.undo },
  restore: { verb: 'restore', running: 'restoring', done: 'restored', tone: 'err', icon: ICON.undo },
  revert: { verb: 'revert', running: 'reverting', done: 'reverted', tone: 'err', icon: ICON.undo },
  add: { verb: 'add', running: 'staging changes', done: 'changes staged', tone: 'ok', icon: ICON.git },
  rm: { verb: 'rm', running: 'removing', done: 'removed', tone: 'err', icon: ICON.git },
  mv: { verb: 'mv', running: 'moving', done: 'moved', tone: 'write', icon: ICON.git },
  tag: { verb: 'tag', running: 'tagging', done: 'tagged', tone: 'search', icon: ICON.tag },
  init: { verb: 'init', running: 'initializing repo', done: 'repo initialized', tone: 'ok', icon: ICON.git, init: true },
  clone: { verb: 'clone', running: 'cloning', done: 'cloned', tone: 'read', icon: ICON.pull, init: true },
}

const GH_VERBS: Record<string, Omit<GitAction, 'kind'>> = {
  'pr create': { verb: 'pr create', running: 'opening PR', done: 'PR opened', tone: 'search', icon: ICON.pr },
  'pr merge': { verb: 'pr merge', running: 'merging PR', done: 'PR merged', tone: 'search', icon: ICON.merge },
  'pr checkout': { verb: 'pr checkout', running: 'checking out PR', done: 'PR checked out', tone: 'read', icon: ICON.pr },
  'pr comment': { verb: 'pr comment', running: 'commenting on PR', done: 'PR commented', tone: 'search', icon: ICON.pr },
  'pr review': { verb: 'pr review', running: 'reviewing PR', done: 'PR reviewed', tone: 'search', icon: ICON.pr },
  'repo clone': { verb: 'repo clone', running: 'cloning', done: 'cloned', tone: 'read', icon: ICON.github, init: true },
  'release create': { verb: 'release create', running: 'publishing release', done: 'release published', tone: 'search', icon: ICON.tag },
  'issue create': { verb: 'issue create', running: 'opening issue', done: 'issue opened', tone: 'search', icon: ICON.github },
}

const READ_ONLY_GIT = new Set(['status', 'log', 'diff', 'show', 'blame', 'rev-parse', 'ls-files', 'grep', 'describe', 'config', 'remote', 'reflog', 'shortlog', 'help', 'version', 'check-ignore'])

const READERS = new Set(['rg', 'grep', 'egrep', 'fgrep', 'find', 'fd', 'fdfind', 'cat', 'head', 'tail', 'bat', 'less', 'more', 'ls', 'eza', 'tree', 'wc', 'sed', 'awk', 'jq'])
const PATTERN_FIRST = new Set(['rg', 'grep', 'egrep', 'fgrep', 'sed', 'awk', 'jq'])
const OUTPUT_PATHS = new Set(['rg', 'grep', 'egrep', 'fgrep', 'find', 'fd', 'fdfind'])
const WRITE_FLAGS = /^-(delete|exec|execdir|ok|okdir|fprint\w*|fls|x|X|-exec|-exec-batch)$/

/** The command split into its simple commands, each a list of words; `seps` collects the operator between each pair. */
function segments(command: string, seps: string[] = []): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let tok = ''
  let quote = ''
  let has = false
  const endTok = () => {
    if (has) cur.push(tok)
    tok = ''
    has = false
  }
  const endSeg = () => {
    endTok()
    if (cur.length) out.push(cur)
    cur = []
  }
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? ''
    if (quote) {
      if (ch === quote) quote = ''
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) tok += command[++i]
      else tok += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (ch === '\\' && i + 1 < command.length) {
      tok += command[++i]
      has = true
    } else if (ch === '#' && !has) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i++
    } else if (ch === ' ' || ch === '\t') endTok()
    else if (ch === '\n' || ch === ';') {
      seps.push(';')
      endSeg()
    } else if (ch === '&' && (command[i - 1] === '>' || command[i + 1] === '>')) {
      tok += ch
      has = true
    } else if (ch === '&' || ch === '|') {
      const twice = command[i + 1] === ch
      if (twice) i++
      seps.push(twice ? ch + ch : ch)
      endSeg()
    } else {
      tok += ch
      has = true
    }
  }
  endSeg()
  if (!quote) return out
  seps.push(';')
  return command
    .split(/&&|\|\||;|\||\n/)
    .map(s => s.trim().split(/\s+/).filter(Boolean))
    .filter(s => s.length > 0)
}

/** The words without a leading `env` and `VAR=value` assignments. */
function stripGlobals(tokens: string[]): string[] {
  const out = [...tokens]
  if (out[0] === 'env') out.shift()
  while (out.length && /^[A-Z_][A-Z0-9_]*=/.test(out[0] ?? '')) out.shift()
  return out
}

/** Index of the git verb, past global options such as `-C dir`. */
function gitVerb(tokens: string[]): number {
  let i = 1
  while (i < tokens.length && (tokens[i] ?? '').startsWith('-')) {
    if (tokens[i] === '-C' || tokens[i] === '-c') i++
    i++
  }
  return i
}

/** Whether a git verb with its arguments changes nothing. */
function gitReadOnly(verb: string, rest: string[]): boolean {
  if (!verb || READ_ONLY_GIT.has(verb)) return true
  if (verb === 'stash') return ['list', 'show'].includes(rest[0] ?? '')
  if (verb === 'branch') return rest.every(t => t.startsWith('-'))
  if (verb === 'tag') return rest.length === 0 || rest.some(t => /^(-l|--list|-n\d*|--contains|--points-at|--merged|--no-merged|-v|--verify)$/.test(t))
  return false
}

/** How many simple commands the command chains and whether every link is `&&`. */
export function chainOf(command: string): { size: number; and: boolean } {
  const seps: string[] = []
  const size = segments(command, seps).length
  return { size, and: seps.every(s => s === '&&') }
}

/** The git and gh actions the command runs, read-only git left out. */
export function gitActions(command: string): GitAction[] {
  const out: GitAction[] = []
  for (const raw of segments(command)) {
    const tokens = stripGlobals(raw)
    const head = tokens[0]?.split('/').pop()
    if (head === 'git') {
      const i = gitVerb(tokens)
      const verb = tokens[i] ?? ''
      const rest = tokens.slice(i + 1)
      if (gitReadOnly(verb, rest)) continue
      const spec = verb === 'checkout' && rest.includes('--') ? GIT_VERBS.restore : GIT_VERBS[verb]
      if (spec) out.push({ kind: `git ${verb}`, ...spec })
    } else if (head === 'gh') {
      const pair = `${tokens[1] ?? ''} ${tokens[2] ?? ''}`
      const spec = GH_VERBS[pair]
      if (spec) out.push({ kind: `gh ${pair}`, ...spec })
    }
  }
  return out
}

/** `p` made absolute against `cwd`, with `~` as `home` and `.` and `..` folded. */
export function resolve(cwd: string, p: string, home = ''): string {
  let path = p
  if (home && (path === '~' || path.startsWith('~/'))) path = home + path.slice(1)
  const parts = path.startsWith('/') ? [''] : cwd.replace(/\/+$/, '').split('/')
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (parts.length > 1) parts.pop()
    } else parts.push(seg)
  }
  const out = parts.join('/').replace(/\/+$/, '')
  return out === '' ? '/' : out
}

/** Whether the command only reads: no redirection to a file and every simple command a known reader. */
export function readOnly(command: string): boolean {
  const bare = ` ${command}`.replace(/\d*>&\d/g, ' ').replace(/(\d*|&)>>?\s*\/dev\/null/g, ' ')
  if (/[^>]>[^>&]|>>/.test(bare)) return false
  return segments(command).every(raw => {
    const tokens = stripGlobals(raw)
    const head = tokens[0]?.split('/').pop() ?? ''
    if (head === 'cd' || head === 'echo' || head === 'printf' || head === 'true' || head === 'pwd') return true
    if (head === 'git') {
      const i = gitVerb(tokens)
      return gitReadOnly(tokens[i] ?? '', tokens.slice(i + 1))
    }
    if (head === 'sed') return !tokens.some(t => /^-i/.test(t))
    if (head === 'find' || head === 'fd' || head === 'fdfind') return !tokens.some(t => WRITE_FLAGS.test(t))
    return READERS.has(head)
  })
}

/** The absolute paths the command's readers were given, plus the paths a search printed in `stdout`; at most 60. */
export function readTargets(command: string, sessionCwd: string, stdout: string, home = ''): string[] {
  let cwd = sessionCwd
  const out = new Set<string>()
  let listsPaths = false
  for (const raw of segments(command)) {
    const tokens = stripGlobals(raw).map(t => t.replace(/^["']|["']$/g, ''))
    const head = tokens[0]?.split('/').pop() ?? ''
    if (head === 'cd' && tokens[1]) {
      cwd = resolve(cwd, tokens[1], home)
      continue
    }
    if (!READERS.has(head)) continue
    if (head === 'sed' && tokens.some(t => /^-i/.test(t))) continue
    if (OUTPUT_PATHS.has(head)) listsPaths = true
    const args = tokens.slice(1)
    let skipPattern = PATTERN_FIRST.has(head) && !args.some(t => t === '-e' || t === '-f' || t === '--files')
    for (let i = 0; i < args.length; i++) {
      const a = args[i] ?? ''
      if (a.startsWith('-')) {
        if (/^-(e|f|g|t|T|m|A|B|C|-glob|-type|-max-count|name|iname|maxdepth|mindepth)$/.test(a)) i++
        continue
      }
      if (skipPattern) {
        skipPattern = false
        continue
      }
      if (/[*?<>|]/.test(a)) continue
      out.add(resolve(cwd, a, home))
    }
  }
  if (listsPaths) {
    for (const line of stdout.split('\n').slice(0, 400)) {
      const path = line.match(/^([^:\0]+?)(?::\d+[:-]|$|:)/)?.[1]?.trim()
      if (path && !path.includes(' ')) out.add(resolve(cwd, path, home))
    }
  }
  return [...out].slice(0, 60)
}
