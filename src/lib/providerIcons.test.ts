import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { Shovel, Wrench } from 'lucide-react';
import { familyIcon, iconFromPath, serviceIcon } from './providerIcons';

/**
 * The pictures of the service catalogue live in the database. These tests
 * read the migrations that fill the catalogue and its pictures and prove that
 * every family and service has one the app will draw, and that the app falls
 * back sensibly when a picture is missing.
 */
const CATALOGUE = [
  'supabase/migrations/20261124140000_provider_catalogue_lookups.sql',
  'supabase/migrations/20261126130000_service_catalogue_india_additions.sql',
];
const ICONS = 'supabase/migrations/20261126140000_service_category_icons.sql';
const ROW = /\('([A-Z][A-Z0-9_]+)', (NULL|'[A-Z][A-Z0-9_]+'), '(?:[^']|'')+', \d+\)/g;
const ICON_ROW = /^ {2}\('([A-Z][A-Z0-9_]+)', '([^']+)'\),?$/gm;

function catalogueCodes(): Map<string, string | null> {
  const rows = new Map<string, string | null>();
  for (const file of CATALOGUE) {
    const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
    const block = sql.split('INSERT INTO public.service_categories')[1]?.split('ON CONFLICT')[0] ?? '';
    for (const m of block.matchAll(ROW)) if (!rows.has(m[1])) rows.set(m[1], m[2] === 'NULL' ? null : m[2].slice(1, -1));
  }
  return rows;
}
function picturesInDatabase(): Map<string, string> {
  const sql = readFileSync(resolve(process.cwd(), ICONS), 'utf8');
  return new Map([...sql.matchAll(ICON_ROW)].map((m) => [m[1], m[2]]));
}

describe('service catalogue pictures', () => {
  const codes = catalogueCodes();
  const pictures = picturesInDatabase();

  it('has one picture for each of the 16 families and 154 services, and none for a code that does not exist', () => {
    expect(codes.size).toBe(170);
    expect([...pictures.keys()].sort()).toEqual([...codes.keys()].sort());
  });

  it('holds only drawings the app accepts', () => {
    const refused = [...pictures].filter(([, path]) => iconFromPath(path) === null).map(([code]) => code);
    expect(refused).toEqual([]);
  });

  it('gives every service of a family a picture of its own', () => {
    const seen = new Map<string, string>();
    const repeats: string[] = [];
    for (const [code, parent] of codes) {
      if (parent === null) continue;
      const key = `${parent}|${pictures.get(code)}`;
      if (seen.has(key)) repeats.push(`${seen.get(key)} = ${code}`);
      seen.set(key, code);
    }
    expect(repeats).toEqual([]);
  });

  it('draws a stored picture as one outline path that takes the size and colour of its place', () => {
    const Icon = iconFromPath(pictures.get('MOTOR_REWINDING'));
    expect(Icon).not.toBeNull();
    const { container } = render(createElement(Icon!, { className: 'h-7 w-7', strokeWidth: 1.75 }));
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('class')).toContain('h-7 w-7');
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(pictures.get('MOTOR_REWINDING'));
  });
});

describe('serviceIcon', () => {
  const rows = [
    { code: 'LAND_PREP', parent_code: null, icon_path: 'M2 21h20' },
    { code: 'PLOUGHING', parent_code: 'LAND_PREP', icon_path: 'M3 6h11' },
    { code: 'ROTAVATOR', parent_code: 'LAND_PREP', icon_path: null },
    { code: 'REPAIR', parent_code: null },
  ];

  it('uses the picture of the service itself', () => {
    expect(serviceIcon(rows, 'PLOUGHING')).toBe(iconFromPath('M3 6h11'));
  });

  it('uses the family picture for a service that has none', () => {
    expect(serviceIcon(rows, 'ROTAVATOR')).toBe(iconFromPath('M2 21h20'));
  });

  it('uses the built-in family picture before the catalogue is read or where the database has no picture', () => {
    expect(serviceIcon(null, 'PLOUGHING', 'LAND_PREP')).toBe(Shovel);
    expect(serviceIcon(undefined, 'LAND_PREP')).toBe(Shovel);
    expect(serviceIcon(rows, 'REPAIR')).toBe(familyIcon('REPAIR'));
    expect(serviceIcon(rows, null)).toBe(Wrench);
  });

  it('gives the same component for the same drawing every time', () => {
    expect(serviceIcon(rows, 'PLOUGHING')).toBe(serviceIcon(rows, 'PLOUGHING'));
  });

  it('refuses anything that is not path data', () => {
    expect(iconFromPath('M2 2"/><script>alert(1)</script>')).toBeNull();
    expect(iconFromPath('url(javascript:1)')).toBeNull();
    expect(iconFromPath('')).toBeNull();
    expect(iconFromPath(`M0 0${'h1'.repeat(2500)}`)).toBeNull();
    expect(serviceIcon([{ code: 'REPAIR', parent_code: null, icon_path: '<svg onload=x>' }], 'REPAIR')).toBe(Wrench);
  });
});
