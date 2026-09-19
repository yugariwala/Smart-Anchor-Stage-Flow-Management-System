/**
 * Measures WCAG contrast ratios for every foreground/background pair actually used in
 * src/styles.css, reading the values straight out of the stylesheet's custom properties.
 *
 * Run with: node apps/web/scripts/contrast.mjs
 *
 * This exists so the accessibility claim in docs/measurements.md is a measurement rather
 * than an assertion. WCAG 2.2 AA: 4.5:1 normal text, 3:1 large text (>=18.66px bold or
 * >=24px) and 3:1 for UI component boundaries.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'styles.css'), 'utf8');

const vars = new Map();
for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  if (!vars.has(match[1])) vars.set(match[1], match[2]);
}

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** [label, fg var, bg var, requirement] */
const pairs = [
  ['Console body text', 'text', 'bg', 4.5],
  ['Console body text on card', 'text', 'surface', 4.5],
  ['Console muted text on card', 'text-muted', 'surface', 4.5],
  ['Table header on card', 'text-muted', 'surface', 4.5],
  ['Control border on card (UI)', 'border', 'surface', 3.0],
  ['Focus ring on page (UI)', 'focus', 'bg', 3.0],
  ['Primary button label', 'info', 'info-bg', 4.5],
  ['Rehearsal banner text', 'warn', 'warn-bg', 4.5],
  ['Status chip: ok', 'ok', 'ok-bg', 4.5],
  ['Status chip: warn', 'warn', 'warn-bg', 4.5],
  ['Status chip: bad', 'bad', 'bad-bg', 4.5],
  ['Status chip: info', 'info', 'info-bg', 4.5],
  ['Anchor title (large)', 'anchor-text', 'anchor-surface', 3.0],
  ['Anchor body on surface', 'anchor-text', 'anchor-surface', 4.5],
  ['Anchor muted on surface', 'anchor-muted', 'anchor-surface', 4.5],
  ['Anchor accent time (large)', 'anchor-accent', 'anchor-surface', 3.0],
  ['Anchor body on page bg', 'anchor-text', 'anchor-bg', 4.5],
  ['Anchor muted on page bg', 'anchor-muted', 'anchor-bg', 4.5],
];

const extras = [
  ['Primary button label on info fill', '#ffffff', vars.get('info'), 4.5],
  ['Anchor primary button label', '#06121c', vars.get('anchor-accent'), 4.5],
  ['Anchor chip ok on surface', '#7ae0a0', vars.get('anchor-surface'), 4.5],
  ['Anchor chip warn on surface', '#f5c86b', vars.get('anchor-surface'), 4.5],
  ['Anchor chip bad on surface', '#ff9ba6', vars.get('anchor-surface'), 4.5],
];

let failures = 0;
const rows = [];

for (const [label, fgVar, bgVar, need] of pairs) {
  const fg = vars.get(fgVar);
  const bg = vars.get(bgVar);
  if (fg === undefined || bg === undefined) {
    rows.push([label, '?', '?', '-', 'MISSING VAR']);
    failures += 1;
    continue;
  }
  const r = ratio(fg, bg);
  const pass = r >= need;
  if (!pass) failures += 1;
  rows.push([label, `${fg} on ${bg}`, r.toFixed(2), `${need}:1`, pass ? 'pass' : 'FAIL']);
}

for (const [label, fg, bg, need] of extras) {
  const r = ratio(fg, bg);
  const pass = r >= need;
  if (!pass) failures += 1;
  rows.push([label, `${fg} on ${bg}`, r.toFixed(2), `${need}:1`, pass ? 'pass' : 'FAIL']);
}

const w = (s, n) => String(s).padEnd(n);
console.log(
  `${w('pair', 34)}${w('colours', 22)}${w('ratio', 8)}${w('needs', 8)}result`,
);
console.log('-'.repeat(78));
for (const r of rows) {
  console.log(`${w(r[0], 34)}${w(r[1], 22)}${w(r[2], 8)}${w(r[3], 8)}${r[4]}`);
}
console.log('-'.repeat(78));
console.log(failures === 0 ? `all ${rows.length} pairs pass` : `${failures} of ${rows.length} FAIL`);
process.exit(failures === 0 ? 0 : 1);
