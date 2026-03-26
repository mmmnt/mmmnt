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

  async parseContent(content: string): Promise<ParseResult> {
    const doc = this.services.shared.workspace.LangiumDocumentFactory.fromString<MomentFile>(
      content,
      URI.parse('memory:///parse.moment'),
    );

    await this.services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

    const diagnostics: Diagnostic[] = [
      ...doc.parseResult.lexerErrors.map((e) => ({
        severity: 'error' as const,
        message: e.message,
      })),
      ...doc.parseResult.parserErrors.map((e) => ({
        severity: 'error' as const,
        message: e.message,
      })),
      ...(doc.diagnostics ?? []).map((d) => ({
        severity: d.severity === 1 ? ('error' as const) : ('warning' as const),
        message: d.message,
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
