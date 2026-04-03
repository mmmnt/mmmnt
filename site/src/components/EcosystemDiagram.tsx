import { useState } from 'preact/hooks';
import type { EcosystemTool, DataFlow, EnvelopeField } from '../data/examples.types';

interface Props {
  tools: EcosystemTool[];
  dataFlow: DataFlow[];
  envelope: {
    name: string;
    description: string;
    fields: EnvelopeField[];
  };
}

const toolColors: Record<string, string> = {
  sift: 'var(--color-sift)',
  moment: 'var(--color-moment)',
  forge: 'var(--color-forge)',
};

export default function EcosystemDiagram({ tools, dataFlow, envelope }: Props) {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [showEnvelope, setShowEnvelope] = useState(false);

  const active = tools.find((t) => t.id === activeTool);

  return (
    <div class="eco-diagram">
      {/* Flow visualization */}
      <div class="eco-diagram__flow">
        {tools.map((tool, i) => (
          <div key={tool.id} class="eco-diagram__tool-group">
            {i > 0 && (
              <div class="eco-diagram__arrow">
                <svg width="100%" height="40" viewBox="0 0 60 40" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <marker id={`arrow-${tool.id}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                      <path d="M0,0 L8,3 L0,6" fill={toolColors[tool.id]} />
                    </marker>
                  </defs>
                  <line
                    x1="0" y1="20" x2="50" y2="20"
                    stroke={toolColors[tool.id]}
                    stroke-width="2"
                    stroke-dasharray="6 4"
                    marker-end={`url(#arrow-${tool.id})`}
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="10"
                      to="0"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </line>
                </svg>
                <span class="eco-diagram__arrow-label">
                  {dataFlow[i - 1]?.channel}
                </span>
              </div>
            )}

            <button
              class={`eco-diagram__tool ${activeTool === tool.id ? 'eco-diagram__tool--active' : ''}`}
              style={`--tool-color: ${toolColors[tool.id]}`}
              onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
              aria-expanded={activeTool === tool.id}
              aria-label={`${tool.name}: ${tool.tagline}`}
              type="button"
              id={tool.id}
            >
              <div class="eco-diagram__tool-header">
                <span class="eco-diagram__tool-position">{tool.position}</span>
                <h3 class="eco-diagram__tool-name">{tool.name}</h3>
                <p class="eco-diagram__tool-tagline">{tool.tagline}</p>
              </div>
              {tool.output !== 'Coming soon' ? (
                <code class="eco-diagram__tool-output">{tool.output}</code>
              ) : (
                <span class="eco-diagram__tool-soon">Coming soon</span>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {active && (
        <div class="eco-diagram__detail" role="region" aria-label={`${active.name} details`}>
          <h4 class="eco-diagram__detail-name" style={`color: ${toolColors[active.id]}`}>
            {active.name}
          </h4>
          <p class="eco-diagram__detail-desc">{active.description}</p>
          {active.events.length > 0 && (
            <div class="eco-diagram__events">
              <h5 class="eco-diagram__events-title">Published Events</h5>
              <ul class="eco-diagram__events-list" role="list">
                {active.events.map((event) => (
                  <li key={event}>
                    <code>{event}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Envelope section */}
      <div class="eco-diagram__envelope-section">
        <button
          class="eco-diagram__envelope-toggle"
          onClick={() => setShowEnvelope(!showEnvelope)}
          aria-expanded={showEnvelope}
          type="button"
        >
          <code>{envelope.name}</code>
          <span class="eco-diagram__envelope-hint">
            {showEnvelope ? 'Hide' : 'Show'} envelope schema
          </span>
        </button>

        {showEnvelope && (
          <div class="eco-diagram__envelope" role="region" aria-label="ComplaiEventEnvelope schema">
            <p class="eco-diagram__envelope-desc">{envelope.description}</p>
            <table class="eco-diagram__envelope-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {envelope.fields.map((field) => (
                  <tr key={field.name}>
                    <td><code>{field.name}</code></td>
                    <td><code class="eco-diagram__type">{field.type}</code></td>
                    <td>{field.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
