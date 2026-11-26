-- ═══════════════════════════════════════════════════════════════════════════
-- 20261123180000_fix_chemical_moa_codes.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Corrects mode-of-action codes in public.chemical_rotation_group (seeded
-- 2026-07-24 from safety-enhancement.ts). General Scan copies moa_system +
-- moa_code from this table onto every listed ingredient, so a wrong code here
-- reaches the farmer's rotation advice. Found in the 2026-11-23 vision audit:
-- the first live General Scan showed mancozeb as "FRAC M" (no group number).
--
-- Corrections (FRAC code list — DPPQS copy 2019; IRAC MoA classification):
--   copper hydroxide, copper oxychloride   FRAC M    → FRAC M01  (inorganic copper)
--   mancozeb                               FRAC M    → FRAC M03  (dithiocarbamates)
--   thiram                                 FRAC 7    → FRAC M03  (dithiocarbamate, not an SDHI)
--   carbofuran                             IRAC 1B   → IRAC 1A   (carbamate, not an organophosphate)
--   bacillus thuringiensis                 IRAC 11   → IRAC 11A
--   npv                                    IRAC 11   → IRAC 31   (baculoviruses)
--   beauveria, metarhizium                 IRAC 18   → IRAC UNF  (fungal agents; 18 is ecdysone agonists)
--   difenconazole (spelling)               name      → difenoconazole (FRAC 3 unchanged)
-- rotation_family follows the same pattern as the existing rows (<system>_<code>).
--
-- Updates only; no row is deleted or added. Idempotent: each UPDATE matches
-- only the old value. No session state, no TEMP tables (SQL runner rule).
-- Not changed here (noted for later): the legacy in-code map in
-- supabase/functions/ai-agriculture-chat/decision/safety-enhancement.ts holds
-- the same old codes; getRotationFamily() in phase1-caches.ts has no caller.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.chemical_rotation_group SET moa_code = 'M01', rotation_family = 'FRAC_M01'
 WHERE moa_system = 'FRAC' AND chemical_name IN ('copper hydroxide', 'copper oxychloride') AND moa_code = 'M';

UPDATE public.chemical_rotation_group SET moa_code = 'M03', rotation_family = 'FRAC_M03'
 WHERE moa_system = 'FRAC' AND chemical_name = 'mancozeb' AND moa_code = 'M';

UPDATE public.chemical_rotation_group SET moa_code = 'M03', rotation_family = 'FRAC_M03'
 WHERE moa_system = 'FRAC' AND chemical_name = 'thiram' AND moa_code = '7';

UPDATE public.chemical_rotation_group SET moa_code = '1A', rotation_family = 'IRAC_1A'
 WHERE moa_system = 'IRAC' AND chemical_name = 'carbofuran' AND moa_code = '1B';

UPDATE public.chemical_rotation_group SET moa_code = '11A', rotation_family = 'IRAC_11A'
 WHERE moa_system = 'IRAC' AND chemical_name = 'bacillus thuringiensis' AND moa_code = '11';

UPDATE public.chemical_rotation_group SET moa_code = '31', rotation_family = 'IRAC_31'
 WHERE moa_system = 'IRAC' AND chemical_name = 'npv' AND moa_code = '11';

UPDATE public.chemical_rotation_group SET moa_code = 'UNF', rotation_family = 'IRAC_UNF'
 WHERE moa_system = 'IRAC' AND chemical_name IN ('beauveria', 'metarhizium') AND moa_code = '18';

UPDATE public.chemical_rotation_group SET chemical_name = 'difenoconazole'
 WHERE moa_system = 'FRAC' AND chemical_name = 'difenconazole'
   AND NOT EXISTS (SELECT 1 FROM public.chemical_rotation_group x
                    WHERE x.moa_system = 'FRAC' AND x.chemical_name = 'difenoconazole');

-- POST-CHECK (read-only):
-- select chemical_name, moa_system, moa_code, rotation_family from public.chemical_rotation_group
--  where chemical_name in ('copper hydroxide','copper oxychloride','mancozeb','thiram','carbofuran',
--        'bacillus thuringiensis','npv','beauveria','metarhizium','difenoconazole','difenconazole')
--  order by 1;   -- 10 rows, new codes, no 'difenconazole'
-- select count(*) from public.chemical_rotation_group;  -- 42 (unchanged)
--
-- ROLLBACK (only if needed) — the old values:
--   copper hydroxide / copper oxychloride / mancozeb → moa_code 'M',  rotation_family 'FRAC_M'
--   thiram → '7', 'FRAC_7';  carbofuran → '1B', 'IRAC_1B';  bacillus thuringiensis, npv → '11', 'IRAC_11'
--   beauveria, metarhizium → '18', 'IRAC_18';  difenoconazole → chemical_name 'difenconazole'
