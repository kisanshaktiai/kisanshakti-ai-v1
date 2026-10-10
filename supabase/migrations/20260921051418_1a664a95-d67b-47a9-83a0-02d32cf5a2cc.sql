-- Land writes were running the same heavy PostGIS/tile work 2-3x per row,
-- causing "canceling statement due to statement timeout" on lands-api.
-- Remove exact-duplicate / redundant triggers. One of each pair is kept.

-- Duplicate of trg_auto_convert_land_boundary (identical function + events)
DROP TRIGGER IF EXISTS on_land_insert_auto_convert ON public.lands;

-- Notice-only overlap scan; trg_prevent_land_overlap already does the check
DROP TRIGGER IF EXISTS trg_check_land_overlap ON public.lands;

-- assign_mgrs_tile_to_land() casts boundary, defeating the GiST index, and
-- writes to land_tile_mapping which is unused (0 rows). Tile bookkeeping is
-- already handled by trigger_update_tiles_for_land + auto_mark_agricultural_tiles.
DROP TRIGGER IF EXISTS trigger_auto_assign_tile ON public.lands;