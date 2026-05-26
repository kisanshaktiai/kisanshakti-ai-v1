#!/usr/bin/env node
/**
 * Audit hardcoded Tailwind palette colors in src/ that should be replaced
 * with semantic theme tokens (driven by the tenant white_label_configs).
 *
 * Allow-list: NDVI, GoogleMapBoundaryDrawer, LandThumbnail, ndviScience.ts —
 * those use scientifically-meaningful palettes, not brand colors.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;
const ALLOW = [
  /NDVI/, /GoogleMapBoundaryDrawer/, /LandThumbnail/,
  /ndviScience\.ts$/, /chatImageStorage\.ts$/,
];

const palettes = '(red|blue|green|yellow|orange|purple|pink|indigo|emerald|amber|cyan|teal|violet|rose|sky|lime|fuchsia|slate|gray|zinc|neutral|stone)';
const utilities = '(text|bg|border|from|to|via|ring|fill|stroke|shadow|divide|placeholder|caret|accent|decoration|outline)';
const RX = new RegExp(`\\b${utilities}-${palettes}-[0-9]{2,3}\\b`, 'g');
const HEX = /#[0-9a-fA-F]{6}\b/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

const rows = [];
let totalPalette = 0;
let totalHex = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (ALLOW.some((rx) => rx.test(rel))) continue;
  const src = readFileSync(file, 'utf8');
  const p = (src.match(RX) || []).length;
  const h = (src.match(HEX) || []).length;
  if (p + h > 0) {
    rows.push({ rel, palette: p, hex: h });
    totalPalette += p;
    totalHex += h;
  }
}
rows.sort((a, b) => (b.palette + b.hex) - (a.palette + a.hex));

console.log(`Total palette-class occurrences: ${totalPalette}`);
console.log(`Total raw #hex occurrences:      ${totalHex}`);
console.log(`Files with hardcoded colors:     ${rows.length}\n`);
console.log('Top 30 offenders:');
for (const r of rows.slice(0, 30)) {
  console.log(`  ${(r.palette + r.hex).toString().padStart(4)}  ${r.rel}`);
}
