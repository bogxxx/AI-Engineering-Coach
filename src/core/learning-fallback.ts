/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Built-in learning content when the VS Code Language Model API is unavailable. */

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface BuiltinQuizQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  difficulty: QuizDifficulty;
  topic: string;
}

export interface BuiltinCodeRound {
  snippetA: string;
  snippetB: string;
  betterSnippet: 'A' | 'B';
  title: string;
  category: 'performance' | 'safety' | 'readability' | 'correctness' | 'security';
  explanation: string;
  difficulty: QuizDifficulty;
  language: string;
}

const QUIZ_BANK: Array<{ languages: string[]; items: BuiltinQuizQuestion[] }> = [
  {
    languages: ['markdown'],
    items: [
      {
        question: 'Which line creates a level-2 heading in CommonMark?\n\n```markdown\nA) ## Section\nB) **Section**\nC) <h2>Section</h2> only\nD) Section\n```',
        choices: ['## Section', '**Section**', '<h2> only', 'Plain text on its own line'],
        correctIndex: 0,
        explanation: 'Two hash characters followed by a space start an ATX heading. Bold text alone is not a heading.',
        difficulty: 'easy',
        topic: 'Headings',
      },
      {
        question: 'What is the correct fenced code block syntax?\n\n```markdown\nA) ```ts\ncode\n```\nB) ~~~ts\ncode\n~~~\nC) Both A and B\nD) `code` on one line only\n```',
        choices: ['Triple backticks with language tag', 'Triple tildes with language tag', 'Both backticks and tildes work', 'Single backticks only'],
        correctIndex: 2,
        explanation: 'CommonMark allows fenced blocks with either ``` or ~~~. A language tag after the opener enables syntax highlighting.',
        difficulty: 'medium',
        topic: 'Code blocks',
      },
      {
        question: 'Which link form is valid CommonMark?\n\n```markdown\nA) [docs](https://example.com)\nB) [docs][ref] then [ref]: https://example.com\nC) Both A and B\nD) (docs)[https://example.com]\n```',
        choices: ['Inline only', 'Reference only', 'Both inline and reference links', 'Parentheses-first form'],
        correctIndex: 2,
        explanation: 'Inline `[text](url)` and reference-style links both work. Parentheses-before-brackets is not valid Markdown link syntax.',
        difficulty: 'medium',
        topic: 'Links',
      },
      {
        question: 'Why is raw HTML often discouraged in extension READMEs?\n\n```markdown\nA) It never renders\nB) It breaks portability across renderers and review tools\nC) It is required for tables\nD) It disables headings\n```',
        choices: ['HTML never renders in Markdown', 'Reduces portability and consistency across renderers', 'Tables require HTML', 'Headings stop working'],
        correctIndex: 1,
        explanation: 'Many Markdown pipelines sanitize or inconsistently render HTML. Prefer native Markdown constructs when possible.',
        difficulty: 'hard',
        topic: 'Portability',
      },
      {
        question: 'Which list nesting is valid?\n\n```markdown\nA) - item\\n  - child\nB) - item\\n- child with no indent\nC) * item\\n  + child\nD) Both A and C\n```',
        choices: ['Two-space indent under parent', 'Sibling dash with no indent', 'Mixed markers without indent', 'Both indented forms with - or mixed markers'],
        correctIndex: 3,
        explanation: 'Nested items need indentation (typically 2–4 spaces). Mixed list markers (-, *, +) are allowed when nested correctly.',
        difficulty: 'easy',
        topic: 'Lists',
      },
      {
        question: 'What happens to `#` inside inline code?\n\n```markdown\nUse `npm run #script` in the docs.\n```',
        choices: ['It starts a heading', 'It stays literal inside backticks', 'It becomes a comment', 'It breaks the paragraph'],
        correctIndex: 1,
        explanation: 'Inline code spans are literal; Markdown block rules do not apply inside backticks.',
        difficulty: 'easy',
        topic: 'Inline code',
      },
    ],
  },
  {
    languages: ['typescript', 'javascript'],
    items: [
      {
        question: 'What does this log?\n\n```typescript\nconsole.log([1, 2, 3].map(x => x * 2).filter(x => x > 3));\n```',
        choices: ['[2, 4, 6]', '[4, 6]', '[6]', '[]'],
        correctIndex: 1,
        explanation: 'map doubles each value to [2,4,6], then filter keeps values > 3, leaving [4, 6].',
        difficulty: 'easy',
        topic: 'Array methods',
      },
      {
        question: 'Which fixes a floating promise in an async handler?\n\n```typescript\napp.get("/x", (req, res) => {\n  doWork();\n});\n```',
        choices: ['Add void before doWork()', 'Use async handler and await doWork()', 'Wrap doWork in setTimeout', 'Remove res parameter'],
        correctIndex: 1,
        explanation: 'Async route handlers should await async work (or explicitly handle errors). void alone hides failures without awaiting completion.',
        difficulty: 'medium',
        topic: 'Async',
      },
      {
        question: 'What is wrong with this equality check?\n\n```typescript\nif (value == null) { /* ... */ }\n```',
        choices: ['Nothing — it checks null and undefined', 'Should use === null only', '== never works for null', 'It throws at runtime'],
        correctIndex: 0,
        explanation: '`value == null` is a common idiom matching both null and undefined. Use === when you need strict distinction.',
        difficulty: 'medium',
        topic: 'Type System',
      },
      {
        question: 'Which avoids mutating the original array?\n\n```typescript\nconst sorted = items.sort((a, b) => a - b);\n```',
        choices: ['sort already copies', '[...items].sort(...)', 'items.slice().reverse()', 'Array.from(items).pop()'],
        correctIndex: 1,
        explanation: 'Array.prototype.sort mutates in place. Spread into a new array first when you need immutability.',
        difficulty: 'easy',
        topic: 'Immutability',
      },
    ],
  },
  {
    languages: ['python'],
    items: [
      {
        question: 'What is printed?\n\n```python\nprint({i for i in range(3)})\n```',
        choices: ['{0, 1, 2}', 'set([0, 1, 2]) display as {0, 1, 2}', '[0, 1, 2]', 'SyntaxError'],
        correctIndex: 1,
        explanation: 'Curly braces with a comprehension create a set; printing shows {0, 1, 2} (order may vary for larger sets).',
        difficulty: 'easy',
        topic: 'Comprehensions',
      },
      {
        question: 'Which default argument pattern is safe?\n\n```python\ndef add_item(x, items=None):\n    if items is None:\n        items = []\n    items.append(x)\n    return items\n```',
        choices: ['def add_item(x, items=[]):', 'The None guard pattern shown', 'def add_item(x, items={}):', 'Mutable defaults are always fine'],
        correctIndex: 1,
        explanation: 'Mutable default arguments are shared across calls. Initialize inside the function instead.',
        difficulty: 'medium',
        topic: 'Functions',
      },
    ],
  },
  {
    languages: ['general', 'other', 'unknown'],
    items: [
      {
        question: 'Two developers fix the same bug. Which commit message is better?\n\nA) "fix"\nB) "fix(auth): reject expired refresh tokens in middleware"',
        choices: ['A — shorter is always better', 'B — states scope and behavior change', 'Both equal', 'Neither — commit messages do not matter'],
        correctIndex: 1,
        explanation: 'Good commit messages explain what changed and why, making history searchable and reviewable.',
        difficulty: 'easy',
        topic: 'Engineering hygiene',
      },
      {
        question: 'When should you add automated tests for AI-generated code?\n\nA) Only if production breaks\nB) When the change affects behavior users depend on',
        choices: ['Only after incidents', 'When behavior matters to users or regressions are costly', 'Never for generated code', 'Only for UI code'],
        correctIndex: 1,
        explanation: 'Generated code still needs verification. Test behavior that protects users and prevents regressions.',
        difficulty: 'medium',
        topic: 'Testing',
      },
      {
        question: 'What is the main risk of pasting secrets into chat logs?\n\nA) Slower responses\nB) Credentials may be stored in session history and leak via exports',
        choices: ['Slower model responses', 'Session logs and exports can expose secrets', 'Markdown rendering breaks', 'Git ignores chat logs automatically'],
        correctIndex: 1,
        explanation: 'Assistant sessions are often persisted locally. Treat chat like any other secret-bearing log surface.',
        difficulty: 'hard',
        topic: 'Security',
      },
    ],
  },
];

const CODE_BANK: Array<{ languages: string[]; items: BuiltinCodeRound[] }> = [
  {
    languages: ['markdown'],
    items: [
      {
        snippetA: '# Title\n\nParagraph one.\n\n## Section\n\nMore text.',
        snippetB: '# Title\n# Section\n\nParagraph one.\nMore text.',
        betterSnippet: 'A',
        title: 'Heading hierarchy',
        category: 'readability',
        explanation: 'Snippet A uses proper heading levels and blank lines between blocks. B skips a level and runs paragraphs together.',
        difficulty: 'easy',
        language: 'markdown',
      },
      {
        snippetA: 'See [the guide](./guide.md) for setup steps.',
        snippetB: 'See the guide at ./guide.md for setup steps.',
        betterSnippet: 'A',
        title: 'Portable links',
        category: 'correctness',
        explanation: 'Markdown links are clickable in renderers and docs sites. Raw paths alone rely on the reader to copy them.',
        difficulty: 'easy',
        language: 'markdown',
      },
      {
        snippetA: '| Name | Role |\n| --- | --- |\n| Ada | Eng |',
        snippetB: '<table><tr><td>Name</td><td>Role</td></tr><tr><td>Ada</td><td>Eng</td></tr></table>',
        betterSnippet: 'A',
        title: 'Tables in docs',
        category: 'readability',
        explanation: 'Pipe tables diff cleanly in Git and render consistently. HTML tables are harder to edit and review in Markdown-first workflows.',
        difficulty: 'medium',
        language: 'markdown',
      },
      {
        snippetA: 'Run `npm test` before opening a PR.',
        snippetB: 'Run npm test before opening a PR.',
        betterSnippet: 'A',
        title: 'Inline commands',
        category: 'readability',
        explanation: 'Backticks make commands scannable and prevent accidental emphasis/link parsing.',
        difficulty: 'easy',
        language: 'markdown',
      },
    ],
  },
  {
    languages: ['typescript', 'javascript'],
    items: [
      {
        snippetA: 'const ids = new Set(items.map(i => i.id));\nreturn items.filter(i => ids.has(i.id));',
        snippetB: 'return items.filter((item, idx) => items.findIndex(x => x.id === item.id) === idx);',
        betterSnippet: 'A',
        title: 'Dedupe by id',
        category: 'performance',
        explanation: 'Set lookup is O(n). The findIndex approach is O(n²) and is a common AI-generated slop pattern.',
        difficulty: 'medium',
        language: 'typescript',
      },
      {
        snippetA: 'if (user?.email) await sendMail(user.email);',
        snippetB: 'if (user && user.email) await sendMail(user.email);',
        betterSnippet: 'A',
        title: 'Optional chaining',
        category: 'readability',
        explanation: 'Both guard access, but optional chaining expresses intent more clearly when user may be nullish.',
        difficulty: 'easy',
        language: 'typescript',
      },
      {
        snippetA: 'const total = values.reduce((sum, n) => sum + n, 0);',
        snippetB: 'let total = 0;\nfor (let i = 0; i <= values.length; i++) total += values[i];',
        betterSnippet: 'A',
        title: 'Summing arrays',
        category: 'correctness',
        explanation: 'Snippet B uses <= and reads past the array end, producing NaN. reduce with an initial value is safer.',
        difficulty: 'medium',
        language: 'javascript',
      },
    ],
  },
  {
    languages: ['python'],
    items: [
      {
        snippetA: 'with open(path) as f:\n    return f.read()',
        snippetB: 'f = open(path)\ndata = f.read()\nreturn data',
        betterSnippet: 'A',
        title: 'File handles',
        category: 'correctness',
        explanation: 'The context manager closes the file even on exceptions. B leaks handles when errors occur.',
        difficulty: 'easy',
        language: 'python',
      },
    ],
  },
  {
    languages: ['general', 'other', 'unknown'],
    items: [
      {
        snippetA: 'if (attempts >= MAX_RETRIES) {\n  throw new Error("max retries exceeded");\n}',
        snippetB: 'if (attempts >= MAX_RETRIES) {\n  // give up\n  return;\n}',
        betterSnippet: 'A',
        title: 'Failure signaling',
        category: 'correctness',
        explanation: 'Silent returns on exhausted retries hide failures. Explicit errors make debugging and monitoring possible.',
        difficulty: 'medium',
        language: 'code',
      },
      {
        snippetA: 'const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");',
        snippetB: 'const slug = name.toLowerCase().replace(" ", "-");',
        betterSnippet: 'A',
        title: 'Slug sanitization',
        category: 'security',
        explanation: 'Replacing only spaces leaves punctuation and path-like characters. A full sanitize step avoids unsafe filenames/URLs.',
        difficulty: 'hard',
        language: 'code',
      },
    ],
  },
];

function normalizeLanguage(language: string | undefined): string {
  const lang = (language || 'general').toLowerCase();
  if (lang.includes('typescript') || lang === 'ts') return 'typescript';
  if (lang.includes('javascript') || lang === 'js') return 'javascript';
  if (lang.includes('markdown') || lang === 'md') return 'markdown';
  if (lang.includes('python') || lang === 'py') return 'python';
  return lang;
}

function pickBank<T extends { languages: string[]; items: TItem[] }, TItem>(
  banks: T[],
  languages: string[],
): TItem[] {
  const normalized = languages.map(normalizeLanguage);
  for (const lang of normalized) {
    const bank = banks.find(entry => entry.languages.includes(lang));
    if (bank && bank.items.length > 0) return bank.items;
  }
  const general = banks.find(entry => entry.languages.includes('general'));
  return general?.items ?? banks[0]?.items ?? [];
}

function pickItems<T extends { difficulty: string; topic?: string; title?: string }>(
  items: T[],
  difficulty: QuizDifficulty,
  seenTopics: string[],
  count: number,
  topicField: 'topic' | 'title',
): T[] {
  const seen = new Set(seenTopics.map(s => s.toLowerCase()));
  const preferred = items.filter(item => item.difficulty === difficulty);
  const pool = (preferred.length >= count ? preferred : items)
    .filter(item => !seen.has(String(item[topicField] ?? '').toLowerCase()));

  const source = pool.length >= count ? pool : items;
  const start = Math.abs(hashString(`${difficulty}:${seenTopics.join(',')}:${source.length}`)) % Math.max(1, source.length);
  const picked: T[] = [];
  for (let i = 0; i < source.length && picked.length < count; i++) {
    const item = source[(start + i) % source.length];
    if (!picked.includes(item)) picked.push(item);
  }
  return picked.slice(0, count);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}

export function generateBuiltinQuiz(
  languages: string[],
  difficulty: QuizDifficulty,
  seenTopics: string[] = [],
): BuiltinQuizQuestion[] {
  const items = pickBank(QUIZ_BANK, languages);
  return pickItems(items, difficulty, seenTopics, 3, 'topic');
}

export function generateBuiltinCodeComparison(
  languages: string[],
  difficulty: QuizDifficulty,
  seenTopics: string[] = [],
): BuiltinCodeRound[] {
  const items = pickBank(CODE_BANK, languages);
  return pickItems(items, difficulty, seenTopics, 3, 'title');
}
