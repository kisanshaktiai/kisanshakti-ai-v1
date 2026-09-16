from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new), encoding='utf-8')


# Proactive alerts must never consume the mixed-source raw NDVI table.
replace_once(
    'supabase/functions/proactive-evaluator/index.ts',
    """    supabase.from('ndvi_data')\n      .select('land_id, ndvi_value, date')\n      .in('land_id', landIds)\n      .order('date', { ascending: false })\n      .limit(1000),""",
    """    supabase.from('v_ndvi_decision_grade')\n      .select('land_id, ndvi_value, acquisition_date, is_fresh, observation_source, quality_score, effective_pixel_count')\n      .in('land_id', landIds)\n      .eq('observation_source', 'sentinel-2')\n      .order('acquisition_date', { ascending: false })\n      .limit(1000),""",
)

# Preserve the evaluator's existing { date } contract without changing the
# downstream rule engine: the date is now explicitly sourced from the governed
# decision-grade view.
replace_once(
    'supabase/functions/proactive-evaluator/index.ts',
    '  const ndviMap = buildNdviMap(ndviRes.data);',
    "  const ndviMap = buildNdviMap((ndviRes.data || []).map((r: any) => ({ ...r, date: r.acquisition_date })));",
)

print('Single-brain production transformation applied successfully.')
