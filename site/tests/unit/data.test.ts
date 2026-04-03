import { describe, it, expect } from 'vitest';
import features from '../../src/data/features.json';
import pipeline from '../../src/data/pipeline.json';
import ecosystem from '../../src/data/ecosystem.json';
import examples from '../../src/data/examples.json';

describe('features.json', () => {
  it('has 6 features', () => {
    expect(features).toHaveLength(6);
  });

  it('each feature has required fields', () => {
    for (const f of features) {
      expect(f).toHaveProperty('id');
      expect(f).toHaveProperty('title');
      expect(f).toHaveProperty('description');
      expect(f).toHaveProperty('icon');
    }
  });

  it('has unique IDs', () => {
    const ids = features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pipeline.json', () => {
  it('has 4 stages', () => {
    expect(pipeline).toHaveLength(4);
  });

  it('stages are in correct order', () => {
    const ids = pipeline.map((s) => s.id);
    expect(ids).toEqual(['parse', 'derive', 'generate', 'emit']);
  });

  it('each stage has a package reference', () => {
    for (const s of pipeline) {
      expect(s.package).toMatch(/^@mmmnt\//);
    }
  });
});

describe('ecosystem.json', () => {
  it('has 4 tools', () => {
    expect(ecosystem.tools).toHaveLength(4);
  });

  it('tools are in correct order', () => {
    const ids = ecosystem.tools.map((t) => t.id);
    expect(ids).toEqual(['sift', 'moment', 'facet', 'forge']);
  });

  it('envelope has required fields', () => {
    expect(ecosystem.envelope.name).toBe('ComplaiEventEnvelope');
    expect(ecosystem.envelope.fields.length).toBeGreaterThan(0);
  });

  it('dataFlow connects sift → moment → facet and moment → forge', () => {
    expect(ecosystem.dataFlow).toHaveLength(3);
    expect(ecosystem.dataFlow[0].from).toBe('sift');
    expect(ecosystem.dataFlow[0].to).toBe('moment');
    expect(ecosystem.dataFlow[1].from).toBe('moment');
    expect(ecosystem.dataFlow[1].to).toBe('facet');
    expect(ecosystem.dataFlow[2].from).toBe('moment');
    expect(ecosystem.dataFlow[2].to).toBe('forge');
  });
});

describe('examples.json', () => {
  it('has at least one example', () => {
    expect(examples.examples.length).toBeGreaterThan(0);
  });

  it('each example has all output formats', () => {
    for (const ex of examples.examples) {
      expect(ex.moment).toBeTruthy();
      expect(ex.typescript).toBeTruthy();
      expect(ex.testScaffold).toBeTruthy();
      expect(ex.gherkin).toBeTruthy();
      expect(ex.specDoc).toBeTruthy();
      expect(ex.asyncApi).toBeTruthy();
    }
  });

  it('each example includes flow definitions', () => {
    for (const ex of examples.examples) {
      expect(ex.moment).toContain('flow ');
      expect(ex.moment).toContain('lane ');
      expect(ex.moment).toContain('moment ');
    }
  });
});
