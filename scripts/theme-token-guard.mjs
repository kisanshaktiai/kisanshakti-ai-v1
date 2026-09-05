#!/usr/bin/env node
/**
 * Prevent tenant-theme regressions in shared controls and schedule creation.
 * Scientific measurement palettes are intentionally outside this UI-only scope.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const scopes = [
  'src/components/ui',
  'src/components/schedule',
  'src/contexts/TenantContext.tsx',
  'src/pages/Schedule.tsx',
];
const palette = /\b(?:text|bg|border|ring|fill|stroke|from|via|to)-(?:white|black|red|rose|green|emerald|lime|teal|amber|yellow|orange|blue|sky|cyan|indigo|purple|violet|fuchsia|pink|gray|slate|zinc|neutral|stone)(?:-\d{2,3})?\b/g;
const rawColor = /(?:#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})\b|\b(?:rgb|rgba|hsl|hsla)\s*\()/gi;
const allowedFiles = new Set([
  'src/components/schedule/TaskPhotoUploadDialog.tsx', // image canvas/preview controls
]);

function filesAt(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = join(absolute, entry.name);
    return entry.isDirectory() ? filesAt(relative(root, child)) : ['.ts', '.tsx'].includes(extname(child)) ? [child] : [];
  });
}

const failures = [];
for (const file of [...new Set(scopes.flatMap(filesAt))]) {
  const rel = relative(root, file).replaceAll('\\', '/');
  if (allowedFiles.has(rel)) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    const hits = [...line.matchAll(palette), ...line.matchAll(rawColor)];
    for (const hit of hits) failures.push(`${rel}:${index + 1} ${hit[0]}`);
  });
}

if (failures.length) {
  console.error('\nTenant theme guard failed. Use semantic theme tokens:\n');
  failures.forEach((failure) => console.error(`  ${failure}`));
  process.exit(1);
}
console.log('Tenant theme guard passed.');