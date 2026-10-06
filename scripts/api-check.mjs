#!/usr/bin/env node
/**
 * api-check.mjs — fails on a breaking change to the public API unless the major version went up.
 *
 * The contract is api/react-dockable-desktop.api.md, the API Extractor report of the published
 * type declarations (STABILITY.md). `api-extractor run` (no --local) has already checked that
 * the committed report matches the code; this compares it with the report at the last release tag:
 *
 *   - a declaration that disappeared, or lost any of its lines (a member removed, a type or
 *     signature changed), is breaking;
 *   - a declaration that only gained lines (a new member, a new export) is an addition.
 *
 * A breaking change passes only when package.json's major version is higher than that tag's.
 * The check is deliberately conservative: a change that is compatible but rewrites a line (an
 * added optional parameter) counts as breaking too, and needs a major.
 *
 * Usage: node scripts/api-check.mjs   (after `npm run build`; needs the release tags fetched)
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPORT = 'api/react-dockable-desktop.api.md';

const DECL = /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|function|const|let|var|enum|namespace)\s+([A-Za-z_$][\w$]*)/;

/** The report's declarations: name → its lines, trimmed, without comments and blank lines. */
export function declarations(report) {
  const body = report.split('```ts')[1]?.split('```')[0] ?? '';
  const decls = new Map();
  let current = null;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('import ')) continue;
    const topLevel = raw === raw.trimStart() && !line.startsWith('}');
    if (topLevel) {
      const m = DECL.exec(line);
      current = m ? m[1] : line; // `export { … }` and the like are keyed by their own text
      if (!decls.has(current)) decls.set(current, []);
    }
    if (current !== null) decls.get(current).push(line);
  }
  return decls;
}

/** What breaks between two reports: removed declarations, and declarations that lost a line. */
export function breakingChanges(oldReport, newReport) {
  const before = declarations(oldReport);
  const after = declarations(newReport);
  const changes = [];
  for (const [name, oldLines] of before) {
    const newLines = after.get(name);
    if (!newLines) { changes.push(`removed: ${name}`); continue; }
    const remaining = [...newLines];
    const lost = oldLines.filter(l => {
      const i = remaining.indexOf(l);
      if (i === -1) return true;
      remaining.splice(i, 1);
      return false;
    });
    if (lost.length) changes.push(`changed: ${name} (no longer has: ${lost.join(' ')})`);
  }
  return changes;
}

const major = v => Number(String(v).replace(/^v/, '').split('.')[0]);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * The release to compare with: the newest vX.Y.Z tag at or below `version`. After a release that
 * is the release itself (changes since then are checked); on the commit that bumps the version,
 * whose tag does not exist yet, it is the release before.
 */
function baseRelease(version) {
  const parse = t => t.slice(1).split('.').map(Number);
  const cmp = (a, b) => { const x = parse(a), y = parse(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
  const current = `v${version}`;
  return git('tag', '--list', 'v*.*.*').split('\n').filter(t => /^v\d+\.\d+\.\d+$/.test(t))
    .filter(t => cmp(t, current) <= 0).sort(cmp).pop() ?? null;
}

function main() {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const base = baseRelease(version);
  if (!base) { console.log('api-check: no earlier release tag; nothing to compare.'); return; }
  let oldReport;
  try { oldReport = git('show', `${base}:${REPORT}`); } catch {
    console.log(`api-check: ${base} has no ${REPORT} (the report started after it); skipped.`);
    return;
  }
  const changes = breakingChanges(oldReport, readFileSync(REPORT, 'utf8'));
  if (!changes.length) { console.log(`api-check: no breaking change since ${base}.`); return; }
  const list = changes.map(c => `  - ${c}`).join('\n');
  if (major(version) > major(base)) {
    console.log(`api-check: breaking changes since ${base}, allowed by the major bump to ${version}:\n${list}`);
    return;
  }
  console.error(`api-check: breaking changes since ${base}, but ${version} is not a new major version:\n${list}\n` +
    'Keep the old API (deprecate it, see STABILITY.md), or ship the change in the next major.');
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
