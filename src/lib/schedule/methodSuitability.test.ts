import { describe, it, expect } from 'vitest';
import { methodSuitabilityFor } from './cultivationMethod';

const rows = [
  { id: 'a', cultivation_method: 'direct_seeded', is_suitable: false },
  { id: 'b', cultivation_method: 'transplanted', is_suitable: true },
];

describe('methodSuitabilityFor', () => {
  it('marks a method not recommended when the DB row says unsuitable', () => {
    const r = methodSuitabilityFor({ code: 'direct_seeded', stageClockMethod: 'direct_seeded' }, rows);
    expect(r.state).toBe('not_recommended');
    expect(r.unsuitable.map((x) => x.id)).toEqual(['a']);
  });
  it('inherits unsuitability from the stage-clock parent method', () => {
    expect(methodSuitabilityFor({ code: 'dry_dsr', stageClockMethod: 'direct_seeded' }, rows).state).toBe('not_recommended');
  });
  it('marks a suitable method recommended', () => {
    expect(methodSuitabilityFor({ code: 'transplanted', stageClockMethod: 'transplanted' }, rows).state).toBe('recommended');
  });
  it('is unknown with no DB row', () => {
    expect(methodSuitabilityFor({ code: 'broadcast', stageClockMethod: null }, rows).state).toBe('unknown');
  });
});
