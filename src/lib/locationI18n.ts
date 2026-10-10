/**
 * Location name localisation (display only).
 *
 * The database keeps canonical English names (+ UUID FKs). The UI localises:
 *   Tier 1  districts: official DB columns districts.name_<lang> (fetched on demand, cached)
 *   Tier 1b states: small built-in map (36 rows) for hi/mr
 *   Talukas, villages, and any name without an official translation fall back
 *   to the canonical English name. Approximate transliteration is never shown.
 * UUIDs are never shown.
 */
import { supabase } from '@/integrations/supabase/client';

export type PlaceKind = 'state' | 'district' | 'taluka' | 'village';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v?: string | null) => !!v && UUID_RE.test(v.trim());

const DISTRICT_LANG_COLS = new Set(['as', 'bn', 'gu', 'hi', 'kn', 'ml', 'mr', 'or', 'pa', 'ta', 'te', 'ur']);

const STATES: Record<string, { hi: string; mr: string }> = {
  'andhra pradesh': { hi: 'आंध्र प्रदेश', mr: 'आंध्र प्रदेश' },
  'arunachal pradesh': { hi: 'अरुणाचल प्रदेश', mr: 'अरुणाचल प्रदेश' },
  assam: { hi: 'असम', mr: 'आसाम' },
  bihar: { hi: 'बिहार', mr: 'बिहार' },
  chhattisgarh: { hi: 'छत्तीसगढ़', mr: 'छत्तीसगड' },
  goa: { hi: 'गोवा', mr: 'गोवा' },
  gujarat: { hi: 'गुजरात', mr: 'गुजरात' },
  haryana: { hi: 'हरियाणा', mr: 'हरियाणा' },
  'himachal pradesh': { hi: 'हिमाचल प्रदेश', mr: 'हिमाचल प्रदेश' },
  jharkhand: { hi: 'झारखंड', mr: 'झारखंड' },
  karnataka: { hi: 'कर्नाटक', mr: 'कर्नाटक' },
  kerala: { hi: 'केरल', mr: 'केरळ' },
  'madhya pradesh': { hi: 'मध्य प्रदेश', mr: 'मध्य प्रदेश' },
  maharashtra: { hi: 'महाराष्ट्र', mr: 'महाराष्ट्र' },
  manipur: { hi: 'मणिपुर', mr: 'मणिपूर' },
  meghalaya: { hi: 'मेघालय', mr: 'मेघालय' },
  mizoram: { hi: 'मिज़ोरम', mr: 'मिझोराम' },
  nagaland: { hi: 'नागालैंड', mr: 'नागालँड' },
  odisha: { hi: 'ओडिशा', mr: 'ओडिशा' },
  punjab: { hi: 'पंजाब', mr: 'पंजाब' },
  rajasthan: { hi: 'राजस्थान', mr: 'राजस्थान' },
  sikkim: { hi: 'सिक्किम', mr: 'सिक्कीम' },
  'tamil nadu': { hi: 'तमिलनाडु', mr: 'तमिळनाडू' },
  telangana: { hi: 'तेलंगाना', mr: 'तेलंगणा' },
  tripura: { hi: 'त्रिपुरा', mr: 'त्रिपुरा' },
  'uttar pradesh': { hi: 'उत्तर प्रदेश', mr: 'उत्तर प्रदेश' },
  uttarakhand: { hi: 'उत्तराखंड', mr: 'उत्तराखंड' },
  'west bengal': { hi: 'पश्चिम बंगाल', mr: 'पश्चिम बंगाल' },
  'andaman and nicobar islands': { hi: 'अंडमान और निकोबार द्वीपसमूह', mr: 'अंदमान आणि निकोबार बेटे' },
  chandigarh: { hi: 'चंडीगढ़', mr: 'चंदीगड' },
  'dadra and nagar haveli and daman and diu': { hi: 'दादरा और नगर हवेली और दमन और दीव', mr: 'दादरा आणि नगर हवेली आणि दमण आणि दीव' },
  delhi: { hi: 'दिल्ली', mr: 'दिल्ली' },
  'jammu and kashmir': { hi: 'जम्मू और कश्मीर', mr: 'जम्मू आणि काश्मीर' },
  ladakh: { hi: 'लद्दाख', mr: 'लडाख' },
  lakshadweep: { hi: 'लक्षद्वीप', mr: 'लक्षद्वीप' },
  puducherry: { hi: 'पुडुचेरी', mr: 'पुदुच्चेरी' },
};

// ---------- Tier 1: district official names (cached) ----------
const districtCache = new Map<string, Record<string, string | null> | null>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
export const subscribeLocationI18n = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

function fetchDistrict(name: string) {
  const key = name.toLowerCase();
  if (districtCache.has(key) || pending.has(key)) return;
  const p = (async () => {
    const { data } = await (supabase as any)
      .from('districts')
      .select('name,name_as,name_bn,name_gu,name_hi,name_kn,name_ml,name_mr,name_or,name_pa,name_ta,name_te,name_ur')
      .ilike('name', name)
      .limit(1)
      .maybeSingle();
    districtCache.set(key, data ?? null);
  })()
    .catch(() => { districtCache.set(key, null); })
    .finally(() => { pending.delete(key); listeners.forEach((l) => l()); });
  pending.set(key, p);
}

export function localizePlace(name: string | null | undefined, kind: PlaceKind, lang: string): string {
  const raw = (name ?? '').trim();
  if (!raw || isUuid(raw)) return '';
  const l = (lang || 'en').split('-')[0];
  if (l === 'en') return raw;
  if (/[^\x00-\x7F]/.test(raw)) return raw; // already native script

  if (kind === 'state') {
    const s = STATES[raw.toLowerCase()];
    if (s && (l === 'hi' || l === 'mr')) return s[l];
  }
  if (kind === 'district' && DISTRICT_LANG_COLS.has(l)) {
    const row = districtCache.get(raw.toLowerCase());
    if (row === undefined) fetchDistrict(raw);
    const v = row?.[`name_${l}`];
    if (v) return v;
  }
  // Never guess a place-name spelling. Canonical English is safer than a
  // plausible-looking but incorrect local-script name.
  return raw;
}
