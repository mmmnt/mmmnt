import { MomentParser } from '../parser/index.js';
import type { ParseResult } from '../ir/index.js';
import { readFileSync } from 'node:fs';

export interface RegenerateResult {
  filePath: string;
  parseResult: ParseResult;
}

export class RegenerateOnMomentFileChanged {
  private readonly parser: MomentParser;

  constructor(parser?: MomentParser) {
    this.parser = parser ?? new MomentParser();
  }

  async onFileChanged(filePath: string): Promise<RegenerateResult> {
    const content = readFileSync(filePath, 'utf-8');
    const parseResult = await this.parser.parseContent(content);
    return { filePath, parseResult };
  }
}
