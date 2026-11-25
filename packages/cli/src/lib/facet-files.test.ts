import { describe, it, expect } from 'vitest';
import { ScenarioFileNames, scenarioFileName, slug, topologyFileName } from './facet-files.js';

const N5 = { id: 'flow-N5 - Seat request', name: 'N5 - Seat request' };

describe('facet file names', () => {
  it('slugs a flow name the way topology files always were', () => {
    expect(slug('N5 - Seat request')).toBe('n5-seat-request');
    expect(slug('--A__b--')).toBe('a-b');
    expect(topologyFileName(N5)).toBe('topology-n5-seat-request.json');
  });

  it('names a scenario from the flow slug and what its id adds after the flow id', () => {
    expect(scenarioFileName(N5, 'scenario-flow-N5 - Seat request')).toBe(
      'scenario-n5-seat-request.json',
    );
    expect(scenarioFileName(N5, 'scenario-flow-N5 - Seat request-3')).toBe(
      'scenario-n5-seat-request-3.json',
    );
    expect(scenarioFileName(N5, 'scenario-flow-N5 - Seat request-timeout-SeatHold')).toBe(
      'scenario-n5-seat-request-timeout-seathold.json',
    );
  });

  it('slugs the whole id of a scenario whose id does not start with its flow id', () => {
    expect(scenarioFileName(N5, 'Custom Id')).toBe('scenario-n5-seat-request-custom-id.json');
  });

  it('gives one scenario its name again, and refuses a second id for the same name', () => {
    const names = new ScenarioFileNames();
    expect(names.name(N5, 'scenario-flow-N5 - Seat request-0')).toBe(
      'scenario-n5-seat-request-0.json',
    );
    expect(names.name(N5, 'scenario-flow-N5 - Seat request-0')).toBe(
      'scenario-n5-seat-request-0.json',
    );
    expect(() => names.name(N5, 'scenario-flow-N5 - Seat request--0')).toThrow(
      /would both be written to scenario-n5-seat-request-0\.json/,
    );
  });
});
