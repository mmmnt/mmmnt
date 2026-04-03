import { useState } from 'preact/hooks';
import CodePanel from './CodePanel';

interface Example {
  id: string;
  title: string;
  description: string;
  moment: string;
  typescript: string;
  testScaffold: string;
  gherkin: string;
  specDoc: string;
  asyncApi: string;
}

interface Props {
  examples: Example[];
}

function buildTabs(ex: Example) {
  return [
    { id: 'moment', label: '.moment', language: 'moment', code: ex.moment },
    { id: 'typescript', label: 'TypeScript', language: 'typescript', code: ex.typescript },
    { id: 'testScaffold', label: 'Test Scaffold', language: 'typescript', code: ex.testScaffold },
    { id: 'gherkin', label: 'Gherkin', language: 'gherkin', code: ex.gherkin },
    { id: 'specDoc', label: 'Spec Doc', language: 'markdown', code: ex.specDoc },
    { id: 'asyncApi', label: 'AsyncAPI', language: 'yaml', code: ex.asyncApi },
  ];
}

function countPatterns(moment: string) {
  const contexts = (moment.match(/^context\s/gm) || []).length;
  const aggregates = (moment.match(/^\s+aggregate\s/gm) || []).length;
  const commands = (moment.match(/^\s+command\s/gm) || []).length;
  const events = (moment.match(/^\s+event\s/gm) || []).length;
  const flows = (moment.match(/^flow\s/gm) || []).length;
  const crossings = (moment.match(/crosses-to/g) || []).length;
  const branches = (moment.match(/\[branch\]/g) || []).length;
  const sagas = (moment.match(/^\s+saga\s/gm) || []).length;
  const policies = (moment.match(/^\s+policy\s/gm) || []).length;
  return { contexts, aggregates, commands, events, flows, crossings, branches, sagas, policies };
}

export default function ExampleSelector({ examples }: Props) {
  const [activeId, setActiveId] = useState(examples[0]?.id ?? '');
  const active = examples.find((ex) => ex.id === activeId) ?? examples[0];
  const stats = active ? countPatterns(active.moment) : null;

  return (
    <div class="example-selector">
      {/* Example tabs */}
      <div class="example-selector__tabs" role="tablist" aria-label="Select an example">
        {examples.map((ex) => (
          <button
            key={ex.id}
            role="tab"
            aria-selected={activeId === ex.id}
            class={`example-selector__tab ${activeId === ex.id ? 'example-selector__tab--active' : ''}`}
            onClick={() => setActiveId(ex.id)}
            type="button"
          >
            <strong>{ex.title}</strong>
            <span>{ex.description.split('.')[0]}</span>
          </button>
        ))}
      </div>

      {/* Stats bar */}
      {active && stats && (
        <div class="example-selector__stats">
          <span class="example-selector__stat-label">What Moment derived:</span>
          {stats.contexts > 0 && <span class="example-selector__stat">{stats.contexts} context{stats.contexts > 1 ? 's' : ''}</span>}
          {stats.aggregates > 0 && <span class="example-selector__stat">{stats.aggregates} aggregate{stats.aggregates > 1 ? 's' : ''}</span>}
          {stats.commands > 0 && <span class="example-selector__stat">{stats.commands} command{stats.commands > 1 ? 's' : ''}</span>}
          {stats.events > 0 && <span class="example-selector__stat">{stats.events} event{stats.events > 1 ? 's' : ''}</span>}
          {stats.flows > 0 && <span class="example-selector__stat">{stats.flows} flow{stats.flows > 1 ? 's' : ''}</span>}
          {stats.crossings > 0 && <span class="example-selector__stat">{stats.crossings} crossing{stats.crossings > 1 ? 's' : ''}</span>}
          {stats.branches > 0 && <span class="example-selector__stat">{stats.branches} branch{stats.branches > 1 ? 'es' : ''}</span>}
          {stats.sagas > 0 && <span class="example-selector__stat">{stats.sagas} saga{stats.sagas > 1 ? 's' : ''}</span>}
          {stats.policies > 0 && <span class="example-selector__stat">{stats.policies} polic{stats.policies > 1 ? 'ies' : 'y'}</span>}
        </div>
      )}

      {/* Code panel */}
      {active && <CodePanel tabs={buildTabs(active)} />}
    </div>
  );
}
