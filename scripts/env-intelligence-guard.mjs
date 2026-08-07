#!/usr/bin/env node
/**
 * ============================================================================
 * ENVIRONMENTAL INTELLIGENCE — CI REGRESSION GUARD
 * ============================================================================
 *
 * Runs as part of `npm run build` (prebuild) and `npm run check`.
 * FAILS the build (exit 1) with an explicit message if any of the four
 * regressions that this series eliminated tries to come back.
 *
 *  (a) D3 — FABRICATED DIURNAL SPREAD
 *      Any `temp + 3` / `temp - 5`-style synthesis inside
 *      supabase/functions/weather/. Min/max must come from a provider or a
 *      registry-backed method, never from arithmetic on the current temp.
 *
 *  (b) CONSTANT CONFIDENCE
 *      The literal ternary `? 0.9 : 0.75` anywhere under supabase/functions/.
 *      Confidence must come from CONFIDENCE_MODEL, never from a coin flip.
 *
 *  (c) UNREGISTERED SCIENTIFIC METHOD
 *      Every `METHOD_ID@version` tag referenced in edge-function TypeScript
 *      must exist in scripts/sci-methods-manifest.json, which mirrors the
 *      approved rows of public.sci_method_registry. Nothing executes without
 *      an approved registry row.
 *
 *  (d) WEATHER RESPONSE CONTRACT SNAPSHOT LOCK
 *      APPROACH CHOSEN (documented per the spec's "simpler and acceptable"
 *      option): we do not re-execute the edge function at build time (it needs
 *      network + secrets). Instead the guard asserts that
 *      scripts/weather-contract-snapshot.json exists and that every top-level
 *      key it records is still literally produced by the response-assembly
 *      block of supabase/functions/weather/index.ts (grep of the
 *      `const response` object plus the conditional `response.<key> =`
 *      assignments). Removing or renaming a key fails the build; adding a new
 *      key does not (additive changes are allowed by design).
 *      Regenerate the snapshot deliberately after an intentional contract
 *      change by re-capturing the live response and reducing it to types.
 *
 * Usage: node scripts/env-intelligence-guard.mjs
 * ============================================================================
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const WEATHER_DIR = join(FUNCTIONS_DIR, 'weather');
const MANIFEST = join(ROOT, 'scripts', 'sci-methods-manifest.json');
const SNAPSHOT = join(ROOT, 'scripts', 'weather-contract-snapshot.json');

const failures = [];
const fail = (rule, msg) => failures.push(`[${rule}] ${msg}`);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (['.ts', '.tsx', '.js', '.mjs'].includes(extname(p))) out.push(p);
  }
  return out;
}

const rel = (p) => p.replace(`${ROOT}/`, '');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── (a) Fabricated diurnal spread ───────────────────────────────────────────
const DIURNAL_RE = /(temperature|temp)\s*[_a-z]*\s*[+\-]\s*[35]\b/i;
for (const file of walk(WEATHER_DIR)) {
  const src = stripComments(readFileSync(file, 'utf8'));
  src.split('\n').forEach((line, i) => {
    const exact = line.includes('temp + 3') || line.includes('temp - 5');
    const assignment = /[=:]\s*[^=]*$/.test(line) && DIURNAL_RE.test(line);
    if (exact || assignment) {
      fail(
        'D3_FABRICATED_DIURNAL',
        `${rel(file)}:${i + 1} synthesises a temperature spread ` +
          `("${line.trim().slice(0, 100)}"). temp_min/temp_max must come from a ` +
          `provider observation or a registry-backed method — never arithmetic.`,
      );
    }
  });
}

// ── (b) Constant confidence ─────────────────────────────────────────────────
const CONST_CONF_RE = /\?\s*0\.9\s*:\s*0\.75/;
for (const file of walk(FUNCTIONS_DIR)) {
  const src = stripComments(readFileSync(file, 'utf8'));
  src.split('\n').forEach((line, i) => {
    if (CONST_CONF_RE.test(line)) {
      fail(
        'CONSTANT_CONFIDENCE',
        `${rel(file)}:${i + 1} hardcodes "? 0.9 : 0.75". Confidence must be ` +
          `computed by CONFIDENCE_MODEL (agreement / freshness / lead-time / skill).`,
      );
    }
  });
}

// ── (c) Registry coverage ───────────────────────────────────────────────────
if (!existsSync(MANIFEST)) {
  fail('SCI_MANIFEST_MISSING', `scripts/sci-methods-manifest.json is missing. Regenerate it from public.sci_method_registry approved rows.`);
} else {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')).methods ?? {};
  const TAG_RE = /['"]((?:ET0|VPD|GDD|LWD|HEAT|WHEAT|SPRAY|SOIL|SAXTON|KC|FROST|EVENT|CONFIDENCE)[A-Z0-9_]*)@/g;
  const seen = new Map();
  for (const file of walk(FUNCTIONS_DIR)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(TAG_RE)) {
      if (!seen.has(m[1])) seen.set(m[1], rel(file));
    }
  }
  for (const [id, where] of seen) {
    if (!(id in manifest)) {
      fail(
        'UNREGISTERED_SCI_METHOD',
        `"${id}@..." is referenced in ${where} but is not an approved row in ` +
          `scripts/sci-methods-manifest.json. Add the method to sci_method_registry ` +
          `(review_status='approved') and regenerate the manifest.`,
      );
    }
  }
}

// ── (d) Weather response contract snapshot lock ─────────────────────────────
if (!existsSync(SNAPSHOT)) {
  fail('WEATHER_SNAPSHOT_MISSING', `scripts/weather-contract-snapshot.json is missing — the weather response contract is unlocked.`);
} else {
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const indexPath = join(WEATHER_DIR, 'index.ts');
  if (!existsSync(indexPath)) {
    fail('WEATHER_INDEX_MISSING', 'supabase/functions/weather/index.ts not found.');
  } else {
    const src = readFileSync(indexPath, 'utf8');
    const assembly =
      (src.match(/const response:[\s\S]{0,1200}?return new Response\(JSON\.stringify\(response\)/) ?? [''])[0];
    if (!assembly) {
      fail('WEATHER_ASSEMBLY_NOT_FOUND', 'Could not locate the `const response` assembly block in weather/index.ts — the snapshot lock cannot be verified.');
    } else {
      const expected = new Set();
      for (const shape of Object.values(snap.actions ?? {})) {
        for (const k of Object.keys(shape)) expected.add(k);
      }
      for (const key of expected) {
        // Some keys (e.g. `stale`) are produced by the cache-hit early-return
        // path rather than the final assembly object, so fall back to a
        // file-wide production check before failing.
        const producedBy = (hay) =>
          new RegExp(`(^|[\\s{,])${key}\\s*:`, 'm').test(hay) ||
          new RegExp(`response\\.${key}\\s*=`).test(hay);
        const produced = producedBy(assembly) || producedBy(src);

        if (!produced) {
          fail(
            'WEATHER_CONTRACT_BROKEN',
            `Response key "${key}" is recorded in weather-contract-snapshot.json but is no longer produced by the response assembly in weather/index.ts. ` +
              `Removing/renaming a key breaks useWeather.ts and the weather widgets. If the change is intentional, re-capture the snapshot.`,
          );
        }
      }
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error('\n❌ ENV-INTELLIGENCE GUARD FAILED\n');
  for (const f of failures) console.error(`  • ${f}\n`);
  console.error(`${failures.length} violation(s). See scripts/env-intelligence-guard.mjs header for the rationale of each rule.\n`);
  process.exit(1);
}

console.log('✅ env-intelligence guard passed (D3 diurnal, constant confidence, sci-method registry coverage, weather contract snapshot).');
