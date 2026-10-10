import { expect, test } from 'claude-code/testing'

import { backgroundId, backgroundLabel, compactLevel, elapsed, friendlyTool, modelLabel, parseUsageText, taskNotice, windowLabel } from '../hooks/register.tsx'
import type { Shell } from '../types'
import { costOf, ring, shortCost, shortTokens, viewKind } from '../hooks/register.tsx'

test('estimates subagent cost and formats tokens and money', async () => {
  expect(costOf('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 })).toBe(1.5)
  expect(costOf('claude-opus-5-5', { cache_read_input_tokens: 1_000_000 })).toBe(0.2)
  expect([850, 18_400, 1_250_000].map(shortTokens)).toEqual(['850', '18k', '1.3M'])
  expect([0.004, 0.123].map(shortCost)).toEqual(['<$0,01', '~$0,12'])
})
import { chartArt } from '../hooks/art/chart-art.ts'
import { commandSegments } from '../hooks/art/command-output.ts'
import { diffstat } from '../hooks/art/format.ts'
import { splitReply } from '../hooks/art/markdown.ts'
import { highlight, languageOf } from '../hooks/art/highlight.ts'
import { inlineMath } from '../hooks/art/math.ts'
import { chartHeading, parseMermaid } from '../hooks/art/mermaid.ts'
import { mermaidArt } from '../hooks/art/mermaid-art.ts'
import { replySegments } from '../hooks/art/reply.ts'
import { CLAUDE, findTheme, paletteFor, skinPaletteFor } from '../hooks/themes.ts'

const PREFS = { icons: 'unicode', tables: 'on', markdown: true, charts: true, math: true } as const

test('picks how the viewer draws a file from its extension or name', async () => {
  expect(['/p/README.md', '/p/doc.MARKDOWN', '/p/a.pdf', '/p/src/a.ts', '/p/Dockerfile', '/p/.env'].map(viewKind)).toEqual(['md', 'md', 'pdf', 'ts', 'dockerfile', 'env'])
})

test('draws usage as a braille ring filled clockwise in eighths', async () => {
  expect(ring(100)).toEqual({ glyph: '⢎⡱', isEmpty: false })
  expect(ring(0)).toEqual({ glyph: '⢎⡱', isEmpty: true })
  expect(ring(undefined).isEmpty).toBe(true)
  expect(ring(12.5).glyph).toBe('⠀⠁')
  expect(ring(50).glyph).toBe('⠀⡱')
  expect(ring(75).glyph).toBe('⢄⡱')
  expect(ring(0, true)).toEqual({ glyph: '\u{f0766}', isEmpty: true })
  expect(ring(12.5, true).glyph).toBe('\u{f0a9e}')
  expect(ring(100, true).glyph).toBe('\u{f0aa5}')
})

test('draws a mermaid flowchart and a sequence diagram as terminal art', async () => {
  const source = 'flowchart LR\n  A[Pedido] --> B[Pago]\n  B --> C[Envío]'
  const flow = parseMermaid(source)
  expect(flow?.kind).toBe('flow')
  expect(chartHeading(flow!)).toEqual({ kind: 'Flowchart', count: '3 steps' })
  expect(mermaidArt(source, 80, false)?.rows.length).toBeGreaterThan(0)
  const gantt = parseMermaid('gantt\n  title Plan\n  section Fase\n  Diseño :a1, 2026-01-01, 3d')
  expect(chartArt(gantt!, 80, false)?.rows.length).toBeGreaterThan(0)
  const seq = mermaidArt('sequenceDiagram\n  Cliente->>API: GET /pedidos\n  API-->>Cliente: 200', 80, false)
  expect(seq?.rows.length).toBeGreaterThan(0)
})

test('turns inline TeX into Unicode and splits display formulas out', async () => {
  expect(inlineMath('área $\\alpha^2$')).not.toContain('$')
  expect(splitReply('antes\n$$\nx^2\n$$\ndespués', { tables: true, fence: () => true, math: true }).map(s => s.kind)).toEqual(['text', 'math', 'text'])
})

test('leaves plain replies to Claude Code and draws the rest', async () => {
  expect(replySegments('hola', { ...PREFS, markdown: false }, 'terminal')).toBeNull()
  expect(replySegments('```mermaid\npie\n  "A": 1\n```', PREFS, 'terminal')?.map(s => s.kind)).toEqual(['code'])
})

test('highlights PHP and reads Blade as markup', async () => {
  expect(languageOf('php')).toBe('php')
  expect(languageOf('blade')).toBe('markup')
  const [tokens] = highlight('$total = count($items); // suma', 'php')
  expect(tokens!.find(t => t.text === '$total')?.role).toBe('variable')
  expect(tokens!.find(t => t.text === 'count')?.role).not.toBe('comment')
  expect(tokens!.at(-1)?.role).toBe('comment')
})

test('highlights the stack config languages', async () => {
  expect(['prisma', 'Dockerfile', 'nginx', 'makefile', 'gql', 'env'].map(languageOf)).toEqual(['prisma', 'dockerfile', 'nginx', 'makefile', 'graphql', 'toml'])
  const [model] = highlight('model User {', 'prisma')
  expect(model!.find(t => t.text === 'model')?.role).toBe('keyword')
  const [from] = highlight('FROM node:20 AS build', 'dockerfile')
  expect(from!.find(t => t.text === 'FROM')?.role).toBe('keyword')
  const [proxy] = highlight('proxy_pass http://app:$port; # api', 'nginx')
  expect(proxy!.find(t => t.text === 'proxy_pass')?.role).toBe('keyword')
  expect(proxy!.at(-1)?.role).toBe('comment')
  const [env] = highlight('APP_KEY=base64:abc # clave', 'env')
  expect(env!.at(-1)?.role).toBe('comment')
})

test('highlights Terraform, Swift, Dart, Ruby, Protobuf and CSV', async () => {
  expect(['tf', 'swift', 'dart', 'rb', 'proto', 'csv'].map(languageOf)).toEqual(['hcl', 'swift', 'dart', 'ruby', 'protobuf', 'csv'])
  const role = (code: string, lang: string, text: string) => highlight(code, lang)[0]!.find(t => t.text === text)?.role
  expect(role('resource "aws_s3_bucket" "logs" {', 'tf', 'resource')).toBe('keyword')
  expect(role('guard let user else { return }', 'swift', 'guard')).toBe('keyword')
  expect(role('final List<String> items = [];', 'dart', 'final')).toBe('keyword')
  expect(role('def total(items) # suma', 'rb', 'def')).toBe('keyword')
  expect(role('message Pedido { int32 id = 1; }', 'proto', 'int32')).toBe('type')
  const row = highlight('id,"Bogotá, Colombia",3', 'csv')[0]!
  expect(row.filter(t => t.role === 'meta').length).toBe(2)
  expect(row.find(t => t.text === '"Bogotá, Colombia"')?.role).toBe('string')
})

test('gives the default theme hex colors for drawings', async () => {
  expect(skinPaletteFor(null, false).write).toBe('#d77757')
  expect(skinPaletteFor('nord', true).fg).toBe('#1f1f1f')
})

test('finds themes by name or label and builds light palettes', async () => {
  expect(findTheme('Tokyo Night')).toMatchObject({ name: 'tokyo-night' })
  expect(findTheme('rose pine')).toMatchObject({ name: 'rose-pine' })
  expect(findTheme('claude')).toBe('claude')
  expect(findTheme('nada')).toBeUndefined()
  expect(paletteFor(null, false)).toEqual(CLAUDE)
  expect(paletteFor('tokyo-night', true).accent).toBe('#b15c00')
  expect(paletteFor('dracula', true).fg).toBe('#1f1f1f')
  expect(paletteFor('dracula', false).pillText).toBe('#2b2d3a')
})

test('splits a reply into prose, closed code fences and tables', async () => {
  const reply = ['Hola', '', '```ts', 'const a = 1', '```', '', '| A | B |', '|---|--:|', '| 1 | 2 |', '', 'Fin', '```py', 'abierto']
  const segments = splitReply(reply.join('\n'))
  expect(segments.map(s => s.kind)).toEqual(['text', 'code', 'table', 'text'])
  expect(segments[1]).toEqual({ kind: 'code', lang: 'ts', code: 'const a = 1', raw: '```ts\nconst a = 1\n```' })
  expect(segments[2]).toEqual({ kind: 'table', header: ['A', 'B'], align: ['left', 'right'], rows: [['1', '2']] })
})

test('turns key-value command output into a table', async () => {
  expect(commandSegments('Total cost: $1.20\nDuration: 3m', 'cost')).toEqual([
    { kind: 'table', header: ['cost', ''], align: ['left', 'left'], rows: [['Total cost', '$1.20'], ['Duration', '3m']] },
  ])
  expect(commandSegments('solo una línea', 'x')).toBeNull()
})

test('counts the lines a structured patch adds and removes', async () => {
  expect(diffstat({ structuredPatch: [{ lines: [' a', '-b', '+c', '+d'] }] })).toEqual({ added: 2, removed: 1 })
  expect(diffstat({ stdout: '' })).toBeNull()
})

test('labels running shells and subagents for the band', async () => {
  const task = (kind: Shell['kind'], status: Shell['status']): Shell => ({ id: Math.random().toString(), desc: 'x', status, startedAt: 0, kind })
  expect(backgroundLabel([], 'agent')).toBeNull()
  expect(backgroundLabel([task('agent', 'done'), task('shell', 'stopped')], 'agent')).toBeNull()
  expect(backgroundLabel([task('agent', 'running')], 'agent')).toBe('✦ 1 agent running')
  expect(backgroundLabel([task('agent', 'running')], 'shell')).toBeNull()
  expect(backgroundLabel([task('shell', 'running'), task('shell', 'running')], 'shell')).toBe('⚙ 2 shells running')
  expect(backgroundLabel([task(undefined, 'running'), task('agent', 'running'), task('agent', 'running')], 'shell')).toBe('⚙ 1 shell running')
})

test('formats elapsed time', async () => {
  expect(elapsed(8000)).toBe('0:08')
  expect(elapsed(125000)).toBe('2:05')
  expect(elapsed(3725000)).toBe('1:02:05')
  expect(elapsed(-5)).toBe('0:00')
})

test('reads per-model weekly windows from the /usage text', async () => {
  const text = [
    'Current session: 37% used · resets Oct 10 at 1:49pm (America/Bogota)',
    'Current week (all models): 68% used · resets Oct 12 at 2:59pm (America/Bogota)',
    'Current week (Fable): 0% used · resets Oct 12 at 3pm (America/Bogota)',
  ].join('\n')
  expect(parseUsageText(text)).toEqual([{ kind: 'seven_day_fable', pct: 0, resetText: 'Resets Oct 12 at 3pm' }])
})

test('names rate-limit windows, model-specific ones included', async () => {
  expect(windowLabel('five_hour')).toEqual({ short: '5h', long: 'Session 5h' })
  expect(windowLabel('seven_day')).toEqual({ short: 'Week', long: 'Week' })
  expect(windowLabel('seven_day_fable')).toEqual({ short: 'Fable', long: 'Fable · week' })
  expect(windowLabel('seven_day_opus')).toEqual({ short: 'Opus', long: 'Opus · week' })
})

test('finds the background task id a tool result reports', async () => {
  expect(backgroundId({ stdout: '' }, 'Command running in background with ID: bdc98twpb. Output is being written to: /x')).toBe('bdc98twpb')
  expect(backgroundId({ backgroundTaskId: 'abc123' }, undefined)).toBe('abc123')
  expect(backgroundId({ stdout: 'hola' }, 'hola')).toBeNull()
})

test('reads id and status from a task notification', async () => {
  expect(taskNotice('<task-notification><task-id>bdc98twpb</task-id><status>completed</status></task-notification>')).toEqual({ id: 'bdc98twpb', status: 'done' })
  expect(taskNotice('<task-id>x1</task-id><status>failed</status>')).toEqual({ id: 'x1', status: 'error' })
  expect(taskNotice('sin datos')).toBeNull()
})

test('names models from aliases and full ids', async () => {
  expect(modelLabel('opus')).toBe('Opus 5.5')
  expect(modelLabel('sonnet[1m]')).toBe('Sonnet 5.5 · 1M')
  expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelLabel('opusplan')).toBe('Opus plan')
  expect(modelLabel('default')).toBe('Default')
})

test('describes tool calls in plain language', async () => {
  expect(friendlyTool('Edit', { file_path: '/a/b/register.tsx' })).toBe('Editing register.tsx')
  expect(friendlyTool('Bash', { command: 'ls', description: 'Listing files' })).toBe('Listing files')
  expect(friendlyTool('Bash', { command: 'ls' })).toBe('$ ls')
  expect(friendlyTool('Bash', { command: 'cd /app && php artisan migrate --force\necho ok' })).toBe('$ php artisan migrate --force')
  expect(friendlyTool('Bash', { command: `npm run ${'x'.repeat(80)}` })).toHaveLength(62)
  expect(friendlyTool('Bash', {})).toBe('Running a command')
  expect(friendlyTool('Grep', { pattern: 'x' })).toBe('Searching the code')
})

test('suggests compacting from 50% and urges it from 80%', async () => {
  expect(compactLevel(undefined)).toBe(0)
  expect(compactLevel(49)).toBe(0)
  expect(compactLevel(50)).toBe(1)
  expect(compactLevel(80)).toBe(2)
})
