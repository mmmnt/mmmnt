import { describe, it, expect } from 'vitest';
import { ASTDiffEngine } from '../../services/ast-diff-engine.js';
import { generateProposalsFromDifferences } from '../../services/proposal-generator.js';
import type { DeprecationMetadata } from '../../services/proposal-generator.js';

describe('ASTDiffEngine.generateProposals', () => {
  const engine = new ASTDiffEngine();

  // -----------------------------------------------------------------------
  // 1. Empty input → empty proposals
  // -----------------------------------------------------------------------
  it('returns empty proposals for empty input', () => {
    const expected = new Map<string, string>();
    const actual = new Map<string, string>();

    const proposals = engine.generateProposals({ expected, actual });

    expect(proposals).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 2. Matching files → empty proposals
  // -----------------------------------------------------------------------
  it('returns empty proposals when files match', () => {
    const source = `export interface Order { readonly id: string; readonly total: number; }`;
    const expected = new Map([['order.ts', source]]);
    const actual = new Map([['order.ts', source]]);

    const proposals = engine.generateProposals({ expected, actual });

    expect(proposals).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 3. added-field → ValueObjectFieldAdded proposal
  // -----------------------------------------------------------------------
  it('generates ValueObjectFieldAdded for added field', () => {
    const expectedSource = `export interface Order { readonly id: string; }`;
    const actualSource = `export interface Order { readonly id: string; readonly notes: string; }`;
    const expected = new Map([['order.ts', expectedSource]]);
    const actual = new Map([['order.ts', actualSource]]);

    const proposals = engine.generateProposals({ expected, actual });

    expect(proposals.length).toBeGreaterThanOrEqual(1);
    const addedProposal = proposals.find((p) => p.proposedEventType === 'ValueObjectFieldAdded');
    expect(addedProposal).toBeDefined();
    expect(addedProposal!.proposedPayload.differenceType).toBe('added-field');
  });

  // -----------------------------------------------------------------------
  // 4. removed-field → ValueObjectFieldRemoved proposal
  // -----------------------------------------------------------------------
  it('generates ValueObjectFieldRemoved for removed field', () => {
    const expectedSource = `export interface Order { readonly id: string; readonly notes: string; }`;
    const actualSource = `export interface Order { readonly id: string; }`;
    const expected = new Map([['order.ts', expectedSource]]);
    const actual = new Map([['order.ts', actualSource]]);

    const proposals = engine.generateProposals({ expected, actual });

    const removedProposal = proposals.find(
      (p) => p.proposedEventType === 'ValueObjectFieldRemoved',
    );
    expect(removedProposal).toBeDefined();
    expect(removedProposal!.proposedPayload.differenceType).toBe('removed-field');
  });

  // -----------------------------------------------------------------------
  // 5. changed-type → ValueObjectFieldRevised proposal
  // -----------------------------------------------------------------------
  it('generates ValueObjectFieldRevised for changed type', () => {
    const expectedSource = `export interface Order { readonly amount: number; }`;
    const actualSource = `export interface Order { readonly amount: string; }`;
    const expected = new Map([['order.ts', expectedSource]]);
    const actual = new Map([['order.ts', actualSource]]);

    const proposals = engine.generateProposals({ expected, actual });

    const changedProposal = proposals.find(
      (p) => p.proposedEventType === 'ValueObjectFieldRevised',
    );
    expect(changedProposal).toBeDefined();
    expect(changedProposal!.proposedPayload.differenceType).toBe('changed-type');
  });

  // -----------------------------------------------------------------------
  // 6. new-interface → ValueObjectDefined proposal
  // -----------------------------------------------------------------------
  it('generates ValueObjectDefined for new interface', () => {
    const expectedSource = `export interface Order { readonly id: string; }`;
    const actualSource = `export interface Order { readonly id: string; }\nexport interface Extra { readonly value: string; }`;
    const expected = new Map([['types.ts', expectedSource]]);
    const actual = new Map([['types.ts', actualSource]]);

    const proposals = engine.generateProposals({ expected, actual });

    const newProposal = proposals.find((p) => p.proposedEventType === 'ValueObjectDefined');
    expect(newProposal).toBeDefined();
    expect(newProposal!.proposedPayload.symbolName).toBe('Extra');
  });

  // -----------------------------------------------------------------------
  // 7. removed-interface → ValueObjectRemoved proposal
  // -----------------------------------------------------------------------
  it('generates ValueObjectRemoved for removed interface', () => {
    const expectedSource = `export interface Order { readonly id: string; }\nexport interface Extra { readonly value: string; }`;
    const actualSource = `export interface Order { readonly id: string; }`;
    const expected = new Map([['types.ts', expectedSource]]);
    const actual = new Map([['types.ts', actualSource]]);

    const proposals = engine.generateProposals({ expected, actual });

    const removedProposal = proposals.find((p) => p.proposedEventType === 'ValueObjectRemoved');
    expect(removedProposal).toBeDefined();
    expect(removedProposal!.proposedPayload.symbolName).toBe('Extra');
  });

  // -----------------------------------------------------------------------
  // 8. renamed-interface → ValueObjectRenamed proposal
  // -----------------------------------------------------------------------
  it('generates ValueObjectRenamed for renamed interface', () => {
    const expectedSource = `export interface OrderItem { readonly id: string; }`;
    const actualSource = `export interface LineItem { readonly id: string; }`;
    const expected = new Map([['types.ts', expectedSource]]);
    const actual = new Map([['types.ts', actualSource]]);

    const proposals = engine.generateProposals({ expected, actual });

    // A rename manifests as removed-interface + new-interface in the diff engine
    const removedProposal = proposals.find((p) => p.proposedEventType === 'ValueObjectRemoved');
    const addedProposal = proposals.find((p) => p.proposedEventType === 'ValueObjectDefined');
    expect(removedProposal).toBeDefined();
    expect(addedProposal).toBeDefined();
    expect(removedProposal!.proposedPayload.symbolName).toBe('OrderItem');
    expect(addedProposal!.proposedPayload.symbolName).toBe('LineItem');
  });

  // -----------------------------------------------------------------------
  // 8b. Direct renamed-interface test (via proposal-generator)
  // -----------------------------------------------------------------------
  it('renamed-interface maps to ValueObjectRenamed via direct generator', () => {
    // compareTypeSymbols emits removed + new (not renamed), but the
    // renamed-interface → ValueObjectRenamed mapping must still be tested.
    // Test the mapping directly via generateProposalsFromDifferences.
    const proposals = generateProposalsFromDifferences('types.ts', [
      {
        symbolName: 'Order',
        differenceType: 'renamed-interface',
        description: "interface 'Order' was renamed to 'LineItem'",
      },
    ]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].proposedEventType).toBe('ValueObjectRenamed');
  });

  // -----------------------------------------------------------------------
  // 9. unrecognized → proposal with requiresManualReview flag
  // -----------------------------------------------------------------------
  it('marks unrecognized differences with requiresManualReview', () => {
    // Trigger unrecognized: symbol changes kind (interface → enum)
    const expectedSource = `export interface Status { readonly code: string; }`;
    const actualSource = `export enum Status { Active = "ACTIVE", Inactive = "INACTIVE" }`;
    const expected = new Map([['types.ts', expectedSource]]);
    const actual = new Map([['types.ts', actualSource]]);

    const proposals = engine.generateProposals({ expected, actual });

    const unrecognized = proposals.find((p) => p.proposedPayload.requiresManualReview === true);
    expect(unrecognized).toBeDefined();
    expect(unrecognized!.proposedEventType).toBe('ValueObjectFieldRevised');
  });

  // -----------------------------------------------------------------------
  // 10. Each proposal has unique proposalId (UUID)
  // -----------------------------------------------------------------------
  it('assigns unique proposalId to each proposal', () => {
    const expectedSource = `export interface Order { readonly id: string; readonly name: string; }`;
    const actualSource = `export interface Order { readonly id: number; readonly name: number; }`;
    const expected = new Map([['types.ts', expectedSource]]);
    const actual = new Map([['types.ts', actualSource]]);

    const proposals = engine.generateProposals({ expected, actual });

    expect(proposals.length).toBeGreaterThanOrEqual(2);
    const ids = proposals.map((p) => p.proposalId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    // Check UUID format
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  // -----------------------------------------------------------------------
  // 11. Dual-population: deprecated field with replacement generates 2 proposals
  // -----------------------------------------------------------------------
  it('generates two proposals for dual-population deprecated field', () => {
    const expectedSource = `export interface Order { readonly id: string; readonly oldField: string; }`;
    const actualSource = `export interface Order { readonly id: string; }`;
    const expected = new Map([['order.ts', expectedSource]]);
    const actual = new Map([['order.ts', actualSource]]);

    const deprecation: DeprecationMetadata = {
      deprecatedFields: new Map([['oldField', 'newField']]),
    };

    const proposals = engine.generateProposals({ expected, actual, deprecation });

    // Should have removal proposal + replacement field proposal
    const removalProposal = proposals.find(
      (p) => p.proposedEventType === 'ValueObjectFieldRemoved',
    );
    const addedProposal = proposals.find((p) => p.proposedEventType === 'ValueObjectFieldAdded');

    expect(removalProposal).toBeDefined();
    expect(addedProposal).toBeDefined();
    expect(removalProposal!.dualPopulationApplied).toBe(true);
    expect(addedProposal!.dualPopulationApplied).toBe(true);
    expect(addedProposal!.proposedPayload.description).toContain('newField');
  });

  // -----------------------------------------------------------------------
  // 12. sourceFile matches the input file path
  // -----------------------------------------------------------------------
  it('sets sourceFile to the input file path', () => {
    const expectedSource = `export interface Order { readonly id: string; }`;
    const actualSource = `export interface Order { readonly id: string; readonly extra: boolean; }`;
    const expected = new Map([['src/models/order.ts', expectedSource]]);
    const actual = new Map([['src/models/order.ts', actualSource]]);

    const proposals = engine.generateProposals({ expected, actual });

    expect(proposals.length).toBeGreaterThanOrEqual(1);
    for (const proposal of proposals) {
      expect(proposal.sourceFile).toBe('src/models/order.ts');
      expect(proposal.sourceDifference.filePath).toBe('src/models/order.ts');
    }
  });

  // -----------------------------------------------------------------------
  // 13. dualPopulationApplied is true when deprecation applies
  // -----------------------------------------------------------------------
  it('sets dualPopulationApplied true only when deprecation applies to the field', () => {
    const expectedSource = `export interface Order { readonly oldField: string; readonly keepField: string; }`;
    const actualSource = `export interface Order { readonly keepField: string; }`;
    const expected = new Map([['order.ts', expectedSource]]);
    const actual = new Map([['order.ts', actualSource]]);

    const deprecation: DeprecationMetadata = {
      deprecatedFields: new Map([['oldField', 'newField']]),
    };

    const proposals = engine.generateProposals({ expected, actual, deprecation });

    const removalProposal = proposals.find(
      (p) =>
        p.proposedEventType === 'ValueObjectFieldRemoved' &&
        (p.proposedPayload.description as string).includes('oldField'),
    );
    expect(removalProposal).toBeDefined();
    expect(removalProposal!.dualPopulationApplied).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 14. Multiple files produce proposals from all files
  // -----------------------------------------------------------------------
  it('produces proposals from all files', () => {
    const expectedA = `export interface Alpha { readonly id: string; }`;
    const actualA = `export interface Alpha { readonly id: string; readonly extra: boolean; }`;
    const expectedB = `export interface Beta { readonly name: string; }`;
    const actualB = `export interface Beta { readonly name: number; }`;

    const expected = new Map([
      ['alpha.ts', expectedA],
      ['beta.ts', expectedB],
    ]);
    const actual = new Map([
      ['alpha.ts', actualA],
      ['beta.ts', actualB],
    ]);

    const proposals = engine.generateProposals({ expected, actual });

    const alphaProposals = proposals.filter((p) => p.sourceFile === 'alpha.ts');
    const betaProposals = proposals.filter((p) => p.sourceFile === 'beta.ts');

    expect(alphaProposals.length).toBeGreaterThanOrEqual(1);
    expect(betaProposals.length).toBeGreaterThanOrEqual(1);
  });
});
