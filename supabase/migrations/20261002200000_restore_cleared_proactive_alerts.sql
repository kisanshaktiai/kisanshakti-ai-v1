-- 2026-10-02 — Restore the 338 proactive alerts the evaluator's first v128 run
-- (17:15 UTC) set to EXPIRED because their rule had gone quiet, although their
-- own expires_at had not passed. The agronomist confirmed on the land that the
-- irrigation alerts among them were real water stress (no rain for a month) and
-- that farmers should keep seeing recent alerts until they expire on their own
-- date. The "cleared" sweep is removed from the evaluator in the same change.
--
-- Scope (verified before writing this file):
--   338 rows, 12 farmers, 30 lands; all still inside their expiry window;
--   none seen, delivered or acted on, so every row goes back to PENDING.
-- Rows past their expires_at are left EXPIRED (the app already hid them).
-- Nothing is deleted. Reversible: the rows carry updated_at = this statement's
-- time; the 17:15 sweep is identifiable by created_at < '2026-10-02 17:15'.

update public.proactive_alerts
set status = 'PENDING',
    updated_at = now()
where status = 'EXPIRED'
  and updated_at >= '2026-10-02 17:15:00+00'
  and updated_at <  '2026-10-02 17:16:00+00'
  and expires_at  > now()
  and seen_at is null
  and acted_at is null;
