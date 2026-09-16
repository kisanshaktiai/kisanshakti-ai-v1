#!/usr/bin/env node
/**
 * Production regression guard for the DB-as-Brain contract.
 * Frontend presentation code may format/render observations, but must not
 * contain agronomic thresholds, crop/stage tables, risk inference or actions.
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
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Existing environmental-intelligence guards.
const DIURNAL_RE = /(temperature|temp)\s*[_a-z]*\s*[+\-]\s*[35]\b/i;
for (const file of walk(WEATHER_DIR)) {
  const src = stripComments(readFileSync(file, 'utf8'));
  src.split('\n').forEach((line, i) => {
    if (line.includes('temp + 3') || line.includes('temp - 5') || (/[=:]\s*[^=]*$/.test(line) && DIURNAL_RE.test(line))) {
      fail('D3_FABRICATED_DIURNAL', `${rel(file)}:${i + 1} synthesises a temperature spread.`);
    }
  });
}
const CONST_CONF_RE = /\?\s*0\.9\s*:\s*0\.75/;
for (const file of walk(FUNCTIONS_DIR)) {
  const src = stripComments(readFileSync(file, 'utf8'));
  src.split('\n').forEach((line, i) => { if (CONST_CONF_RE.test(line)) fail('CONSTANT_CONFIDENCE', `${rel(file)}:${i + 1} hardcodes constant confidence.`); });
}
if (!existsSync(MANIFEST)) fail('SCI_MANIFEST_MISSING', 'sci-method registry manifest is missing.');
if (!existsSync(SNAPSHOT)) fail('WEATHER_SNAPSHOT_MISSING', 'weather response contract snapshot is missing.');

// New single-brain guard: the frontend must not contain semantic agronomy.
const SRC_DIR = join(ROOT, 'src');
const semanticFiles = walk(SRC_DIR).filter((p) => !p.includes(`${join(ROOT, 'src', 'i18n')}`));
const forbiddenPatterns = [
  { id: 'NDVI_THRESHOLDS', re: /NDVI_THRESHOLDS\s*=|NDVI_THRESHOLDS\./ },
  { id: 'STAGE_TABLE', re: /STAGE_TABLE\s*=|stage-aware|stage aware/i },
  { id: 'NPK_TARGETS', re: /NPK_TARGETS\s*=|n_modifier\s*:\s*1\.\d/ },
  { id: 'AGRONOMIC_RISK', re: /getScientificRiskLevel\s*\(|risk[_-]?level\s*=.*ndvi|trendPerDay.*(?:critical|high|medium)/i },
  { id: 'CROP_THRESHOLDS', re: /healthyMin\s*:|excellentMin\s*:|TEMPERATURE_THRESHOLDS|SOIL_PH_THRESHOLDS|SOIL_MOISTURE_THRESHOLDS/ },
  { id: 'HARD_CODED_ACTIONS', re: /defaultActions\s*=|recommendedAction.*(?:irrig|fertiliz|spray)|irrigation.*(?:mm|litre|liter)\b/i },
];
for (const file of semanticFiles) {
  const src = stripComments(readFileSync(file, 'utf8'));
  for (const { id, re } of forbiddenPatterns) {
    if (re.test(src)) fail('FRONTEND_AGRONOMIC_LOGIC', `${rel(file)} contains ${id}; agronomic meaning must come from the DB/Decision Brain.`);
  }
}

// NDVI map may color raw values, but it may not independently classify health.
const mapPath = join(SRC_DIR, 'components', 'land', 'NDVIMapView.tsx');
if (existsSync(mapPath)) {
  const mapSrc = stripComments(readFileSync(mapPath, 'utf8'));
  if (/getScientificHealthStatus\s*\(|getScientificRiskLevel\s*\(/.test(mapSrc)) {
    fail('FRONTEND_NDVI_SEMANTICS', 'NDVIMapView derives health/risk locally. Use DB decision output; color is presentation only.');
  }
}

if (failures.length) {
  console.error('\n❌ ENV-INTELLIGENCE GUARD FAILED\n');
  failures.forEach((f) => console.error(`  • ${f}\n`));
  process.exit(1);
}
console.log('✅ env-intelligence guard passed: environmental registry + weather contract + single-brain frontend checks.');
