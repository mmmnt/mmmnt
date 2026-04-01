/**
 * ManifestUpdater — Syncs .manifest.yaml with discovered project state
 *
 * After any CLI command that processes .moment files, the manifest
 * should reflect what's actually in the project — contexts discovered,
 * flows discovered. This ensures `moment init` state is never stale.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { FileRef } from '../ir/manifest-configuration.js';

export interface ManifestUpdateResult {
  readonly updated: boolean;
  readonly contextsAdded: number;
  readonly flowsAdded: number;
}

export class ManifestUpdater {
  /**
   * Scan the project directory for .moment files and update
   * the manifest's contexts and flows lists accordingly.
   */
  updateFromDirectory(projectDir: string): ManifestUpdateResult {
    const manifestPath = join(projectDir, '.manifest.yaml');
    if (!existsSync(manifestPath)) {
      return { updated: false, contextsAdded: 0, flowsAdded: 0 };
    }

    const content = readFileSync(manifestPath, 'utf-8');
    const manifest = parseYaml(content) as Record<string, unknown>;

    const existingContexts = this.extractFileRefs(manifest.contexts);
    const existingFlows = this.extractFileRefs(manifest.flows);

    const discoveredContexts = this.scanDirectory(projectDir, '.moment/contexts', '.moment');
    const discoveredFlows = this.scanDirectory(projectDir, '.moment/flows', '.moment');

    // Also scan root .moment/ for unified files
    const unifiedFiles = this.scanDirectory(projectDir, '.moment', '.moment', false);
    for (const ref of unifiedFiles) {
      if (
        !discoveredContexts.some((c) => c.path === ref.path) &&
        !discoveredFlows.some((f) => f.path === ref.path)
      ) {
        discoveredContexts.push(ref);
      }
    }

    const newContexts = this.mergeRefs(existingContexts, discoveredContexts);
    const newFlows = this.mergeRefs(existingFlows, discoveredFlows);

    const contextsAdded = newContexts.length - existingContexts.length;
    const flowsAdded = newFlows.length - existingFlows.length;

    if (contextsAdded === 0 && flowsAdded === 0) {
      return { updated: false, contextsAdded: 0, flowsAdded: 0 };
    }

    manifest.contexts = newContexts;
    manifest.flows = newFlows;

    writeFileSync(manifestPath, stringifyYaml(manifest), 'utf-8');

    return { updated: true, contextsAdded, flowsAdded };
  }

  /**
   * Update manifest with context and flow names from a parsed IR.
   * Used when a specific file is parsed — adds entries for that file.
   */
  updateFromParsedFile(
    projectDir: string,
    filePath: string,
    contextNames: readonly string[],
    flowNames: readonly string[],
  ): ManifestUpdateResult {
    const manifestPath = join(projectDir, '.manifest.yaml');
    if (!existsSync(manifestPath)) {
      return { updated: false, contextsAdded: 0, flowsAdded: 0 };
    }

    const content = readFileSync(manifestPath, 'utf-8');
    const manifest = parseYaml(content) as Record<string, unknown>;

    const existingContexts = this.extractFileRefs(manifest.contexts);
    const existingFlows = this.extractFileRefs(manifest.flows);

    const relPath = relative(projectDir, filePath);
    let contextsAdded = 0;
    let flowsAdded = 0;

    for (const name of contextNames) {
      if (!existingContexts.some((c) => c.name === name)) {
        existingContexts.push({ name, path: relPath });
        contextsAdded++;
      }
    }

    for (const name of flowNames) {
      if (!existingFlows.some((f) => f.name === name)) {
        existingFlows.push({ name, path: relPath });
        flowsAdded++;
      }
    }

    if (contextsAdded === 0 && flowsAdded === 0) {
      return { updated: false, contextsAdded: 0, flowsAdded: 0 };
    }

    manifest.contexts = existingContexts;
    manifest.flows = existingFlows;

    writeFileSync(manifestPath, stringifyYaml(manifest), 'utf-8');

    return { updated: true, contextsAdded, flowsAdded };
  }

  private extractFileRefs(raw: unknown): FileRef[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (e): e is { name: string; path: string } =>
          e != null &&
          typeof e === 'object' &&
          typeof e.name === 'string' &&
          typeof e.path === 'string',
      )
      .map((e) => ({ name: e.name, path: e.path }));
  }

  private scanDirectory(
    projectDir: string,
    subDir: string,
    extension: string,
    recursive = true,
  ): FileRef[] {
    const dir = join(projectDir, subDir);
    if (!existsSync(dir)) return [];

    const refs: FileRef[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(extension)) {
          const entryPath = join(subDir, entry.name);
          const name = entry.name.replace(/\.moment$/, '');
          refs.push({ name, path: entryPath });
        } else if (recursive && entry.isDirectory()) {
          refs.push(...this.scanDirectory(projectDir, join(subDir, entry.name), extension, true));
        }
      }
    } catch {
      // Directory read error — return empty
    }
    return refs;
  }

  private mergeRefs(existing: FileRef[], discovered: FileRef[]): FileRef[] {
    const merged = [...existing];
    for (const ref of discovered) {
      if (!merged.some((m) => m.path === ref.path)) {
        merged.push(ref);
      }
    }
    return merged;
  }
}
