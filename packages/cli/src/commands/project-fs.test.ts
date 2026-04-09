import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeOutputFiles } from './project-fs.js';

let outDir: string;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'moment-project-fs-'));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('writeOutputFiles', () => {
  it('writes relative files under baseDir', () => {
    const files = new Map<string, string>([
      ['src/a.ts', 'export const a = 1;'],
      ['src/nested/b.ts', 'export const b = 2;'],
    ]);

    const written = writeOutputFiles(files, outDir);

    expect(written).toHaveLength(2);
    expect(existsSync(join(outDir, 'src/a.ts'))).toBe(true);
    expect(existsSync(join(outDir, 'src/nested/b.ts'))).toBe(true);
    expect(readFileSync(join(outDir, 'src/a.ts'), 'utf-8')).toBe('export const a = 1;');
  });

  it('rejects absolute paths', () => {
    const files = new Map<string, string>([['/etc/passwd', 'pwned']]);

    expect(() => writeOutputFiles(files, outDir)).toThrow(/absolute path/);
    expect(existsSync('/etc/passwd')).toBe(true); // pre-existing — not tampered with
  });

  it('rejects relative paths that escape baseDir via ..', () => {
    const files = new Map<string, string>([['../escaped.ts', 'pwned']]);

    expect(() => writeOutputFiles(files, outDir)).toThrow(/Path traversal/);
    // Nothing should have been written
    expect(existsSync(join(outDir, '..', 'escaped.ts'))).toBe(false);
  });

  it('rejects deeply traversing relative paths', () => {
    const files = new Map<string, string>([['src/../../../../etc/evil.ts', 'pwned']]);

    expect(() => writeOutputFiles(files, outDir)).toThrow(/Path traversal/);
  });

  it('does not treat sibling directories with a shared prefix as inside baseDir', () => {
    // Create a sibling directory whose name is a string prefix of baseDir's basename.
    // Without a path-separator boundary, a naive startsWith check would accept this.
    const files = new Map<string, string>([['../' + 'x.ts', 'pwned']]);
    expect(() => writeOutputFiles(files, outDir)).toThrow(/Path traversal/);
  });
});
