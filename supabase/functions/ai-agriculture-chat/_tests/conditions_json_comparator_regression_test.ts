import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { evaluateConditionsJson } from '../bundled-rules/loader.ts';
import { mapCropNameToEnum, CropType } from '../agents/canonical-state-builder.ts';
import { areStagesCompatible, getStageQueryVariants } from '../utils/stage-normalizer.ts';

Deno.test('conditions_json comparator: observation list defaults to ANY and establishment stage family matches nursery', () => {
  const conditions = {
    das_range: { min: 5, max: 21 },
    emergence_threshold_pct: 30,
    growth_stage: 'germination',
    observations: ['obs_rice_no_emergence', 'obs_rice_patchy_emergence'],
  };

  const input = {
    crop_code: 'rice',
    crop_stage: 'NURSERY',
    days_since_sowing: 15,
    observations: ['obs_rice_no_emergence'],
    visual_symptoms: ['obs_rice_no_emergence'],
    user_query: '',
  };

  assertEquals(evaluateConditionsJson(conditions, input, 'RICE_GERMINATION_RESOW_DECISION_001'), true);
});

Deno.test('conditions_json comparator: explicit match_all keeps conjunction semantics when requested', () => {
  const conditions = {
    match_all: true,
    growth_stage: 'germination',
    observations: ['obs_rice_no_emergence', 'obs_rice_patchy_emergence'],
  };

  const input = {
    crop_code: 'rice',
    crop_stage: 'NURSERY',
    observations: ['obs_rice_no_emergence'],
    visual_symptoms: ['obs_rice_no_emergence'],
  };

  assertEquals(evaluateConditionsJson(conditions, input, 'MATCH_ALL_REGRESSION'), false);
});

Deno.test('shared stage normalizer treats nursery, germination, seedling, emergence as one establishment family', () => {
  assertEquals(areStagesCompatible('germination', 'NURSERY'), true);
  assertEquals(getStageQueryVariants('NURSERY').map(s => s.toLowerCase()).includes('germination'), true);
});

Deno.test('crop enum mapping accepts canonical lowercase DB crop codes', () => {
  assertEquals(mapCropNameToEnum('rice'), CropType.RICE);
});