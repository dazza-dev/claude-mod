import { expect, mock, test } from 'claude-code/testing'

import { chainOf, gitActions, readOnly, readTargets, resolve } from '../hooks/tree/commands.ts'
import { fileGlyph, glyphWidth } from '../hooks/tree/icons.ts'
import { ancestorsOf, emptyTree, parseGit, parseNumstat, replaceChildren, rollCounts, rollUp, toNodes, visibleRows } from '../hooks/tree/model.ts'

const ROOT = '/p/app'

test('reads the branch, a letter per path and folder, untracked folders and ignored paths from git status', async () => {
  const status = '## main...origin/main [ahead 2, behind 1]\0 M src/a.ts\0?? notes.md\0?? tmp/\0!! dist/\0D  old.txt\0R  b.ts\0a.ts\0'
  const g = parseGit(status, ROOT, '')
  expect(g.branch).toEqual({ head: 'main', upstream: 'origin/main', ahead: 2, behind: 1 })
  expect(g.git[`${ROOT}/src/a.ts`]).toBe('M')
  expect(g.git[`${ROOT}/src`]).toBe('M')
  expect(g.git[ROOT]).toBe('D')
  expect(g.git[`${ROOT}/b.ts`]).toBe('R')
  expect(g.untrackedDirs).toEqual([`${ROOT}/tmp`])
  expect(g.ignored).toEqual([`${ROOT}/dist`])
  expect(g.files).toEqual({ [`${ROOT}/src/a.ts`]: 'mod', [`${ROOT}/notes.md`]: 'new', [`${ROOT}/old.txt`]: 'del', [`${ROOT}/b.ts`]: 'mod' })
  expect(rollCounts(g.files, ROOT)[ROOT]).toEqual([1, 2, 1])
  expect(parseGit('## HEAD (no branch)\0', ROOT, '').branch?.head).toBe('detached')
})

test('sums the lines changed per file and folder, a subfolder prefix and renames included', async () => {
  const diff: Record<string, [number, number]> = {}
  parseNumstat(`3\t1\tapi/src/a.ts\0-\t-\tapi/img.png\0${'1\t1\t'}\0old.md\0api/new.md\0`, '/p/app/api', 'api/', diff)
  expect(diff).toEqual({ '/p/app/api/src/a.ts': [3, 1], '/p/app/api/img.png': [0, 0], '/p/app/api/new.md': [1, 1] })
  expect(rollUp(diff, '/p/app/api')['/p/app/api']).toEqual([4, 2])
  expect(rollUp(diff, '/p/app/api')['/p/app/api/src']).toEqual([3, 1])
})

test('finds the git and gh actions a command runs and leaves read-only git alone', async () => {
  expect(gitActions('git add -A && git commit -m "x" && git push').map(a => a.kind)).toEqual(['git add', 'git commit', 'git push'])
  expect(gitActions('git status && git log --oneline && git -C /x diff')).toEqual([])
  expect(gitActions('gh pr create --fill')[0]?.running).toBe('opening PR')
  expect(gitActions('git checkout -- a.ts')[0]?.verb).toBe('restore')
  expect(gitActions('git stash list')).toEqual([])
  expect(chainOf('git commit -m x && git push')).toEqual({ size: 2, and: true })
  expect(chainOf('git commit -m x; git push').and).toBe(false)
})

test('tells read-only commands from writes and lists the paths they read', async () => {
  expect(readOnly('cat a.ts | grep foo')).toBe(true)
  expect(readOnly('cd src && rg -n "x" .')).toBe(true)
  expect(readOnly('echo hi > a.ts')).toBe(false)
  expect(readOnly('sed -i "s/a/b/" a.ts')).toBe(false)
  expect(readOnly('find . -name "*.log" -delete')).toBe(false)
  expect(readOnly('npm test')).toBe(false)
  expect(readTargets('cd src && cat a.ts ../b.ts', ROOT, '')).toEqual([`${ROOT}/src/a.ts`, `${ROOT}/b.ts`])
  expect(readTargets('rg -n foo', ROOT, 'src/a.ts:3:foo\nsrc/c.ts:9:foo\n')).toEqual([`${ROOT}/src/a.ts`, `${ROOT}/src/c.ts`])
  expect(readTargets('ls ~/x', ROOT, '', '/Users/me')).toEqual(['/Users/me/x'])
})

test('draws folder outlines open or closed and files by extension with a Nerd Font, nothing without one', async () => {
  const dir = { id: '/p/src', parent: '/p', name: 'src', kind: 'dir' as const, hidden: false, loaded: false }
  const file = { ...dir, id: '/p/src/a.ts', name: 'a.ts', kind: 'file' as const }
  expect([fileGlyph(dir, false, false), fileGlyph(dir, true, false), fileGlyph(file, false, false)]).toEqual(['', '', ''])
  expect(fileGlyph(dir, false, true)).not.toBe(fileGlyph(dir, true, true))
  expect(fileGlyph(file, false, true)).toBe(fileGlyph({ ...file, name: 'b.ts' }, false, true))
  expect(fileGlyph(file, false, true)).not.toBe(fileGlyph({ ...file, name: 'b.php' }, false, true))
  expect([glyphWidth(true), glyphWidth(false)]).toEqual([2, 0])
})

test('resolves paths against the cwd, folding . and .. and expanding ~', async () => {
  expect(resolve('/p/app', 'src/../lib/./x.ts')).toBe('/p/app/lib/x.ts')
  expect(resolve('/p/app', '/etc/hosts')).toBe('/etc/hosts')
  expect(resolve('/p/app', '~/y', '/Users/me')).toBe('/Users/me/y')
  expect(resolve('/', '..')).toBe('/')
})

test('lists the rows on screen: folders first, hidden entries toggled, a query keeps matches with their folders', async () => {
  const t = emptyTree(ROOT)
  t.nodes = [
    ...toNodes(ROOT, [{ name: 'zeta.ts', kind: 'file', isLink: false }, { name: '.env', kind: 'file', isLink: false }, { name: 'src', kind: 'dir', isLink: false }]),
    ...toNodes(`${ROOT}/src`, [{ name: 'b.ts', kind: 'file', isLink: false }, { name: 'a.ts', kind: 'file', isLink: false }]),
  ]
  expect(visibleRows(t).map(r => r.node.name)).toEqual(['src', '.env', 'zeta.ts'])
  t.showHidden = false
  t.expanded = [`${ROOT}/src`]
  expect(visibleRows(t).map(r => `${r.depth}:${r.node.name}`)).toEqual(['0:src', '1:a.ts', '1:b.ts', '0:zeta.ts'])
  t.query = 'b.ts'
  expect(visibleRows(t).map(r => r.node.name)).toEqual(['src', 'b.ts'])
  expect(ancestorsOf(`${ROOT}/src/x/y.ts`, ROOT)).toEqual([`${ROOT}/src/x`, `${ROOT}/src`])
})

test('a fresh listing replaces a folder, keeps the open state of folders that stayed and drops what is gone', async () => {
  const src = `${ROOT}/src`
  const old = [
    { id: src, parent: ROOT, name: 'src', kind: 'dir' as const, hidden: false, loaded: true },
    { id: `${src}/gone`, parent: src, name: 'gone', kind: 'dir' as const, hidden: false, loaded: true },
    { id: `${src}/gone/x.ts`, parent: `${src}/gone`, name: 'x.ts', kind: 'file' as const, hidden: false, loaded: false },
    { id: `${src}/lib`, parent: src, name: 'lib', kind: 'dir' as const, hidden: false, loaded: true },
  ]
  const fresh = toNodes(src, [{ name: 'lib', kind: 'dir', isLink: false }, { name: 'new.ts', kind: 'file', isLink: false }])
  const out = replaceChildren(old, new Map([[src, fresh]]))
  expect(out.map(n => n.id)).toEqual([src, `${src}/lib`, `${src}/new.ts`])
  expect(out.find(n => n.id === `${src}/lib`)?.loaded).toBe(true)
})

test('draws the session folder with git letters, opens a double-clicked file in the viewer or its app and lights a file Claude edits', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: string[][] = []
  mock.env(on, { HOME: '/Users/k', TMPDIR: '/tmp' })
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 'test' }))
  on('command.register', () => ({ value: undefined }))
  const opened: string[] = []
  on('ui.open', (_$: unknown, e: { id: string }) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('fs.read', (_$: unknown, e: { path: string }) => ({ value: e.path.endsWith('.png') ? 'PNG\u0000' : '# Hi\n' }))
  on('ui.toast', () => ({ value: undefined }))
  const dirs: Record<string, [string, 'file' | 'dir'][]> = { [ROOT]: [['src', 'dir'], ['README.md', 'file'], ['logo.png', 'file']], [`${ROOT}/src`]: [['a.ts', 'file']] }
  on('fs.list', (_$: unknown, e: { path: string }) => {
    const kids = dirs[e.path]
    if (!kids) throw new Error(`ENOENT ${e.path}`)
    return { value: kids.map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.stat', (_$: unknown, e: { path: string }) => {
    const parent = e.path.slice(0, e.path.lastIndexOf('/'))
    const name = e.path.slice(e.path.lastIndexOf('/') + 1)
    const kind = dirs[e.path] ? 'dir' : dirs[parent]?.find(([n]) => n === name)?.[1]
    if (!kind) throw new Error(`ENOENT ${e.path}`)
    return { value: { kind, size: 1, mtimeMs: 0, isLink: false } }
  })
  on('process.run', (_$: unknown, e: { argv: string[] }) => {
    ran.push([...e.argv])
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (e.argv[0] === 'uname') return ok('Darwin\n')
    if (e.argv[0] === 'find') return ok(`${ROOT}/src/a.ts\0`)
    if (e.argv[0] !== 'git') return ok('')
    const verb = e.argv.slice(4).find(a => !a.startsWith('-'))
    if (verb === 'rev-parse') return ok(`\n${ROOT}\n`)
    if (verb === 'status') return ok('## main...origin/main\0 M src/a.ts\0?? README.md\0')
    if (verb === 'diff') return ok('3\t1\tsrc/a.ts\0')
    return ok('')
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))
  const filled: string[] = []
  on('prompt.fill', (_$: unknown, e: { text: string }) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const props = { title: 'Files', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'friendly-ui', surface: 'terminal', component: 'Pane', requestId: 'ua-tree', props })
  await clock.settle()
  const texts = async () => JSON.stringify(await ui.drawn()) + JSON.stringify(await ui.drawn({ in: 'rows' }))
  let shown = await texts()
  for (const word of ['app', 'main', 'origin/main', 'src', 'README.md', ' •1', ' +1', '" +"', 'new', '↻ Refresh']) expect(shown).toContain(word)
  await ui.post({ press: `${ROOT}/README.md` }, { in: 'rows' })
  await clock.settle()
  expect(filled).toEqual([])
  await ui.post({ press: `${ROOT}/README.md` }, { in: 'rows' })
  await clock.settle()
  expect(filled).toEqual([])
  expect(opened).toContain('ua-view')
  for (let i = 0; i < 2; i++) await ui.post({ press: `${ROOT}/logo.png` }, { in: 'rows' })
  await clock.settle()
  expect(ran).toContainEqual(['open', '--', `${ROOT}/logo.png`])
  await ui.post({ add: `${ROOT}/README.md` }, { in: 'rows' })
  await clock.settle()
  expect(filled).toEqual(['README.md '])
  await ui.post({ add: `${ROOT}/src` }, { in: 'rows' })
  await clock.settle()
  expect(filled).toEqual(['README.md ', 'src/ '])
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/src/a.ts`, old_string: 'a', new_string: 'b' })
  await clock.settle()
  shown = await texts()
  expect(shown).toContain('"t":"src","sh":"write","dim":true')
  expect(shown).not.toContain('a.ts')
  expect(shown).toContain(' +3')
  expect(ran.some(a => a[0] === 'git' && a.includes('status'))).toBe(true)
  await ui.unmount()
})
