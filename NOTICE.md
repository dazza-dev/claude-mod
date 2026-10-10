# Third-party notices

The mod depends on no other plugin at runtime: all of its code lives in this repository. Part of
it is adapted from MIT-licensed projects, whose notices are kept here as that license requires.

## claude-skins

`hooks/themes.ts` (color palettes) and all of `hooks/art/` except `hooks/art/vendor/` (markdown
parsing, tables, code highlighting, diffs, Mermaid diagrams, charts and formulas) are adapted from
[claude-skins](https://github.com/hellosverre/claude-skins):

```
MIT License

Copyright (c) 2026 hellosverre

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## claude-code-filetree

`hooks/tree/` and the file tree section of `hooks/register.tsx` (tree with git status, highlight
of what Claude reads and writes, git actions at the foot) are adapted from
[claude-code-filetree](https://github.com/data-goblin/claude-code-filetree) (MIT, © 2026 Kurt
Buhler), under the same MIT license reproduced above.

## savvy-progress

The per-model price table and the context, token and cost figures of subagents in
`hooks/register.tsx` are adapted from
[savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress)
(MIT, © 2026 johnnyvizz), under the same MIT license reproduced above.

## beautiful-mermaid

`hooks/art/vendor/mermaid-ascii.js` bundles beautiful-mermaid 1.1.3 (MIT, © 2026 Craft Docs); its
full license is in the file header.
