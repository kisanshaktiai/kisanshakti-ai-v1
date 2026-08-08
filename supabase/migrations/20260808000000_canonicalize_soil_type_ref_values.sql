-- Align soil_types.value with canonical agronomy codes (SOIL_TYPE_EFFECTIVE_RAIN keys)
-- so dropdown option values match lands.soil_type stored codes.
UPDATE soil_types SET value = 'black'    WHERE value = 'black_soil';
UPDATE soil_types SET value = 'red'      WHERE value = 'red_soil';
UPDATE soil_types SET value = 'laterite' WHERE value = 'laterite_soil';
UPDATE soil_types SET value = 'clay'     WHERE value = 'clay_soil';
UPDATE soil_types SET value = 'sandy'    WHERE value = 'sandy_soil';
UPDATE soil_types SET value = 'loamy'    WHERE value = 'loamy_soil';
UPDATE soil_types SET value = 'saline'   WHERE value = 'saline_alkaline_soil';
UPDATE soil_types SET value = 'peaty'    WHERE value = 'organic_peaty_soil';

INSERT INTO soil_types (value, label, is_active)
SELECT 'black_cotton', 'Black Cotton Soil', true
WHERE NOT EXISTS (SELECT 1 FROM soil_types WHERE value = 'black_cotton');
