import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

interface Tab {
  id: string;
  label: string;
  language: string;
  code: string;
}

interface Props {
  tabs: Tab[];
  title?: string;
}

const DOT_COLORS: Record<string, string> = {
  moment: 'var(--color-accent)',
  typescript: 'var(--color-emit)',
  testScaffold: '#fbbf24',
  gherkin: 'var(--color-generate)',
  specDoc: '#f472b6',
  asyncApi: '#22d3ee',
  facetJson: 'var(--color-facet)',
};

function dotColor(id: string): string {
  return DOT_COLORS[id] ?? 'var(--color-text-tertiary)';
}

// ── Syntax Highlighting ──

type TokenRule = [RegExp, string];

const MOMENT_KEYWORDS =
  /\b(context|aggregate|identity|command|event|input|precondition|emits|value-object|invariant|scope|flow|lane|branch-lane|moment|crosses-to|via|contract|triggered-by|saga|policy|trigger|states|compensation|timeout|action|chains-to|description|when)\b/g;
const MOMENT_MARKERS = /\[(required|terminal|branch|Core|Supporting|Terminal|optional)\]/g;
const TS_KEYWORDS =
  /\b(export|import|from|interface|type|readonly|const|let|function|return|extends|implements|class|new|this|async|await|of|in)\b/g;
const GHERKIN_KEYWORDS =
  /\b(Feature|Scenario|Given|When|Then|And|But|Rule|Background|Scenario Outline|Examples)\b/g;
const TYPE_NAMES = /\b(string|number|boolean|UUID|DateTime|Date|Money|void|null|undefined|object)\b/g;
const STRINGS = /(["'])(?:(?=(\\?))\2[\s\S])*?\1/g;
const COMMENTS_LINE = /(\/\/.*$|#(?!.*\{).*$)/gm;
const GHERKIN_TAGS = /(@[\w:.-]+)/g;
const GHERKIN_TABLES = /^(\s*\|.*\|)\s*$/gm;
const YAML_KEYS = /^(\s*[\w-]+)(?=\s*:)/gm;
const YAML_BOOLEANS = /\b(true|false)\b/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function applyTokens(code: string, rules: TokenRule[]): string {
  // Use a placeholder approach to avoid double-replacing
  const placeholders: string[] = [];
  let result = escapeHtml(code);

  for (const [regex, className] of rules) {
    regex.lastIndex = 0;
    result = result.replace(regex, (match) => {
      const idx = placeholders.length;
      placeholders.push(`<span class="${className}">${match}</span>`);
      return `\x00${idx}\x00`;
    });
  }

  // Restore placeholders
  return result.replace(/\x00(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]);
}

function highlightMoment(code: string): string {
  return applyTokens(code, [
    [COMMENTS_LINE, 'token-comment'],
    [STRINGS, 'token-string'],
    [MOMENT_MARKERS, 'token-field-marker'],
    [MOMENT_KEYWORDS, 'token-keyword'],
    [TYPE_NAMES, 'token-type'],
  ]);
}

function highlightTypeScript(code: string): string {
  return applyTokens(code, [
    [COMMENTS_LINE, 'token-comment'],
    [STRINGS, 'token-string'],
    [TS_KEYWORDS, 'token-keyword'],
    [TYPE_NAMES, 'token-type'],
  ]);
}

function highlightGherkin(code: string): string {
  return applyTokens(code, [
    [COMMENTS_LINE, 'token-comment'],
    [GHERKIN_TAGS, 'token-tag'],
    [GHERKIN_TABLES, 'token-table'],
    [STRINGS, 'token-string'],
    [GHERKIN_KEYWORDS, 'token-keyword'],
  ]);
}

function highlightYaml(code: string): string {
  return applyTokens(code, [
    [COMMENTS_LINE, 'token-comment'],
    [STRINGS, 'token-string'],
    [YAML_BOOLEANS, 'token-keyword'],
    [YAML_KEYS, 'token-type'],
  ]);
}

const JSON_KEYS = /"(\w+)"(?=\s*:)/g;
const JSON_STRINGS = /(?<=:\s*)"([^"]*?)"/g;
const JSON_NUMBERS = /(?<=:\s*)\b(\d+\.?\d*)\b/g;
const JSON_BOOLEANS = /\b(true|false|null)\b/g;

function highlightJson(code: string): string {
  return applyTokens(code, [
    [COMMENTS_LINE, 'token-comment'],
    [JSON_STRINGS, 'token-string'],
    [JSON_BOOLEANS, 'token-keyword'],
    [JSON_NUMBERS, 'token-type'],
    [JSON_KEYS, 'token-keyword'],
  ]);
}

function highlightCode(code: string, language: string): string {
  switch (language) {
    case 'moment':
      return highlightMoment(code);
    case 'typescript':
      return highlightTypeScript(code);
    case 'gherkin':
      return highlightGherkin(code);
    case 'yaml':
      return highlightYaml(code);
    case 'json':
      return highlightJson(code);
    default:
      return escapeHtml(code);
  }
}

// ── Markdown Rendering ──

function renderMarkdown(md: string): string {
  let html = escapeHtml(md);

  // Code fences (before other transformations)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) => {
      if (lang === 'mermaid') {
        return `<div class="prose-mermaid"><div class="prose-mermaid__label">Mermaid Diagram</div><pre><code>${code.trim()}</code></pre></div>`;
      }
      return `<pre class="prose-code"><code>${code.trim()}</code></pre>`;
    },
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="prose-inline-code">$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4 class="prose-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="prose-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="prose-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="prose-h1">$1</h1>');

  // Tables
  html = html.replace(
    /((?:^\|.+\|\s*\n)+)/gm,
    (tableBlock) => {
      const rows = tableBlock.trim().split('\n');
      let table = '<table class="prose-table">';
      rows.forEach((row, i) => {
        // Skip separator rows (|---|---|)
        if (/^\|[\s-:|]+\|$/.test(row)) return;
        const cells = row
          .split('|')
          .filter((c) => c.trim() !== '');
        const tag = i === 0 ? 'th' : 'td';
        const rowTag = i === 0 ? 'thead' : '';
        if (i === 0) table += '<thead>';
        if (i === 1) table += '</thead><tbody>'; // after header, skip separator
        table += '<tr>';
        cells.forEach((cell) => {
          table += `<${tag}>${cell.trim()}</${tag}>`;
        });
        table += '</tr>';
      });
      table += '</tbody></table>';
      return table;
    },
  );

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="prose-blockquote">$1</blockquote>');

  // List items
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul class="prose-list">$1</ul>');

  // Paragraphs (lines not already wrapped)
  html = html.replace(/^(?!<[hupoltbd]|<blockquote|<li|<div|<pre)(.+)$/gm, (_, line) => {
    if (line.trim() === '') return '';
    return `<p>${line}</p>`;
  });

  // Clean up extra whitespace
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}

// ── Component ──

export default function CodePanel({ tabs, title }: Props) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');
  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const isMarkdown = current?.language === 'markdown';

  return (
    <div class="code-panel">
      {title && <h3 class="code-panel__title">{title}</h3>}
      <div class="code-panel__container">
        <div class="code-panel__tabs" role="tablist" aria-label="Code examples">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              class={`code-panel__tab ${activeTab === tab.id ? 'code-panel__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <span class="code-panel__tab-dot" style={`--dot-color: ${dotColor(tab.id)}`} />
              {tab.label}
            </button>
          ))}
        </div>
        <div
          id={`panel-${current?.id}`}
          role="tabpanel"
          class={isMarkdown ? 'code-panel__prose' : 'code-panel__content'}
          tabIndex={0}
        >
          {isMarkdown ? (
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(current?.code ?? '') }} />
          ) : (
            <pre>
              <code
                class={`language-${current?.language}`}
                dangerouslySetInnerHTML={{
                  __html: highlightCode(current?.code ?? '', current?.language ?? ''),
                }}
              />
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
