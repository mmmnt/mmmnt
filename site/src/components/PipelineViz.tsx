import { useState } from 'preact/hooks';
import type { PipelineStage } from '../data/examples.types';

interface Props {
  stages: PipelineStage[];
}

const stageColors: Record<string, string> = {
  parse: 'var(--color-parse)',
  derive: 'var(--color-derive)',
  generate: 'var(--color-generate)',
  emit: 'var(--color-emit)',
};

export default function PipelineViz({ stages }: Props) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <section class="pipeline">
      <div class="pipeline__inner">
        <h2 class="pipeline__title">The Moment Pipeline</h2>
        <p class="pipeline__subtitle">
          From specification to production-ready artifacts in four deterministic stages.
        </p>

        <div class="pipeline__flow">
          {/* Input node */}
          <div class="pipeline__node pipeline__node--input">
            <div class="pipeline__node-icon">.moment</div>
            <span class="pipeline__node-label">Specification</span>
          </div>

          {stages.map((stage, i) => (
            <div key={stage.id} class="pipeline__stage-group">
              <div class="pipeline__connector">
                <svg width="40" height="2" aria-hidden="true">
                  <line
                    x1="0"
                    y1="1"
                    x2="40"
                    y2="1"
                    stroke={stageColors[stage.id] || 'var(--color-border)'}
                    stroke-width="2"
                    stroke-dasharray="4 4"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="8"
                      to="0"
                      dur="0.8s"
                      repeatCount="indefinite"
                    />
                  </line>
                </svg>
              </div>

              <button
                class={`pipeline__node pipeline__node--stage ${active === stage.id ? 'pipeline__node--active' : ''}`}
                style={`--stage-color: ${stageColors[stage.id]}`}
                onClick={() => setActive(active === stage.id ? null : stage.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setActive(null);
                }}
                aria-expanded={active === stage.id}
                aria-label={`${stage.label} stage: ${stage.description}`}
                type="button"
              >
                <div class="pipeline__node-badge">{i + 1}</div>
                <span class="pipeline__node-label">{stage.label}</span>
                <span class="pipeline__node-package">{stage.package}</span>
              </button>

              {active === stage.id && (
                <div class="pipeline__detail" role="region" aria-label={`${stage.label} details`}>
                  <p class="pipeline__detail-desc">{stage.description}</p>
                  <div class="pipeline__detail-io">
                    <span class="pipeline__io-label">Input</span>
                    <code>{stage.input}</code>
                    <span class="pipeline__io-arrow" aria-hidden="true">&rarr;</span>
                    <span class="pipeline__io-label">Output</span>
                    <code>{stage.output}</code>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
