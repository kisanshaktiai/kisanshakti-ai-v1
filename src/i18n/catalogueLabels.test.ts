import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './locales/en/provider.json';
import hi from './locales/hi/provider.json';
import mr from './locales/mr/provider.json';

/**
 * The service catalogue lives in the database (code + English label); the app
 * translates by code. This test reads the two migrations that fill the
 * catalogue and proves that every code has a label in English, Hindi and
 * Marathi, and that the English label in the app is the one in the database.
 */
const MIGRATIONS = [
  'supabase/migrations/20261124140000_provider_catalogue_lookups.sql',
  'supabase/migrations/20261126130000_service_catalogue_india_additions.sql',
];
const ROW = /\('([A-Z][A-Z0-9_]+)', (?:NULL|'[A-Z][A-Z0-9_]+'), '((?:[^']|'')+)', \d+\)/g;
const RELABEL = /SET label_en = '((?:[^']|'')+)', updated_at = now\(\)\s+WHERE code = '([A-Z][A-Z0-9_]+)'/g;

function catalogueInDatabase(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const file of MIGRATIONS) {
    const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
    // only the service_categories INSERT: it is the one with a parent column
    const block = sql.split('INSERT INTO public.service_categories')[1]?.split('ON CONFLICT')[0] ?? '';
    for (const m of block.matchAll(ROW)) if (!rows.has(m[1])) rows.set(m[1], m[2].replace(/''/g, "'"));
    for (const m of sql.matchAll(RELABEL)) rows.set(m[2], m[1].replace(/''/g, "'"));
  }
  return rows;
}

describe('service catalogue labels', () => {
  const database = catalogueInDatabase();
  const bundles = {
    en: en.provider.catalogue.category as Record<string, string>,
    hi: hi.provider.catalogue.category as Record<string, string>,
    mr: mr.provider.catalogue.category as Record<string, string>,
  };

  it('reads the whole catalogue from the migrations: 16 families and 154 services', () => {
    expect(database.size).toBe(170);
  });

  it('has a label for every catalogue code in English, Hindi and Marathi, and no label for a code that does not exist', () => {
    const codes = [...database.keys()].sort();
    expect(Object.keys(bundles.en).sort()).toEqual(codes);
    expect(Object.keys(bundles.hi).sort()).toEqual(codes);
    expect(Object.keys(bundles.mr).sort()).toEqual(codes);
  });

  it('shows in English exactly the label the database holds', () => {
    const different = [...database].filter(([code, label]) => bundles.en[code] !== label).map(([code]) => code);
    expect(different).toEqual([]);
  });

  it('carries the services asked for by name', () => {
    expect(Object.keys(bundles.en)).toEqual(expect.arrayContaining(['ELECTRICAL_WORK', 'SOLAR_REPAIR', 'MOTOR_REWINDING']));
  });
});
