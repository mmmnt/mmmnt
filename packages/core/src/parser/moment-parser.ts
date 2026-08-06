import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
  URI,
} from 'langium';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../generated/module.js';
import { MomentModule, registerMomentValidationChecks } from '../moment-module.js';
import type { MomentFile } from '../generated/ast.js';
import type { ParseResult, Diagnostic } from '../ir/index.js';
import { astToIr } from './ast-to-ir.js';
import { buildCrossFileContext } from '../validation/moment-validator.js';
import { SchemaValidator } from '../services/schema-validator.js';
import type { MomentAddedServices } from '../validation/moment-validator.js';
import type { LangiumCoreServices } from 'langium';

/** Spec name = file basename without its extension (M-P12). */
function specNameFromPath(filePath: string): string {
  const segments = filePath.split(/[/\\]/);
  const base = segments[segments.length - 1];
  return base.replace(/\.[^.]+$/, '');
}

export class MomentParser {
  private readonly services: LangiumCoreServices & MomentAddedServices;

  constructor() {
    const shared = inject(
      createDefaultSharedCoreModule(EmptyFileSystem),
      MomentGeneratedSharedModule,
    );
    this.services = inject(
      createDefaultCoreModule({ shared }),
      MomentGeneratedModule,
      MomentModule,
    );
    shared.ServiceRegistry.register(this.services);
    registerMomentValidationChecks(this.services);
  }

  async parseContent(content: string, filePath?: string): Promise<ParseResult> {
    const doc = this.services.shared.workspace.LangiumDocumentFactory.fromString<MomentFile>(
      content,
      URI.parse('memory:///parse.moment'),
    );

    // Single-file cross-file wiring (M-P3): when the file declares BOTH
    // contexts and flows, its own declarations form the resolution context
    // for V1/V9/V11 (node placements) and SP-01/SP-02 (lanes/crossings).
    // Flow-only specs (zero context declarations) leave the context unset so
    // every cross-file check no-ops — they cannot be validated against
    // declarations they do not carry.
    const ast = doc.parseResult.value;
    const validator = this.services.validation.MomentValidator;
    const declaresContexts = ast.contexts.length > 0;
    const useCrossFileContext = declaresContexts && ast.flows.length > 0;
    if (useCrossFileContext) {
      validator.setCrossFileContext(buildCrossFileContext(ast));
    }
    try {
      await this.services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
    } finally {
      if (useCrossFileContext) {
        validator.clearCrossFileContext();
      }
    }

    const file = filePath ?? 'parse.moment';

    const diagnostics: Diagnostic[] = [
      // Chevrotain lexer errors carry 1-based line/column when available.
      ...doc.parseResult.lexerErrors.map((e) => ({
        severity: 'error' as const,
        message: e.message,
        source:
          typeof e.line === 'number' && typeof e.column === 'number'
            ? { file, line: e.line, column: e.column }
            : undefined,
      })),
      // Chevrotain recognition exceptions locate the offending token (1-based).
      ...doc.parseResult.parserErrors.map((e) => ({
        severity: 'error' as const,
        message: e.message,
        source:
          typeof e.token?.startLine === 'number' && typeof e.token?.startColumn === 'number'
            ? {
                file,
                line: e.token.startLine,
                column: e.token.startColumn,
                endLine: e.token.endLine,
                endColumn: e.token.endColumn,
              }
            : undefined,
      })),
      // LSP validation diagnostics use 0-based positions; SourceLocation is 1-based.
      ...(doc.diagnostics ?? []).map((d) => ({
        severity: d.severity === 1 ? ('error' as const) : ('warning' as const),
        message: d.message,
        source: d.range
          ? {
              file,
              line: d.range.start.line + 1,
              column: d.range.start.character + 1,
              endLine: d.range.end.line + 1,
              endColumn: d.range.end.character + 1,
            }
          : undefined,
      })),
    ];

    const hasError = diagnostics.some((d) => d.severity === 'error');
    if (hasError) {
      return { success: false, diagnostics };
    }

    const ir = astToIr(ast, filePath ? { name: specNameFromPath(filePath) } : undefined);

    // IR-level structural checks (SP-01…SP-04). Only meaningful when the file
    // declares contexts (flow-only guard as above); surfaced as warnings —
    // the spec already parsed and validated at the AST level, so IR-level
    // findings are consistency advisories, not parse failures.
    if (declaresContexts) {
      const schemaResult = new SchemaValidator().validate(ir);
      diagnostics.push(
        // No source position: these findings are about IR structure, not a
        // specific text range — fabricating an offset would be untruthful.
        ...schemaResult.diagnostics.map((d) => ({
          severity: 'warning' as const,
          message: d.message,
          ruleId: d.ruleId,
        })),
      );
    }

    return { success: true, ir, diagnostics };
  }
}
