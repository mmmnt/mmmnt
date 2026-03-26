import type { ImportResult, UpstreamFingerprint } from '../ir/index.js';
import { createHash } from 'node:crypto';

export interface SiftBuildingBlock {
  contextName: string;
  classification?: 'Core' | 'Supporting' | 'Generic';
  aggregates: Array<{
    name: string;
    identityField: { name: string; type: string };
    commands: Array<{
      name: string;
      inputs: Array<{ name: string; type: string }>;
      emitsEvent: string;
    }>;
    events: Array<{
      name: string;
      fields: Array<{ name: string; type: string }>;
    }>;
    valueObjects: Array<{
      name: string;
      fields: Array<{ name: string; type: string }>;
    }>;
  }>;
}

export interface SiftTimelineEvent {
  flowName: string;
  description?: string;
  lanes: Array<{
    id: string;
    label: string;
    classification?: string;
  }>;
  frames: Array<{
    label: string;
    nodes: Array<{
      laneId: string;
      nodeName: string;
      crossing?: {
        targetLaneId: string;
        relationshipType: string;
        contractFields: Array<{
          name: string;
          type: string;
          required: boolean;
        }>;
      };
    }>;
  }>;
}

export interface SiftImportInput {
  sourceProduct: string;
  sourceVersion: string;
  buildingBlocks: SiftBuildingBlock[];
  timelineEvents: SiftTimelineEvent[];
}

export class SiftSpecificationImporter {
  import(input: SiftImportInput): ImportResult {
    const contextFiles: Array<{ name: string; path: string }> = [];
    const flowFiles: Array<{ name: string; path: string }> = [];

    // Generate context files
    for (const block of input.buildingBlocks) {
      const fileName = block.contextName.toLowerCase().replace(/\s+/g, '-');
      contextFiles.push({
        name: block.contextName,
        path: `contexts/${fileName}.moment`,
      });
    }

    // Generate flow files
    for (const event of input.timelineEvents) {
      const fileName = event.flowName.toLowerCase().replace(/\s+/g, '-');
      flowFiles.push({
        name: event.flowName,
        path: `flows/${fileName}.moment`,
      });
    }

    // Generate fingerprint
    const contentHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');

    const fingerprint: UpstreamFingerprint = {
      source: input.sourceProduct,
      version: input.sourceVersion,
      hash: contentHash,
      importedAt: new Date().toISOString(),
    };

    return {
      contextFiles,
      flowFiles,
      manifestEntries: [...contextFiles, ...flowFiles],
      fingerprint,
      diagnostics: [],
    };
  }

  generateContextFile(block: SiftBuildingBlock): string {
    const lines: string[] = [];
    const classification = block.classification ? ` [${block.classification}]` : '';
    lines.push(`context "${block.contextName}"${classification}`);
    lines.push('');

    for (const agg of block.aggregates) {
      lines.push(`  aggregate "${agg.name}"`);
      lines.push(`    identity ${agg.identityField.name}: ${agg.identityField.type}`);
      lines.push('');

      for (const cmd of agg.commands) {
        lines.push(`    command ${cmd.name}`);
        if (cmd.inputs.length > 0) {
          const inputStr = cmd.inputs.map((i) => `${i.name}: ${i.type}`).join(', ');
          lines.push(`      input ${inputStr}`);
        }
        lines.push(`      emits ${cmd.emitsEvent}`);
        lines.push('');
      }

      for (const evt of agg.events) {
        lines.push(`    event ${evt.name}`);
        for (const field of evt.fields) {
          lines.push(`      ${field.name}: ${field.type}`);
        }
        lines.push('');
      }

      for (const vo of agg.valueObjects) {
        lines.push(`  value-object ${vo.name}`);
        for (const field of vo.fields) {
          lines.push(`    ${field.name}: ${field.type}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  generateFlowFile(event: SiftTimelineEvent): string {
    const lines: string[] = [];
    lines.push(`flow "${event.flowName}"`);
    if (event.description) {
      lines.push(`  description "${event.description}"`);
    }
    lines.push('');

    for (const lane of event.lanes) {
      const classification = lane.classification ? ` [${lane.classification}]` : '';
      lines.push(`  lane ${lane.id} "${lane.label}"${classification}`);
    }
    lines.push('');

    for (const frame of event.frames) {
      lines.push(`  frame "${frame.label}"`);
      for (const node of frame.nodes) {
        let nodeLine = `    ${node.laneId}: ${node.nodeName}`;
        if (node.crossing) {
          nodeLine += ` crosses-to ${node.crossing.targetLaneId} via ${node.crossing.relationshipType}`;
          lines.push(nodeLine);
          lines.push('      contract');
          for (const field of node.crossing.contractFields) {
            const req = field.required ? ' [required]' : '';
            lines.push(`        ${field.name}: ${field.type}${req}`);
          }
        } else {
          lines.push(nodeLine);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // SI-02: Idempotent — same input produces identical output
  isIdempotent(input: SiftImportInput): boolean {
    const result1 = this.import(input);
    const result2 = this.import(input);
    return (
      JSON.stringify(result1.contextFiles) === JSON.stringify(result2.contextFiles) &&
      JSON.stringify(result1.flowFiles) === JSON.stringify(result2.flowFiles) &&
      result1.fingerprint.hash === result2.fingerprint.hash
    );
  }
}
