import {describe,it,expect} from 'vitest';
import {reviewDraftPayload,listReviewDrafts} from '../../supabase/functions/ai-smart-schedule/review-drafts';

describe('review draft isolation',() => {
  it('stores only selections and evidence identifiers, never actions or doses',() => {
    const result = reviewDraftPayload({tenantId:'tenant',farmerId:'farmer',landId:'land',cropName:'crop',language:'mr',
      selections:{cropName:'crop',sowingDate:'2026-11-11',tasks:[{quantity:99}],is_active:true,expected_harvest_date:'2027-01-01'},
      blockers:['VARIETY_MATURITY_CLOCK_NOT_VERIFIED'],sourceRefs:[{table:'vca',row_id:'row',dose:99}],coverage:{seed:false}});
    expect(result.crop_inputs).toEqual({cropName:'crop',sowingDate:'2026-11-11'});
    expect(result.source_refs).toEqual([{table:'vca',row_id:'row'}]);
    expect(Object.keys(result)).not.toContain('is_active');
  });
  it('binds read-back to tenant farmer and land with a bounded result set',async () => {
    const calls:unknown[]=[];
    const query = {select:()=>query,eq:(key:string,value:string)=>{calls.push([key,value]);return query;},
      order:()=>query,limit:(count:number)=>{calls.push(count);return Promise.resolve({data:[{id:'draft'}],error:null});}};
    const db = {from:(table:string)=>{calls.push(table);return query;}};
    const result = await listReviewDrafts(db as unknown as Parameters<typeof listReviewDrafts>[0],{tenantId:'tenant',farmerId:'farmer'},'land');
    expect(calls).toEqual(['crop_schedule_review_drafts',['tenant_id','tenant'],['farmer_id','farmer'],['land_id','land'],20]);
    expect(result).toEqual([{id:'draft'}]);
  });
});