-- 2026-11-15 — crop-standard seed rate, so a schedule NEVER shows a blank seed rate.
--
-- Problem (live schedule e59d281c, Rice Indrayani, transplanted): the variety's own transplanted
-- seed-rate row is evidence_tier D_unverified, and getSeedRate refuses an unverified figure, so the
-- nursery seed card had no quantity. A farmer who picked his crop and variety should still be given
-- the standard rate for that crop, labelled as a general standard (not a variety-tuned number).
--
-- This table is the authored crop × method × variety-family seed-rate standard. The runtime seed-rate
-- ladder uses it as rung 2 (after a verified variety rate, before an unverified variety estimate) and
-- as the band it cross-checks every resolved rate against. Column names mirror
-- variety_cultivation_agronomy so the same readers apply. NO per-variety or per-farmer data; NO data
-- is changed elsewhere; NO session state.
--
-- Review status: the seeded rows are authored SAU Package-of-Practices figures (MPKV Krishi Darshani
-- 2026 — the same source already cited by the RICE_MGT_SEED_RATE_* decision rules). They are inserted
-- review_status='approved'. An agronomist should still confirm them before this migration is applied
-- to production. 1 ha = 2.47105 acre.

create table if not exists public.crop_seed_rate_standard (
  id uuid primary key default gen_random_uuid(),
  crop_code text not null references public.crop_code_registry(code),
  cultivation_method text not null references public.cultivation_method_master(method_code),
  -- 'non_hybrid' | 'hybrid' | NULL (a catch-all standard used when the family is unknown).
  seed_rate_variety_type text,
  region_code text,
  seed_rate_kg_per_ha_min numeric,
  seed_rate_kg_per_ha_max numeric,
  seed_rate_kg_per_acre_min numeric,
  seed_rate_kg_per_acre_max numeric,
  seed_rate_broadcast_kg_per_acre_min numeric,
  seed_rate_broadcast_kg_per_acre_max numeric,
  seed_rate_basis_code text,
  seed_rate_rationale text,
  source text not null,
  evidence_tier text not null default 'C_documented_source',
  review_status text not null default 'approved',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crop_code, cultivation_method, seed_rate_variety_type, region_code)
);

comment on table public.crop_seed_rate_standard is
  'Authored crop x method x variety-family seed-rate standards (SAU PoP). Fallback for the seed-rate ladder when no verified variety rate exists, and the band every resolved rate is cross-checked against. Never a variety-tuned figure.';

-- Rice, transplanted. MPKV Krishi Darshani 2026 (transplanted paddy): 30-40 kg/ha for improved
-- (non-hybrid) varieties, 20 kg/ha for hybrids. These are nursery seed for the whole main field.
insert into public.crop_seed_rate_standard
  (crop_code, cultivation_method, seed_rate_variety_type, region_code, seed_rate_kg_per_ha_min, seed_rate_kg_per_ha_max, seed_rate_kg_per_acre_min, seed_rate_kg_per_acre_max, seed_rate_basis_code, seed_rate_rationale, source, evidence_tier)
select * from (values
  ('rice','transplanted','non_hybrid', null, 30.0, 40.0, 12.14, 16.19, 'NURSERY', 'Improved (non-hybrid) transplanted paddy nursery seed for the whole main field: 30-40 kg/ha.', 'MPKV Krishi Darshani 2026 - transplanted paddy seed rate (improved varieties 30-40 kg/ha)', 'C_documented_source'),
  ('rice','transplanted','hybrid',     null, 20.0, 20.0,  8.09,  8.09, 'NURSERY', 'Hybrid transplanted paddy nursery seed for the whole main field: 20 kg/ha.', 'MPKV Krishi Darshani 2026 - transplanted paddy seed rate (hybrids 20 kg/ha)', 'C_documented_source'),
  ('rice','direct_seeded','non_hybrid', null, 75.0,100.0, 30.35, 40.47, 'FIELD_LINE_SOWN', 'Direct-seeded (drilled) paddy: 75-100 kg/ha line-sown; 50-60 kg/ha when dibbled (see broadcast band).', 'MPKV Krishi Darshani 2026 - direct-seeded paddy seed rate (drilling 75-100 kg/ha, dibbling 50-60 kg/ha)', 'C_documented_source')
) as v(crop_code, cultivation_method, seed_rate_variety_type, region_code, seed_rate_kg_per_ha_min, seed_rate_kg_per_ha_max, seed_rate_kg_per_acre_min, seed_rate_kg_per_acre_max, seed_rate_basis_code, seed_rate_rationale, source, evidence_tier)
where not exists (
  select 1 from public.crop_seed_rate_standard s
  where s.crop_code = v.crop_code and s.cultivation_method = v.cultivation_method
    and coalesce(s.seed_rate_variety_type,'') = coalesce(v.seed_rate_variety_type,'')
    and s.region_code is not distinct from v.region_code
);

-- The dibbling band for direct-seeded paddy, as the hand-sowing (broadcast) alternative on the same row.
update public.crop_seed_rate_standard
set seed_rate_broadcast_kg_per_acre_min = 20.23, seed_rate_broadcast_kg_per_acre_max = 24.28, updated_at = now()
where crop_code = 'rice' and cultivation_method = 'direct_seeded' and seed_rate_variety_type = 'non_hybrid'
  and seed_rate_broadcast_kg_per_acre_min is null;
