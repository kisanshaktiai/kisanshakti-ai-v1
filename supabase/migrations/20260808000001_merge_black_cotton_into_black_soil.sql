-- "Black cotton soil" is a colloquial synonym for black/regur soil (Vertisol),
-- per NBSS&LUP / ICAR classification — one soil, one canonical code.
-- Engine coefficients for black and black_cotton are identical, so no
-- agronomic output changes for the migrated land.
UPDATE lands SET soil_type = 'black' WHERE soil_type = 'black_cotton';
DELETE FROM soil_types WHERE value = 'black_cotton';
