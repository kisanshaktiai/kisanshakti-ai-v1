// 2026-11-13 — Day-0 establishment card wording — pure, database labels only.
//
// The first card of every schedule used to read "Sow the crop" / "Plan establishment using certified
// seed", so a farmer who had selected a named variety saw a card that could belong to any crop. The
// card now names the crop, the selected variety and the growth stage it belongs to. All three are
// database labels passed in; no crop, variety or stage word is typed here, and no quantity is added.
export interface EstablishmentFacts {
  cropLabel: string | null; cropCode: string | null; varietyName: string | null; stageLabel: string | null;
  seedKg: number | null; areaAcres: number | null;
}
export function establishmentDescription(f: EstablishmentFacts): string {
  const subject = [f.cropLabel ?? f.cropCode, f.varietyName ? `(${f.varietyName})` : null].filter(Boolean).join(" ") || "the crop";
  const stage = f.stageLabel ? String(f.stageLabel) : null;
  return f.seedKg != null && f.areaAcres != null
    ? `Sow ${subject}${stage ? ` (${stage} stage)` : ""}. Use ${f.seedKg} kg of seed for ${f.areaAcres} acre.`
    : `Start ${subject}${stage ? ` at the ${stage} stage` : ""} using certified seed of this variety; the seed quantity is pending verification for this crop, variety and method.`;
}
