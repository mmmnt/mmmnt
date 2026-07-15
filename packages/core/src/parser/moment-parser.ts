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
import type { MomentAddedServices } from '../validation/moment-validator.js';
import type { LangiumCoreServices } from 'langium';

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

    await this.services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

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

    const ir = astToIr(doc.parseResult.value);
    return { success: true, ir, diagnostics };
  }
}
