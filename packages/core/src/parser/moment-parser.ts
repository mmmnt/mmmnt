import {
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import { parseHelper } from 'langium/test';
import { MomentGeneratedModule, MomentGeneratedSharedModule } from '../generated/module.js';
import type { MomentFile } from '../generated/ast.js';
import type { ParseResult, Diagnostic } from '../ir/index.js';
import { astToIr } from './ast-to-ir.js';
import type { LangiumDocument } from 'langium';

export class MomentParser {
  private readonly parse: (input: string) => Promise<LangiumDocument<MomentFile>>;

  constructor() {
    const shared = inject(
      createDefaultSharedCoreModule(EmptyFileSystem),
      MomentGeneratedSharedModule,
    );
    const services = inject(createDefaultCoreModule({ shared }), MomentGeneratedModule);
    shared.ServiceRegistry.register(services);
    this.parse = parseHelper<MomentFile>(services);
  }

  async parseContent(content: string): Promise<ParseResult> {
    const doc = await this.parse(content);
    const diagnostics: Diagnostic[] = [
      ...doc.parseResult.lexerErrors.map((e) => ({
        severity: 'error' as const,
        message: e.message,
      })),
      ...doc.parseResult.parserErrors.map((e) => ({
        severity: 'error' as const,
        message: e.message,
      })),
    ];

    if (diagnostics.length > 0) {
      return { success: false, diagnostics };
    }

    const ir = astToIr(doc.parseResult.value);
    return { success: true, ir, diagnostics: [] };
  }
}
