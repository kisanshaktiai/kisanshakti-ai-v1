-- Fix observation_translations: normalize language_code to lowercase
UPDATE observation_translations SET language_code = LOWER(language_code) WHERE language_code != LOWER(language_code);

-- Deduplicate: if both 'mr' and 'MR' existed, the UPDATE above creates duplicates
-- Remove duplicates keeping the one with more content (longer description_text)
DELETE FROM observation_translations a
USING observation_translations b
WHERE a.id > b.id
  AND a.observation_code = b.observation_code
  AND a.language_code = b.language_code
  AND COALESCE(a.crop_code, 'ALL') = COALESCE(b.crop_code, 'ALL');