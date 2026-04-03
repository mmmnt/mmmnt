import { useState } from 'preact/hooks';

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

export default function CodePanel({ tabs, title }: Props) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');
  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];

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
              <span class="code-panel__tab-dot" style={`--dot-color: var(--color-${tab.id === 'moment' ? 'accent' : tab.id === 'typescript' ? 'emit' : 'generate'})`} />
              {tab.label}
            </button>
          ))}
        </div>
        <div
          id={`panel-${current?.id}`}
          role="tabpanel"
          class="code-panel__content"
          tabIndex={0}
        >
          <pre><code class={`language-${current?.language}`}>{current?.code}</code></pre>
        </div>
      </div>
    </div>
  );
}
