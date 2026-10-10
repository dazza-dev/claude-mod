import type { Palette } from './skin'

// Syntax highlighting for code the terminal draws: a small scanner per language family,
// no grammar files and nothing outside this module, so it runs in the mod sandbox. Each
// line becomes a run of tokens with a role; `roleColors` gives each role a colour from the
// skin. It aims at what a reader scans for (keywords, strings, comments, numbers, names),
// not at a parser's precision.

export type Role =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'literal'
  | 'type'
  | 'func'
  | 'property'
  | 'variable'
  | 'tag'
  | 'attr'
  | 'add'
  | 'del'
  | 'meta'
  | 'heading'
  | 'warn'

export type Token = { text: string; role: Role }

// Which of the skin's slots each role takes. The tool kinds' colours carry the syntax, so
// a skin that keeps them apart keeps keywords, strings and names apart too.
export function roleColors(palette: Palette): Readonly<Record<Role, string>> {
  return {
    plain: palette.fg,
    comment: palette.muted,
    string: palette.run,
    number: palette.search,
    literal: palette.search,
    keyword: palette.web,
    type: palette.read,
    func: palette.mcp,
    property: palette.read,
    variable: palette.write,
    tag: palette.web,
    attr: palette.mcp,
    add: palette.ok,
    del: palette.err,
    meta: palette.muted,
    heading: palette.user,
    warn: palette.warn,
  }
}


type Family = {
  line: readonly string[]
  block: readonly (readonly [string, string])[]
  // String delimiters, longest first; `multi` ones may run over several lines.
  strings: readonly { open: string; close: string; multi: boolean; raw?: boolean }[]
  keywords: ReadonlySet<string>
  literals: ReadonlySet<string>
  types: ReadonlySet<string>
  // Capitalised names read as types (classes, structs).
  capitalTypes: boolean
  // `$name` and `${…}` are variables (shells).
  dollar: boolean
  // `-` joins words, as in `Get-ChildItem` or `font-size`.
  dashWords: boolean
  caseless: boolean
  // `@name` reads as an annotation (decorators, attributes).
  at: boolean
}

const words = (text: string): ReadonlySet<string> => new Set(text.split(/\s+/).filter(word => word !== ''))

const NONE = words('')

const QUOTES = [
  { open: '"', close: '"', multi: false },
  { open: "'", close: "'", multi: false },
] as const

const base = (overrides: Partial<Family>): Family => ({
  line: ['//'],
  block: [['/*', '*/']],
  strings: QUOTES,
  keywords: NONE,
  literals: words('true false null'),
  types: NONE,
  capitalTypes: true,
  dollar: false,
  dashWords: false,
  caseless: false,
  at: false,
  ...overrides,
})

const JS = base({
  strings: [{ open: '`', close: '`', multi: true }, ...QUOTES],
  keywords: words(
    'abstract as async await break case catch class const continue debugger declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface is keyof let namespace new of override private protected public readonly return satisfies set static super switch this throw try type typeof var void while with yield',
  ),
  literals: words('true false null undefined NaN Infinity'),
  types: words('string number boolean bigint symbol object unknown never any void Promise Array Record Map Set Readonly Partial'),
  at: true,
})

const PYTHON = base({
  line: ['#'],
  block: [],
  strings: [
    { open: '"""', close: '"""', multi: true },
    { open: "'''", close: "'''", multi: true },
    ...QUOTES,
  ],
  keywords: words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda match case nonlocal not or pass raise return try while with yield self cls'),
  literals: words('True False None'),
  types: words('int float str bool bytes list dict set tuple object type'),
  at: true,
})

// Only `"` quotes: a `'` opens a lifetime as often as a char.
const RUST = base({
  strings: [{ open: '"', close: '"', multi: true }],
  keywords: words('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while macro_rules'),
  types: words('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box'),
  literals: words('true false None Some Ok Err'),
})

const GO = base({
  strings: [{ open: '`', close: '`', multi: true }, ...QUOTES],
  keywords: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'),
  types: words('bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any'),
  literals: words('true false nil iota'),
})

const C = base({
  keywords: words(
    'auto break case catch class const constexpr continue default delete do else enum explicit extern for friend goto if inline namespace new noexcept operator private protected public register return sizeof static struct switch template this throw try typedef typename union using virtual volatile while #include #define #ifdef #ifndef #endif #pragma #if #else',
  ),
  types: words('void char short int long float double signed unsigned bool size_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t std string vector'),
  literals: words('true false NULL nullptr'),
})

const CSHARP = base({
  strings: [{ open: '@"', close: '"', multi: true, raw: true }, { open: '$"', close: '"', multi: false }, ...QUOTES],
  keywords: words(
    'abstract as async await base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach get goto if implicit in init interface internal is lock namespace new operator out override params partial private protected public readonly record ref return sealed set sizeof static struct switch this throw try typeof unchecked unsafe using var virtual void volatile when where while yield',
  ),
  types: words('bool byte char decimal double float int long object sbyte short string uint ulong ushort dynamic Task List'),
  literals: words('true false null'),
  at: false,
})

const JAVA = base({
  keywords: words(
    'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public record return static strictfp super switch synchronized this throw throws transient try var void volatile while yield',
  ),
  types: words('boolean byte char double float int long short String Object List Map'),
  literals: words('true false null'),
  at: true,
})

const SHELL = base({
  line: ['#'],
  block: [],
  strings: QUOTES,
  keywords: words('if then else elif fi for while until do done case esac in function return local export readonly declare set unset source alias exit break continue select time'),
  literals: words('true false'),
  types: NONE,
  capitalTypes: false,
  dollar: true,
})

const POWERSHELL = base({
  line: ['#'],
  block: [['<#', '#>']],
  strings: [{ open: '@"', close: '"@', multi: true }, { open: "@'", close: "'@", multi: true }, ...QUOTES],
  keywords: words('begin break catch class continue data do dynamicparam else elseif end enum exit filter finally for foreach from function if in param process return switch throw trap try until using while workflow'),
  literals: words('$true $false $null'),
  capitalTypes: false,
  dollar: true,
  dashWords: true,
  caseless: true,
})

const SQL = base({
  line: ['--'],
  keywords: words(
    'add all alter and as asc between by case check column constraint create cross database default delete desc distinct drop else end exists foreign from full group having if in index inner insert into is join key left like limit not on or order outer primary references returning right select set table then union unique update values view when where with',
  ),
  types: words('int integer bigint smallint decimal numeric float real double text varchar char boolean date time timestamp json jsonb uuid serial'),
  literals: words('true false null'),
  capitalTypes: false,
  caseless: true,
})

const LUA = base({
  line: ['--'],
  block: [['--[[', ']]']],
  strings: [{ open: '[[', close: ']]', multi: true }, ...QUOTES],
  keywords: words('and break do else elseif end for function goto if in local not or repeat return then until while'),
  literals: words('true false nil'),
  capitalTypes: false,
})

const PHP = base({
  line: ['//', '#'],
  keywords: words(
    'abstract and as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield from',
  ),
  types: words('int float string bool array object mixed void never iterable callable self parent static null'),
  literals: words('true false null TRUE FALSE NULL'),
  dollar: true,
})

const PRISMA = base({
  block: [],
  strings: [{ open: '"', close: '"', multi: false }],
  keywords: words('model enum datasource generator type view'),
  types: words('String Int BigInt Float Decimal Boolean DateTime Json Bytes Unsupported'),
  literals: words('true false null'),
  at: true,
})

const DOCKERFILE = base({
  line: ['#'],
  block: [],
  keywords: words('from as run cmd label maintainer expose env add copy entrypoint volume user workdir arg onbuild stopsignal healthcheck shell'),
  literals: NONE,
  capitalTypes: false,
  dollar: true,
  caseless: true,
})

const NGINX = base({
  line: ['#'],
  block: [],
  keywords: words(
    'http server location upstream events include listen server_name root index return rewrite try_files proxy_pass proxy_set_header proxy_http_version fastcgi_pass fastcgi_param ssl_certificate ssl_certificate_key add_header client_max_body_size gzip access_log error_log if set map worker_processes worker_connections alias deny allow',
  ),
  literals: words('on off'),
  capitalTypes: false,
  dollar: true,
})

const MAKEFILE = base({
  line: ['#'],
  block: [],
  keywords: words('include ifeq ifneq ifdef ifndef else endif define endef export unexport override .PHONY'),
  literals: NONE,
  capitalTypes: false,
  dollar: true,
})

const GRAPHQL = base({
  line: ['#'],
  block: [],
  strings: [{ open: '"""', close: '"""', multi: true }, { open: '"', close: '"', multi: false }],
  keywords: words('query mutation subscription fragment on type input enum interface union scalar schema extend implements directive repeatable'),
  types: words('String Int Float Boolean ID'),
  literals: words('true false null'),
  at: true,
})

const HCL = base({
  line: ['#', '//'],
  keywords: words('resource data variable output locals module provider terraform backend required_providers for_each count depends_on lifecycle dynamic content for in if source version'),
  types: words('string number bool list map set object tuple any'),
  literals: words('true false null'),
  capitalTypes: false,
})

const SWIFT = base({
  strings: [{ open: '"""', close: '"""', multi: true }, { open: '"', close: '"', multi: false }],
  keywords: words(
    'actor associatedtype async await break case catch class continue default defer deinit do else enum extension fallthrough fileprivate final for func guard if import in init inout internal is lazy let mutating open operator override private protocol public repeat rethrows return self Self some static struct subscript super switch throw throws try typealias var weak where while',
  ),
  types: words('Int Int32 Int64 UInt Double Float String Character Bool Array Dictionary Set Optional Any AnyObject Void Data Date URL'),
  literals: words('true false nil'),
  at: true,
})

const DART = base({
  strings: [{ open: '"""', close: '"""', multi: true }, { open: "'''", close: "'''", multi: true }, ...QUOTES],
  keywords: words(
    'abstract as assert async await base break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory final finally for get if implements import in interface is late library mixin new on operator part required rethrow return sealed set show static super switch sync this throw try typedef var when while with yield',
  ),
  types: words('int double num String bool List Map Set Future Stream void Object Iterable Widget BuildContext'),
  literals: words('true false null'),
  at: true,
})

const RUBY = base({
  line: ['#'],
  block: [['=begin', '=end']],
  keywords: words(
    'alias and begin break case class def defined? do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield require require_relative attr_accessor attr_reader attr_writer private protected public include extend',
  ),
  literals: words('true false nil'),
})

const PROTOBUF = base({
  keywords: words('syntax edition package import option message enum service rpc returns repeated optional required oneof map reserved extend stream weak public'),
  types: words('double float int32 int64 uint32 uint64 sint32 sint64 fixed32 fixed64 sfixed32 sfixed64 bool string bytes'),
  literals: words('true false'),
})

const FAMILIES: Readonly<Record<string, Family>> = {
  js: JS,
  ts: JS,
  python: PYTHON,
  rust: RUST,
  go: GO,
  c: C,
  csharp: CSHARP,
  java: JAVA,
  shell: SHELL,
  powershell: POWERSHELL,
  sql: SQL,
  lua: LUA,
  php: PHP,
  prisma: PRISMA,
  dockerfile: DOCKERFILE,
  nginx: NGINX,
  makefile: MAKEFILE,
  graphql: GRAPHQL,
  hcl: HCL,
  swift: SWIFT,
  dart: DART,
  ruby: RUBY,
  protobuf: PROTOBUF,
}

// Every fence tag this reads, by the family or mode that draws it.
const ALIASES: Readonly<Record<string, string>> = {
  js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
  ts: 'ts', typescript: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts',
  py: 'python', python: 'python', python3: 'python',
  rs: 'rust', rust: 'rust',
  go: 'go', golang: 'go',
  c: 'c', h: 'c', cpp: 'c', 'c++': 'c', cc: 'c', cxx: 'c', hpp: 'c',
  cs: 'csharp', csharp: 'csharp', 'c#': 'csharp',
  java: 'java', kotlin: 'java', kt: 'java',
  sh: 'shell', bash: 'shell', zsh: 'shell', shell: 'shell', console: 'shell', fish: 'shell',
  ps1: 'powershell', powershell: 'powershell', pwsh: 'powershell',
  sql: 'sql', psql: 'sql', mysql: 'sql', sqlite: 'sql',
  lua: 'lua',
  php: 'php', php8: 'php', phtml: 'php',
  blade: 'markup',
  prisma: 'prisma',
  dockerfile: 'dockerfile', docker: 'dockerfile', containerfile: 'dockerfile',
  nginx: 'nginx', 'nginx.conf': 'nginx',
  makefile: 'makefile', make: 'makefile', mk: 'makefile',
  graphql: 'graphql', gql: 'graphql',
  env: 'toml', dotenv: 'toml', '.env': 'toml',
  hcl: 'hcl', terraform: 'hcl', tf: 'hcl', tfvars: 'hcl',
  swift: 'swift',
  dart: 'dart', flutter: 'dart',
  rb: 'ruby', ruby: 'ruby', gemfile: 'ruby', rake: 'ruby',
  proto: 'protobuf', protobuf: 'protobuf',
  csv: 'csv', tsv: 'csv',
  json: 'json', jsonc: 'json', json5: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml', ini: 'toml',
  html: 'markup', xml: 'markup', svg: 'markup', vue: 'markup', xhtml: 'markup',
  css: 'css', scss: 'css', less: 'css',
  diff: 'diff', patch: 'diff',
  md: 'markdown', markdown: 'markdown',
}

export const languageOf = (lang: string): string | undefined => ALIASES[lang.trim().toLowerCase()]

// What a scan carries from one line to the next: an open block comment or string.
type Carry = { close: string; role: 'comment' | 'string'; raw: boolean } | null

const NUMBER = /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[a-zA-Z%]*/
const WORD = /^[A-Za-z_][\w]*/
const DASH_WORD = /^[A-Za-z_][\w]*(?:-[A-Za-z_][\w]*)*/
const VARIABLE = /^\$(?:\{[^}]*\}|[A-Za-z_][\w]*(?::[A-Za-z_][\w]*)?|[0-9#?@*$!-])/

// Joins neighbours of one role, so a line is a few spans rather than one per character.
function push(tokens: Token[], text: string, role: Role): void {
  if (text === '') {
    return
  }

  const last = tokens.at(-1)

  if (last !== undefined && last.role === role) {
    last.text += text
  } else {
    tokens.push({ text, role })
  }
}

// The end of a string from `from`: the index past its close, or -1 when the line ends first.
function closeOf(line: string, from: number, close: string, raw: boolean): number {
  for (let i = from; i < line.length; i++) {
    if (!raw && line[i] === '\\') {
      i++
      continue
    }

    if (line.startsWith(close, i)) {
      return i + close.length
    }
  }

  return -1
}

function wordRole(family: Family, word: string, line: string, end: number): Role {
  const key = family.caseless ? word.toLowerCase() : word

  if (family.keywords.has(key)) {
    return 'keyword'
  }

  if (family.literals.has(key)) {
    return 'literal'
  }

  if (family.types.has(key) || (family.capitalTypes && /^[A-Z][a-z]/.test(word))) {
    return 'type'
  }

  // A PowerShell cmdlet, Verb-Noun, reads as the call it is.
  if (family.dashWords && word.includes('-')) {
    return 'func'
  }

  return /^\s*\(/.test(line.slice(end)) || (family.dollar && end === word.length + line.search(/\S/)) ? 'func' : 'plain'
}

function scanLine(family: Family, line: string, carry: Carry): { tokens: Token[]; carry: Carry } {
  const tokens: Token[] = []
  let i = 0

  if (carry !== null) {
    const end = carry.role === 'comment' ? line.indexOf(carry.close) : closeOf(line, 0, carry.close, carry.raw)

    if (end === -1) {
      return { tokens: [{ text: line, role: carry.role }], carry }
    }

    i = carry.role === 'comment' ? end + carry.close.length : end
    push(tokens, line.slice(0, i), carry.role)
  }

  while (i < line.length) {
    const rest = line.slice(i)
    const lineComment = family.line.find(open => rest.startsWith(open))
    // Lua's `--[[` opens a block before `--` reads as a line comment.
    const block = family.block.find(([open]) => rest.startsWith(open))

    if (block !== undefined) {
      const end = line.indexOf(block[1], i + block[0].length)

      if (end === -1) {
        push(tokens, rest, 'comment')
        return { tokens, carry: { close: block[1], role: 'comment', raw: true } }
      }

      push(tokens, line.slice(i, end + block[1].length), 'comment')
      i = end + block[1].length
      continue
    }

    // A shell `#` opens a comment only at a word's start (`a#b` is one word).
    if (lineComment !== undefined && !(family.dollar && lineComment === '#' && i > 0 && !/\s/.test(line[i - 1] ?? ''))) {
      push(tokens, rest, 'comment')
      break
    }

    const quote = family.strings.find(string => rest.startsWith(string.open))

    if (quote !== undefined) {
      const end = closeOf(line, i + quote.open.length, quote.close, quote.raw === true)

      if (end === -1) {
        push(tokens, rest, 'string')
        return { tokens, carry: quote.multi ? { close: quote.close, role: 'string', raw: quote.raw === true } : null }
      }

      push(tokens, line.slice(i, end), 'string')
      i = end
      continue
    }

    const before = line[i - 1] ?? ' '
    const number = /[\w$.]/.test(before) ? null : NUMBER.exec(rest)

    if (number !== null) {
      push(tokens, number[0], 'number')
      i += number[0].length
      continue
    }

    const variable = family.dollar ? VARIABLE.exec(rest) : null

    if (variable !== null) {
      const key = family.caseless ? variable[0].toLowerCase() : variable[0]
      push(tokens, variable[0], family.literals.has(key) ? 'literal' : 'variable')
      i += variable[0].length
      continue
    }

    if (family.at && rest.startsWith('@')) {
      const name = WORD.exec(rest.slice(1))

      if (name !== null) {
        push(tokens, `@${name[0]}`, 'meta')
        i += name[0].length + 1
        continue
      }
    }

    // A C preprocessor line reads as one keyword then the rest.
    const directive = family === C && rest.startsWith('#') ? /^#\s*\w+/.exec(rest) : null

    if (directive !== null) {
      push(tokens, directive[0], 'keyword')
      i += directive[0].length
      continue
    }

    const word = (family.dashWords ? DASH_WORD : WORD).exec(rest)

    if (word !== null) {
      push(tokens, word[0], wordRole(family, word[0], line, i + word[0].length))
      i += word[0].length
      continue
    }

    push(tokens, line[i] ?? '', 'plain')
    i++
  }

  return { tokens, carry: null }
}

// JSON: keys apart from values.
function jsonLine(line: string): Token[] {
  const tokens: Token[] = []
  const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|(\/\/.*$)/g
  let last = 0

  for (const match of line.matchAll(pattern)) {
    const at = match.index ?? 0
    push(tokens, line.slice(last, at), 'plain')

    if (match[1] !== undefined) {
      push(tokens, match[1], match[2] === undefined ? 'string' : 'property')
      push(tokens, match[2] ?? '', 'plain')
    } else {
      push(tokens, match[0], match[3] !== undefined ? 'number' : match[4] !== undefined ? 'literal' : 'comment')
    }

    last = at + match[0].length
  }

  push(tokens, line.slice(last), 'plain')

  return tokens
}

const YAML_LITERALS = words('true false null yes no on off ~ True False Null')

// A YAML or TOML value: a string, a number, a literal, or plain words.
function valueTokens(tokens: Token[], value: string, literals: ReadonlySet<string>): void {
  const comment = /(^|\s)#.*$/.exec(value)
  const body = comment === null ? value : value.slice(0, comment.index + comment[1]!.length)
  const trimmed = body.trim()
  const lead = body.slice(0, body.length - body.trimStart().length)
  const tail = body.slice(lead.length + trimmed.length)

  push(tokens, lead, 'plain')

  if (/^(["']).*\1$/.test(trimmed)) {
    push(tokens, trimmed, 'string')
  } else if (NUMBER.test(trimmed) && NUMBER.exec(trimmed)?.[0] === trimmed) {
    push(tokens, trimmed, 'number')
  } else if (literals.has(trimmed)) {
    push(tokens, trimmed, 'literal')
  } else if (/^[&*][\w-]+/.test(trimmed)) {
    push(tokens, trimmed, 'variable')
  } else {
    push(tokens, trimmed, trimmed.startsWith('"') || trimmed.startsWith("'") ? 'string' : 'plain')
  }

  push(tokens, tail, 'plain')
  push(tokens, comment === null ? '' : value.slice(body.length), 'comment')
}

function yamlLine(line: string): Token[] {
  const tokens: Token[] = []

  if (/^\s*#/.test(line)) {
    return [{ text: line, role: 'comment' }]
  }

  if (/^(---|\.\.\.)\s*$/.test(line)) {
    return [{ text: line, role: 'meta' }]
  }

  const entry = /^(\s*(?:-\s+)*)([^\s#'"][^:#]*?|"[^"]*"|'[^']*')(:)(\s|$)/.exec(line)

  if (entry !== null) {
    push(tokens, entry[1] ?? '', 'plain')
    push(tokens, entry[2] ?? '', 'property')
    push(tokens, `${entry[3] ?? ''}`, 'plain')
    valueTokens(tokens, line.slice((entry[1] ?? '').length + (entry[2] ?? '').length + 1), YAML_LITERALS)

    return tokens
  }

  const item = /^(\s*-\s+)(.*)$/.exec(line)

  if (item !== null) {
    push(tokens, item[1] ?? '', 'plain')
    valueTokens(tokens, item[2] ?? '', YAML_LITERALS)

    return tokens
  }

  valueTokens(tokens, line, YAML_LITERALS)

  return tokens
}

// Colors that step through a CSV row's columns, so each column keeps its own.
const CSV_COLUMNS: readonly Role[] = ['property', 'string', 'type', 'func', 'keyword', 'literal']

/** A CSV or TSV row with each column in its own color; quoted fields keep their commas. */
function csvLine(line: string): Token[] {
  const separator = line.includes('\t') && !line.includes(',') ? '\t' : ','
  const tokens: Token[] = []
  let column = 0
  let field = ''
  let quoted = false
  for (const char of line) {
    if (char === '"') quoted = !quoted
    if (char === separator && !quoted) {
      push(tokens, field, CSV_COLUMNS[column % CSV_COLUMNS.length]!)
      push(tokens, char, 'meta')
      field = ''
      column++
      continue
    }
    field += char
  }
  push(tokens, field, CSV_COLUMNS[column % CSV_COLUMNS.length]!)
  return tokens
}

const TOML_LITERALS = words('true false inf nan')

function tomlLine(line: string): Token[] {
  if (/^\s*[#;]/.test(line)) {
    return [{ text: line, role: 'comment' }]
  }

  const section = /^(\s*)(\[\[?[^\]]*\]\]?)(.*)$/.exec(line)

  if (section !== null) {
    const tokens: Token[] = []
    push(tokens, section[1] ?? '', 'plain')
    push(tokens, section[2] ?? '', 'tag')
    push(tokens, section[3] ?? '', 'comment')

    return tokens
  }

  const pair = /^(\s*)([\w.\-"']+)(\s*=)(.*)$/.exec(line)

  if (pair === null) {
    return [{ text: line, role: 'plain' }]
  }

  const tokens: Token[] = []
  push(tokens, pair[1] ?? '', 'plain')
  push(tokens, pair[2] ?? '', 'property')
  push(tokens, pair[3] ?? '', 'plain')
  const value = pair[4] ?? ''

  // Arrays and inline tables are scanned as code; single values as a value.
  if (/^\s*[[{]/.test(value)) {
    tokens.push(...scanLine(base({ line: ['#'], block: [], literals: TOML_LITERALS, capitalTypes: false }), value, null).tokens)
  } else {
    valueTokens(tokens, value, TOML_LITERALS)
  }

  return tokens
}

// HTML and XML: tags, attribute names and their values; comments may span lines.
function markupLine(line: string, carry: Carry): { tokens: Token[]; carry: Carry } {
  const tokens: Token[] = []
  let i = 0

  if (carry !== null) {
    const end = line.indexOf('-->')

    if (end === -1) {
      return { tokens: [{ text: line, role: 'comment' }], carry }
    }

    push(tokens, line.slice(0, end + 3), 'comment')
    i = end + 3
  }

  while (i < line.length) {
    const rest = line.slice(i)

    if (rest.startsWith('<!--')) {
      const end = line.indexOf('-->', i + 4)

      if (end === -1) {
        push(tokens, rest, 'comment')
        return { tokens, carry: { close: '-->', role: 'comment', raw: true } }
      }

      push(tokens, line.slice(i, end + 3), 'comment')
      i = end + 3
      continue
    }

    const tag = /^<\/?[\w:.-]+|^<!\w+|^\/?>|^<\?\w*|^\?>/.exec(rest)

    if (tag !== null) {
      push(tokens, tag[0], 'tag')
      i += tag[0].length
      continue
    }

    const attribute = /^([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')?/.exec(rest)
    const inTag = tokens.some(token => token.role === 'tag') && /<[^>]*$/.test(line.slice(0, i))

    if (attribute !== null && inTag) {
      push(tokens, attribute[1] ?? '', 'attr')
      push(tokens, attribute[2] ?? '', 'plain')
      push(tokens, attribute[3] ?? '', 'string')
      i += attribute[0].length
      continue
    }

    const entity = /^&[#\w]+;/.exec(rest)

    if (entity !== null) {
      push(tokens, entity[0], 'literal')
      i += entity[0].length
      continue
    }

    push(tokens, line[i] ?? '', 'plain')
    i++
  }

  return { tokens, carry: null }
}

const CSS_FAMILY = base({ line: [], strings: QUOTES, capitalTypes: false, dashWords: true, keywords: words('!important') })

function cssLine(line: string, carry: Carry): { tokens: Token[]; carry: Carry } {
  const scanned = scanLine(CSS_FAMILY, line, carry)
  const tokens: Token[] = []

  // A word before `:` inside a rule is a property; one before `{`, a selector; `@` a rule.
  for (const [n, token] of scanned.tokens.entries()) {
    const after = scanned.tokens
      .slice(n + 1)
      .map(next => next.text)
      .join('')
    const isWord = token.role === 'plain' || token.role === 'func' || token.role === 'type'

    if (isWord && /^[\w-]+$/.test(token.text) && /^\s*:(?!:)/.test(after) && !/\{\s*$/.test(after)) {
      push(tokens, token.text, 'property')
    } else if (isWord && /^[\w-]+$/.test(token.text) && /^[^:;]*\{/.test(after)) {
      push(tokens, token.text, 'tag')
    } else if (token.role === 'plain' && /^[@#.]/.test(token.text) && n + 1 < scanned.tokens.length) {
      push(tokens, token.text, token.text === '@' ? 'keyword' : 'tag')
    } else {
      push(tokens, token.text, token.role)
    }
  }

  return { tokens, carry: scanned.carry }
}

function diffLine(line: string): Token[] {
  const role: Role =
    line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')
      ? 'meta'
      : line.startsWith('@@')
        ? 'heading'
        : line.startsWith('+')
          ? 'add'
          : line.startsWith('-')
            ? 'del'
            : 'plain'

  return [{ text: line, role }]
}

function markdownLine(line: string): Token[] {
  if (/^\s{0,3}#{1,6}\s/.test(line)) {
    return [{ text: line, role: 'heading' }]
  }

  if (/^\s*(```|~~~)/.test(line)) {
    return [{ text: line, role: 'meta' }]
  }

  const tokens: Token[] = []
  const marker = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|\s*>\s?)/.exec(line)
  const start = marker === null ? 0 : marker[0].length

  push(tokens, line.slice(0, start), 'keyword')

  const rest = line.slice(start)
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\[[^\]]*\]\([^)]*\))/g
  let last = 0

  for (const match of rest.matchAll(pattern)) {
    const at = match.index ?? 0
    push(tokens, rest.slice(last, at), 'plain')
    push(tokens, match[0], match[1] !== undefined ? 'string' : match[2] !== undefined ? 'keyword' : 'property')
    last = at + match[0].length
  }

  push(tokens, rest.slice(last), 'plain')

  return tokens
}

// The code's lines as tokens; a language this does not know is one plain token a line.
export function highlight(code: string, lang: string): Token[][] {
  const lines = code.split('\n')
  const id = languageOf(lang)

  switch (id) {
    case undefined:
      return lines.map(line => [{ text: line, role: 'plain' }])
    case 'json':
      return lines.map(jsonLine)
    case 'yaml':
      return lines.map(yamlLine)
    case 'toml':
      return lines.map(tomlLine)
    case 'csv':
      return lines.map(csvLine)
    case 'diff':
      return lines.map(diffLine)
    case 'markdown':
      return lines.map(markdownLine)
    default: {
      const scan =
        id === 'markup'
          ? markupLine
          : id === 'css'
            ? cssLine
            : (line: string, carry: Carry) => scanLine(FAMILIES[id] ?? JS, line, carry)
      let carry: Carry = null

      return lines.map(line => {
        const scanned = scan(line, carry)
        carry = scanned.carry

        return scanned.tokens
      })
    }
  }
}
