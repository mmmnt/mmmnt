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
  facet: 'var(--color-facet)',
  forge: 'var(--color-forge)',
};

export default function EcosystemDiagram({ tools, dataFlow, envelope }: Props) {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [showEnvelope, setShowEnvelope] = useState(false);

  const active = tools.find((t) => t.id === activeTool);
  const getTool = (id: string) => tools.find((t) => t.id === id);
  const getFlow = (from: string, to: string) => dataFlow.find((f) => f.from === from && f.to === to);

  const sift = getTool('sift');
  const moment = getTool('moment');
  const facet = getTool('facet');
  const forge = getTool('forge');

  const siftToMoment = getFlow('sift', 'moment');
  const momentToFacet = getFlow('moment', 'facet');
  const momentToForge = getFlow('moment', 'forge');

  function renderTool(tool: EcosystemTool | undefined) {
    if (!tool) return null;
    return (
      <button
        class={`eco-diagram__tool ${activeTool === tool.id ? 'eco-diagram__tool--active' : ''}`}
        style={`--tool-color: ${toolColors[tool.id]}`}
        data-tool={tool.id}
        onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
        aria-expanded={activeTool === tool.id}
        aria-label={`${tool.name}: ${tool.tagline}`}
        type="button"
        id={tool.id}
      >
        <span class="eco-diagram__tool-position">{tool.position}</span>
        {tool.id === 'moment' ? (
          <img src="/logos/moment-wordmark.svg" alt="Moment" class="eco-diagram__tool-logo" />
        ) : (
          <h3 class="eco-diagram__tool-name">{tool.name}</h3>
        )}
        <p class="eco-diagram__tool-tagline">{tool.tagline}</p>
        {tool.output !== 'Coming soon' ? (
          <code class="eco-diagram__tool-output">{tool.output}</code>
        ) : (
          <span class="eco-diagram__tool-soon">Coming soon</span>
        )}
      </button>
    );
  }

  return (
    <div class="eco-diagram">
      {/* Grid layout showing hub topology */}
      <div class="eco-diagram__grid">
        {/* Row 1: Sift */}
        <div class="eco-diagram__cell eco-diagram__cell--sift">
          {renderTool(sift)}
        </div>

        {/* Connection: Sift → Moment */}
        <div class="eco-diagram__conn eco-diagram__conn--vertical">
          <div class="eco-diagram__conn-line" />
          <span class="eco-diagram__conn-label">{siftToMoment?.channel}</span>
        </div>

        {/* Row 2: Moment (hub) */}
        <div class="eco-diagram__cell eco-diagram__cell--moment">
          {renderTool(moment)}
        </div>

        {/* Connection: Moment → Facet + Forge (Y-fork) */}
        <div class="eco-diagram__conn eco-diagram__conn--fanout">
          <div class="eco-diagram__conn-stem" />
          <div class="eco-diagram__conn-fork">
            <div class="eco-diagram__conn-branch eco-diagram__conn-branch--left">
              <span class="eco-diagram__conn-label">{momentToFacet?.channel}</span>
            </div>
            <div class="eco-diagram__conn-branch eco-diagram__conn-branch--right">
              <span class="eco-diagram__conn-label">{momentToForge?.channel}</span>
            </div>
          </div>
        </div>

        {/* Row 3: Facet + Forge */}
        <div class="eco-diagram__cell eco-diagram__cell--downstream">
          <div class="eco-diagram__downstream-pair">
            {renderTool(facet)}
            {renderTool(forge)}
          </div>
        </div>
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
