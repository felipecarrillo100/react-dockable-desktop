/**
 * What `npm publish` ships (7.4.0). A consumer reading the package in node_modules — or a tool
 * that shows release notes on upgrade — should find what changed, so the CHANGELOG is in the
 * tarball next to the README and LICENSE that npm adds by itself. Reads `npm pack --dry-run`, which
 * applies the real `files` rules rather than restating them. The build itself is checked through
 * `files`, not the pack list: CI runs the tests before `npm run build`, so there is no dist/ yet.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

describe('package contents', () => {
  it('ships the CHANGELOG, README and LICENSE with the build', () => {
    const out = execSync('npm pack --dry-run --json --ignore-scripts', { cwd: ROOT, encoding: 'utf8' });
    // npm prints an array of packs (≤10) or an object keyed by package name (11+).
    const report = JSON.parse(out);
    const pack = (Array.isArray(report) ? report[0] : Object.values(report)[0]) as { files: { path: string }[] };
    const files = pack.files.map(f => f.path);
    for (const f of ['CHANGELOG.md', 'README.md', 'LICENSE', 'package.json']) expect(files, f).toContain(f);
    expect(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).files).toContain('dist');
  }, 60_000);
});
