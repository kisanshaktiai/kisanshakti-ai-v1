-- Insert weed vocabulary entries (DB-driven Romanized routing)
INSERT INTO crop_vocabulary (crop_code, phrase_pattern, semantic_hint, recommended_intent_bias, recommended_observation_bias, is_active)
VALUES 
  ('ALL', 'tan', 'weed/unwanted plant in field (Marathi: तण)', 'WEED_PROBLEM', 'WEED_PRESENT', true),
  ('ALL', 'tann', 'weed variant spelling (Marathi: तण)', 'WEED_PROBLEM', 'WEED_PRESENT', true),
  ('ALL', 'gavat', 'grass/weed in Marathi (गवत)', 'WEED_PROBLEM', 'WEED_PRESENT', true),
  ('ALL', 'gawat', 'grass/weed variant spelling (गवत)', 'WEED_PROBLEM', 'WEED_PRESENT', true),
  ('ALL', 'nindani', 'weeding activity in Marathi (निंदणी)', 'WEED_PROBLEM', 'WEED_PRESENT', true),
  ('ALL', 'ghas', 'grass/weed in Hindi (घास)', 'WEED_PROBLEM', 'WEED_PRESENT', true),
  ('ALL', 'kharpatvar', 'weeds in Hindi (खरपतवार)', 'WEED_PROBLEM', 'WEED_PRESENT', true),
  ('ALL', 'kharpat', 'weed in Marathi (खरपतवार)', 'WEED_PROBLEM', 'WEED_PRESENT', true)
ON CONFLICT DO NOTHING;

-- Insert weed observation aliases
INSERT INTO observation_aliases (alias_code, canonical_code)
VALUES 
  ('WEED_PRESENT', 'WEED_PRESENCE'),
  ('WEED_HEAVY', 'WEED_COMPETITION'),
  ('WEED_INFESTATION', 'WEED_COMPETITION'),
  ('GRASS_WEEDS', 'WEED_PRESENCE')
ON CONFLICT DO NOTHING;