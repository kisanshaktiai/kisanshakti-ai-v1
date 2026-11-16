import { describe, it, expect } from 'vitest';
import { getCultivationOptions, type CropMethodMaster, type CropMethodLink, type CropStageEvidence } from '../../src/lib/schedule/cultivationMethod';

const masters: CropMethodMaster[] = [
  { method_code:'sett_planted',method_name_en:'Sett planted',method_name_hi:'सेट रोपण',method_name_mr:'कांडी लागवड',requires_nursery:false,is_active:true,parent_method_code:null },
  { method_code:'bud_chip_nursery',method_name_en:'Bud chip',method_name_hi:null,method_name_mr:null,requires_nursery:true,is_active:true,parent_method_code:null },
  { method_code:'ratoon',method_name_en:'Ratoon',method_name_hi:null,method_name_mr:null,requires_nursery:false,is_active:true,parent_method_code:null },
  { method_code:'tissue_culture',method_name_en:'Tissue culture',method_name_hi:null,method_name_mr:null,requires_nursery:true,is_active:true,parent_method_code:null }
];
const linked: CropMethodLink[] = [
  {method_code:'sett_planted',is_primary:true},{method_code:'bud_chip_nursery',is_primary:false},
  {method_code:'ratoon',is_primary:false},{method_code:'tissue_culture',is_primary:false}
];
const stages: CropStageEvidence[] = [
  {crop_cycle:'plant',cultivation_method:'sett_planted',stage_code:'SUGARCANE_PLANTING',growth_stage:'planting'},
  {crop_cycle:'plant',cultivation_method:'sett_planted',stage_code:'SUGARCANE_HARVEST',growth_stage:'harvest'},
  {crop_cycle:'plant',cultivation_method:'bud_chip_nursery',stage_code:'SUGARCANE_SETTLING_NURSERY',growth_stage:'settling_nursery'},
  {crop_cycle:'ratoon',cultivation_method:'sett_planted',stage_code:'SUGARCANE_RATOON_INIT',growth_stage:'ratoon_init'}
];
describe('YieldShield cultivation method picker',()=>{
  it('enables full season sett-planting only for the correct crop cycle',()=>{
    const rows=getCultivationOptions(masters,linked,stages,'plant');
    expect(rows.find(r=>r.code==='sett_planted')?.hasCompleteCalendar).toBe(true);
    expect(rows.find(r=>r.code==='sett_planted')?.requiresNursery).toBe(false);
  });
  it('blocks nursery-only, ratoon-only and tissue-culture gaps rather than inventing maturity',()=>{
    const rows=getCultivationOptions(masters,linked,stages,'plant');
    expect(rows.filter(r=>r.hasCompleteCalendar).map(r=>r.code)).toEqual(['sett_planted']);
  });
  it('does not borrow plant harvest for an incomplete ratoon cycle',()=>{
    const rows=getCultivationOptions(masters,linked,stages,'ratoon');
    expect(rows.every(r=>!r.hasCompleteCalendar)).toBe(true);
  });
  it('respects inherited stage clock for a declared method parent',()=>{
    const inherited=[...masters,{...masters[0],method_code:'sett_child',parent_method_code:'sett_planted'}];
    const rows=getCultivationOptions(inherited,[{method_code:'sett_child',is_primary:false}],stages,'plant');
    expect(rows[0].stageClockMethod).toBe('sett_planted');
    expect(rows[0].hasCompleteCalendar).toBe(true);
  });
  it('does not invent a calendar when there are no stage records',()=>{
    const rows=getCultivationOptions(masters,linked,[],'plant');
    expect(rows.every(r=>!r.hasCompleteCalendar)).toBe(true);
  });
});
