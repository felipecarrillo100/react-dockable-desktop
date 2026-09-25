/**
 * An inline style beats every stylesheet rule without !important, so a fixed value written inline
 * is one a host application can't override from its own CSS. Fixed values belong in the element's
 * class; inline styles carry only what changes per render (sizes, positions, split ratios, scale
 * transforms, state-driven conditionals).
 *
 * This scans every JSX `style={{ … }}` in the library's source and fails on any property whose
 * value is a literal. Identifiers, template expressions, conditionals, spreads and calls are
 * per-render, and allowed.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..');

/** `file:property` pairs that may stay literal, each with its reason. Keep this empty if you can. */
const ALLOWED = new Map<string, string>([]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sourceFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

const isLiteral = (e: ts.Expression): boolean =>
  ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)
  || (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand));

function literalStyleProps(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'style' && node.initializer
      && ts.isJsxExpression(node.initializer) && node.initializer.expression
      && ts.isObjectLiteralExpression(node.initializer.expression)) {
      for (const prop of node.initializer.expression.properties) {
        if (ts.isPropertyAssignment(prop) && isLiteral(prop.initializer)) {
          const name = prop.name.getText(sf).replace(/^['"[]|['"\]]$/g, '');
          const line = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1;
          hits.push(`${relative(SRC, file)}:${line} ${name}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe('inline styles', () => {
  it('no JSX style={{…}} in the library sets a fixed (literal) value', () => {
    const hits = sourceFiles(SRC).flatMap(literalStyleProps)
      .filter(h => !ALLOWED.has(h.replace(/:\d+ /, ':')));
    expect(hits).toEqual([]);
  });

  it('the scan finds style objects (sanity check)', () => {
    const text = sourceFiles(SRC).map(f => readFileSync(f, 'utf8')).join('\n');
    expect((text.match(/style=\{\{/g) ?? []).length).toBeGreaterThan(15);
  });
});
