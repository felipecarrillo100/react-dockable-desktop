#!/usr/bin/env node
/**
 * sync-version.js
 *
 * Reads the version from package.json and updates every hardcoded version
 * reference in the repo that must always match it.
 *
 * Hooked into the npm version lifecycle (see package.json "version" script)
 * so it runs automatically on `npm version patch|minor|major` — before npm
 * creates the git commit and tag.
 *
 * Can also be run manually:  node scripts/sync-version.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root    = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// A version as written in these files, including a pre-release (7.11.0-next.0). In a shields.io
// badge a '-' is written '--', since a single one separates the badge's label, message and colour.
const V = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?`;
const BADGE_V = String.raw`\d+\.\d+\.\d+(?:--[0-9A-Za-z.]+)?`;
const badgeVersion = version.replace(/-/g, '--');

const FILES = [
  {
    file: 'README.md',
    patterns: [
      // npm badge: img.shields.io/badge/npm-vX.Y.Z-blue.svg
      { re: new RegExp(String.raw`(shields\.io/badge/npm-v)${BADGE_V}(-blue\.svg)`, 'g'), sub: `$1${badgeVersion}$2` },
    ],
  },
  {
    file: 'CHANGELOG.md',
    patterns: [
      // Unreleased compare link: .../compare/vX.Y.Z...HEAD
      { re: new RegExp(String.raw`(compare/v)${V}(\.\.\.HEAD)`, 'g'), sub: `$1${version}$2` },
    ],
  },
  {
    file: 'docs-site/.vitepress/config.ts',
    patterns: [
      // Nav version badge: text: 'vX.Y.Z'
      { re: new RegExp(String.raw`(text:\s*['"])v${V}(['"])`, 'g'), sub: `$1v${version}$2` },
    ],
  },
];

let changed = false;

FILES.forEach(({ file, patterns }) => {
  const abs  = join(root, file);
  let   src  = readFileSync(abs, 'utf8');
  let   next = src;

  patterns.forEach(({ re, sub }) => { next = next.replace(re, sub); });

  if (next !== src) {
    writeFileSync(abs, next, 'utf8');
    console.log(`✅  ${file}  →  v${version}`);
    changed = true;
  } else {
    console.log(`—   ${file}  already at v${version}`);
  }
});

if (changed) {
  console.log('\nReview with: git diff README.md CHANGELOG.md docs-site/.vitepress/config.ts');
}
