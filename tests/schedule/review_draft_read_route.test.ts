import { describe, expect, it } from 'vitest';
import { readOwnedReviewDrafts } from '../../supabase/functions/schedules-api/review-drafts';

const landId = '25f98741-f8e8-46a8-b169-18e9a7a1904f';
function database(land: unknown, landError: unknown = null, draftError: unknown = null) {
  const calls: unknown[][] = [];
  const db = { from(table: string) {
    calls.push(['from', table]);
    const result = table === 'lands' ? { data: land, error: landError } : { data: [{ id: 'review' }], error: draftError };
    const query = {
      select() { return query; },
      eq(key: string, value: string) { calls.push([table, key, value]); return query; },
      order() { return query; },
      limit() { return Promise.resolve(result); },
      maybeSingle() { return Promise.resolve(result); },
    };
    return query;
  } };
  return { db: db as unknown as Parameters<typeof readOwnedReviewDrafts>[0], calls };
}
const owner = { tenantId: 'verified-tenant', farmerId: 'verified-farmer' };
describe('independent owner-scoped review reads', () => {
  it('loads reviews with only landId, never requiring cropName or generating tasks', async () => {
    const { db, calls } = database({ id: landId });
    expect(await readOwnedReviewDrafts(db, owner, landId)).toEqual({ status: 200, body: { success: true, drafts: [{ id: 'review' }] } });
    expect(calls.filter(c => c[0] === 'from')).toEqual([['from', 'lands'], ['from', 'crop_schedule_review_drafts']]);
    for (const table of ['lands', 'crop_schedule_review_drafts']) {
      expect(calls).toContainEqual([table, 'farmer_id', 'verified-farmer']);
      expect(calls).toContainEqual([table, 'tenant_id', 'verified-tenant']);
    }
  });
  it('does not read reviews for a foreign or absent land', async () => {
    const { db, calls } = database(null);
    expect((await readOwnedReviewDrafts(db, owner, landId)).status).toBe(404);
    expect(calls).not.toContainEqual(['from', 'crop_schedule_review_drafts']);
  });
  it('rejects malformed land ids before database access', async () => {
    const { db, calls } = database(null);
    expect((await readOwnedReviewDrafts(db, owner, 'bad')).status).toBe(400);
    expect(calls).toEqual([]);
  });
  it('returns unavailable rather than an empty success on database errors', async () => {
    expect((await readOwnedReviewDrafts(database(null, { code: 'timeout' }).db, owner, landId)).status).toBe(503);
    expect((await readOwnedReviewDrafts(database({ id: landId }, null, { code: 'timeout' }).db, owner, landId)).status).toBe(503);
  });
});