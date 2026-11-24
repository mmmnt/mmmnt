#!/usr/bin/env node
/**
 * Mirrors each package README onto a page of the GitHub wiki.
 *
 * Every `packages/<pkg>/README.md` becomes one page in a local clone of the
 * wiki. An `@mmmnt/<pkg>` package is written to `@mmmnt-<pkg>.md`; the VS Code
 * extension (`packages/vscode`) is written to `VS-Code-Extension.md`.
 *
 * Relative links are rewritten so they work from the wiki:
 *
 *   - a link to another package README (`../core/README.md`, `../core`) becomes
 *     a link to that package's wiki page; an anchor is kept
 *   - a link to any other file or directory in the repo becomes an absolute
 *     `https://github.com/<repo>/blob/<ref>/<path>` URL (`tree` for a directory)
 *   - an image becomes a `https://raw.githubusercontent.com/<repo>/<ref>/<path>` URL
 *   - an anchor on the same page (`#exit-codes`) and an absolute URL are left alone
 *
 * Links inside fenced code blocks and inline code are not touched.
 *
 * Each page starts with one line saying which README it is generated from.
 * A page that starts with that line and no longer has a README is deleted.
 * The script only writes files; committing and pushing is the caller's job.
 *
 * USAGE
 *
 *   node scripts/wiki-sync.mjs --wiki-dir <path> [--dry-run] [--repo <owner/name>] [--ref <branch>]
 *
 *   --wiki-dir  a clone of https://github.com/<repo>.wiki.git (required)
 *   --dry-run   print what would change and write nothing
 *   --repo      the repository links point at (default: $GITHUB_REPOSITORY or mmmnt/mmmnt)
 *   --ref       the branch links point at (default: main)
 *
 * EXIT CODES
 *
 *   0  pages written (or, with --dry-run, the changes printed)
 *   1  bad arguments, or no package README was found
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Packages whose wiki page is not named after the npm package. */
const PAGE_BY_DIRECTORY = { vscode: 'VS-Code-Extension' };

const NOTE_PREFIX = '> This page is generated from';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|ico)$/i;

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'wiki-dir': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      repo: { type: 'string', default: process.env.GITHUB_REPOSITORY || 'mmmnt/mmmnt' },
      ref: { type: 'string', default: 'main' },
    },
  });
  if (!values['wiki-dir']) {
    throw new Error('--wiki-dir <path> is required');
  }
  const wikiDir = resolve(values['wiki-dir']);
  if (!existsSync(wikiDir) || !statSync(wikiDir).isDirectory()) {
    throw new Error(`--wiki-dir ${wikiDir} is not a directory`);
  }
  return { wikiDir, dryRun: values['dry-run'], repo: values.repo, ref: values.ref };
}

/** The wiki page name for a package directory, or undefined when it has no page. */
function pageNameFor(directory, packageName) {
  if (PAGE_BY_DIRECTORY[directory]) return PAGE_BY_DIRECTORY[directory];
  if (packageName?.startsWith('@mmmnt/')) return packageName.replace('/', '-');
  return undefined;
}

function readPackageName(packageDir) {
  const manifest = join(packageDir, 'package.json');
  if (!existsSync(manifest)) return undefined;
  return JSON.parse(readFileSync(manifest, 'utf8')).name;
}

/** Every package with a README and a wiki page name, keyed by directory name. */
function discoverPackages(repoRoot) {
  const packagesDir = join(repoRoot, 'packages');
  const packages = new Map();
  for (const directory of readdirSync(packagesDir).sort()) {
    const packageDir = join(packagesDir, directory);
    const readme = join(packageDir, 'README.md');
    if (!existsSync(readme)) continue;
    const page = pageNameFor(directory, readPackageName(packageDir));
    if (!page) {
      console.warn(`skipped packages/${directory}: no wiki page name for it`);
      continue;
    }
    packages.set(directory, { directory, page, readme: `packages/${directory}/README.md` });
  }
  return packages;
}

function splitTarget(target) {
  const hash = target.indexOf('#');
  if (hash === -1) return { path: target, anchor: '' };
  return { path: target.slice(0, hash), anchor: target.slice(hash) };
}

function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

/** The package directory a repo path points at, when it is a package README or the package root. */
function packageOf(repoPath, packages) {
  const match = /^packages\/([^/]+)\/?(README\.md)?$/.exec(repoPath);
  if (!match) return undefined;
  return packages.get(match[1]);
}

function repoUrl(repoPath, ctx, { image }) {
  if (image) return `https://raw.githubusercontent.com/${ctx.repo}/${ctx.ref}/${repoPath}`;
  const full = join(ctx.repoRoot, repoPath);
  const kind = existsSync(full) && statSync(full).isDirectory() ? 'tree' : 'blob';
  return `https://github.com/${ctx.repo}/${kind}/${ctx.ref}/${repoPath}`;
}

/** Rewrites one link target found in `packages/<dir>/README.md`. */
function rewriteTarget(target, ctx, { image = false } = {}) {
  if (target === '' || target.startsWith('#') || isExternal(target)) return target;
  const { path, anchor } = splitTarget(target);
  const repoPath = posix.normalize(posix.join(ctx.baseDir, path)).replace(/\/$/, '');
  if (repoPath.startsWith('..')) return target;
  const linkedPackage = image ? undefined : packageOf(repoPath, ctx.packages);
  if (linkedPackage) return `${linkedPackage.page}${anchor}`;
  const treatAsImage = image || IMAGE_EXTENSIONS.test(repoPath);
  return `${repoUrl(repoPath, ctx, { image: treatAsImage })}${anchor}`;
}

/** Rewrites inline links, images, reference definitions and HTML src/href in one line of prose. */
function rewriteProse(text, ctx) {
  const target = String.raw`\(\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?)\s*\)`;
  return (
    text
      .replace(
        new RegExp(String.raw`(!?)\[([^\[\]]*)\]` + target, 'g'),
        (_m, bang, label, href, title) => {
          const rewritten = rewriteTarget(href, ctx, { image: bang === '!' });
          return `${bang}[${label}](${rewritten}${title})`;
        },
      )
      // A linked image, [![alt](img)](href): the image was rewritten above, now the outer link.
      .replace(
        new RegExp(String.raw`\[(!\[[^\[\]]*\]\([^)]*\))\]` + target, 'g'),
        (_m, image, href, title) => {
          return `[${image}](${rewriteTarget(href, ctx)}${title})`;
        },
      )
      .replace(
        /^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/,
        (_m, head, target) => head + rewriteTarget(target, ctx),
      )
      .replace(
        /\b(src|srcset)="([^"]+)"/g,
        (_m, attr, target) => `${attr}="${rewriteTarget(target, ctx, { image: true })}"`,
      )
      .replace(/\bhref="([^"]+)"/g, (_m, target) => `href="${rewriteTarget(target, ctx)}"`)
  );
}

/** Rewrites a line outside code fences. Inline code is masked first, so nothing inside it changes. */
function rewriteLine(line, ctx) {
  const spans = [];
  const masked = line.replace(/`+[^`]*`+/g, (span) => `\u0000${spans.push(span) - 1}\u0000`);
  return rewriteProse(masked, ctx).replace(
    /\u0000(\d+)\u0000/g,
    (_m, index) => spans[Number(index)],
  );
}

function fenceOf(line) {
  const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  return match ? match[1] : undefined;
}

/** Rewrites every link in a README, skipping fenced code blocks. */
export function rewriteReadme(markdown, ctx) {
  let openFence;
  return markdown
    .split('\n')
    .map((line) => {
      const fence = fenceOf(line);
      if (openFence) {
        if (fence && fence[0] === openFence[0] && fence.length >= openFence.length)
          openFence = undefined;
        return line;
      }
      if (fence) {
        openFence = fence;
        return line;
      }
      return rewriteLine(line, ctx);
    })
    .join('\n');
}

function noteFor(pkg, ctx) {
  const source = `https://github.com/${ctx.repo}/blob/${ctx.ref}/${pkg.readme}`;
  return `${NOTE_PREFIX} [${pkg.readme}](${source}). Edit that file; changes made to this page are overwritten.`;
}

export function renderPage(pkg, readmeText, ctx) {
  const body = rewriteReadme(readmeText, { ...ctx, baseDir: `packages/${pkg.directory}` });
  return `${noteFor(pkg, ctx)}\n\n${body.replace(/\s*$/, '\n')}`;
}

/** A rough size of a change: lines only in the old page, lines only in the new one. */
function lineDelta(before, after) {
  const counts = new Map();
  for (const line of before.split('\n')) counts.set(line, (counts.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after.split('\n')) {
    const left = counts.get(line) ?? 0;
    if (left > 0) counts.set(line, left - 1);
    else added += 1;
  }
  const removed = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return { added, removed };
}

function planPages(ctx) {
  const plan = [];
  for (const pkg of ctx.packages.values()) {
    const file = join(ctx.wikiDir, `${pkg.page}.md`);
    const next = renderPage(pkg, readFileSync(join(ctx.repoRoot, pkg.readme), 'utf8'), ctx);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    if (current === next) plan.push({ action: 'unchanged', file, source: pkg.readme });
    else
      plan.push({
        action: current === undefined ? 'create' : 'update',
        file,
        next,
        current,
        source: pkg.readme,
      });
  }
  return plan;
}

/** Generated pages whose package README is gone. */
function planStale(ctx) {
  const live = new Set([...ctx.packages.values()].map((pkg) => `${pkg.page}.md`));
  return readdirSync(ctx.wikiDir)
    .filter((name) => name.endsWith('.md') && !live.has(name))
    .filter((name) => readFileSync(join(ctx.wikiDir, name), 'utf8').startsWith(NOTE_PREFIX))
    .map((name) => ({ action: 'delete', file: join(ctx.wikiDir, name) }));
}

function describe(step, ctx) {
  const name = relative(ctx.wikiDir, step.file);
  if (step.action === 'unchanged' || step.action === 'delete')
    return `${step.action.padEnd(9)} ${name}`;
  const { added, removed } = lineDelta(step.current ?? '', step.next);
  return `${step.action.padEnd(9)} ${name}  (from ${step.source}; +${added} -${removed} lines)`;
}

function apply(step) {
  if (step.action === 'delete') unlinkSync(step.file);
  else if (step.action !== 'unchanged') writeFileSync(step.file, step.next);
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const ctx = { ...options, repoRoot: REPO_ROOT, packages: discoverPackages(REPO_ROOT) };
  if (ctx.packages.size === 0) throw new Error('no packages/*/README.md found');
  const plan = [...planPages(ctx), ...planStale(ctx)];
  for (const step of plan) {
    console.log(describe(step, ctx));
    if (!ctx.dryRun) apply(step);
  }
  const changed = plan.filter((step) => step.action !== 'unchanged').length;
  const verb = ctx.dryRun ? 'would change' : 'changed';
  console.log(
    `${plan.length} page(s) checked; ${changed} ${verb}${ctx.dryRun ? ' (dry run, nothing written)' : ''}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`wiki-sync: ${error.message}`);
    process.exit(1);
  }
}
