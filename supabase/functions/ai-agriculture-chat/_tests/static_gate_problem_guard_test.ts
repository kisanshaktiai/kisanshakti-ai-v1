// Regression tests for the StaticGate problem/negation/emergence guard.
//
// History: the CROP_NAME branch in `checkStaticDataGate` matched any message
// containing /या\s*शेतात.*पिक/i and returned a generic "this field has X"
// lookup. Emergence-failure queries like "या शेतातील पिक अजून उगवले नाही"
// were silently hijacked away from the symbolic diagnosis pipeline. The
// `hasProblemOrEmergenceSignal` guard now bypasses the static gate for any
// message carrying negation / damage / emergence predicates.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkStaticDataGate,
  hasProblemOrEmergenceSignal,
} from '../agents/static-data-gate.ts';

const baseLand = {
  land_id: 'land-A',
  current_crop: 'rice',
  crop_schedule: {
    crop_name: 'rice',
    sowing_date: '2026-06-01',
    is_active: true,
  },
  growth_stage: 'NURSERY',
  days_since_sowing: 15,
};

Deno.test('hasProblemOrEmergenceSignal flags Marathi emergence-failure phrasing', () => {
  assertEquals(hasProblemOrEmergenceSignal('पिक अद्याप उगवले नाही'), true);
  assertEquals(hasProblemOrEmergenceSignal('या शेतातील पिक अजून उगवले नाही'), true);
  assertEquals(hasProblemOrEmergenceSignal('पिक सुकल आहे'), true);
});

Deno.test('hasProblemOrEmergenceSignal flags English damage / negation', () => {
  assertEquals(hasProblemOrEmergenceSignal('crop did not emerge'), true);
  assertEquals(hasProblemOrEmergenceSignal('rice is wilting'), true);
  assertEquals(hasProblemOrEmergenceSignal('seedlings dying'), true);
});

Deno.test('hasProblemOrEmergenceSignal returns false for bare identity question', () => {
  assertEquals(hasProblemOrEmergenceSignal('या शेतात कोणते पीक आहे?'), false);
  assertEquals(hasProblemOrEmergenceSignal('what crop is in this field'), false);
});

Deno.test('checkStaticDataGate refuses CROP_NAME hijack on emergence-failure (mr)', () => {
  for (const msg of [
    'पिक अद्याप उगवले नाही',
    'या शेतातील पिक अजून उगवले नाही',
  ]) {
    const out = checkStaticDataGate({
      farmer_message: msg,
      language: 'mr',
      land_context: baseLand as any,
    });
    assertEquals(out.handled, false, `static gate must bypass for: ${msg}`);
    assertEquals(out.response_type, undefined);
  }
});

Deno.test('checkStaticDataGate still answers a bare CROP_NAME identity question', () => {
  const out = checkStaticDataGate({
    farmer_message: 'या शेतात कोणते पीक आहे?',
    language: 'mr',
    land_context: baseLand as any,
  });
  assertEquals(out.handled, true);
  assertEquals(out.response_type, 'CROP_NAME');
});
