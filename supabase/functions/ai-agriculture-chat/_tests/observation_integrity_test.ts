// Observation contamination regression tests.
// These guard the invariant: Hypothesis → Observation is FORBIDDEN.
// (Observation → Hypothesis → Clarification → Diagnosis → Recommendation only.)

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AuthoredObservationSet,
  ObservationAuthority
} from "../utils/observation-authority.ts";
import {
  EvidenceGraph,
  ObservationIntegrityViolation
} from "../decision/evidence-graph.ts";

Deno.test("HYPOTHESIS_CANDIDATE codes are excluded from getConfirmedAndExtractedCodes", () => {
  const s = new AuthoredObservationSet();
  s.add("OBS_RICE_NO_EMERGENCE", ObservationAuthority.EXTRACTED, "LANGUAGE_INDUCTION");
  s.add("OBS_RICE_SEED_ROTTED", ObservationAuthority.HYPOTHESIS_CANDIDATE, "INTENT_OBSERVATION_MAPPING_DB");
  s.add("OBS_SOIL_CRUST_FORMED", ObservationAuthority.HYPOTHESIS_CANDIDATE, "INTENT_OBSERVATION_MAPPING_DB");
  s.add("OBS_RICE_SEEDLING_DAMPING_OFF", ObservationAuthority.HYPOTHESIS_CANDIDATE, "INTENT_OBSERVATION_MAPPING_DB");

  const confirmed = s.getConfirmedAndExtractedCodes();
  const candidates = s.getCandidateCodes();

  assertEquals(confirmed, ["OBS_RICE_NO_EMERGENCE"]);
  assertEquals(candidates.sort(), [
    "OBS_RICE_SEEDLING_DAMPING_OFF",
    "OBS_RICE_SEED_ROTTED",
    "OBS_SOIL_CRUST_FORMED"
  ].sort());

  // Confirmed ∩ Candidate = ∅
  for (const c of candidates) assert(!confirmed.includes(c), `contamination: ${c}`);
});

Deno.test("Terminal gate codes never include HYPOTHESIS_CANDIDATE", () => {
  const s = new AuthoredObservationSet();
  s.add("PLANT_DEATH", ObservationAuthority.HYPOTHESIS_CANDIDATE, "INTENT_OBSERVATION_MAPPING_DB");
  s.add("OBS_RICE_NO_EMERGENCE", ObservationAuthority.EXTRACTED, "LANGUAGE_INDUCTION");
  const terminal = s.getCodesForTerminalGate();
  assert(!terminal.includes("PLANT_DEATH"), "candidate must never trigger terminal gate");
  assert(terminal.includes("OBS_RICE_NO_EMERGENCE"));
});

Deno.test("EvidenceGraph rejects non-confirmed provenance into confirmed lane", () => {
  const g = new EvidenceGraph();
  g.addConfirmed({
    code: "OBS_RICE_SEED_ROTTED",
    provenance: "INTENT_MAP", // hypothesis source
    source_module: "intent_observation_mapping",
  });
  assertEquals(g.confirmedCodes(), []);
  assertEquals(g.candidateCodes(), ["OBS_RICE_SEED_ROTTED"]);
  assertEquals(g.violations.length, 1);
  assert(g.violations[0] instanceof ObservationIntegrityViolation);
});

Deno.test("EvidenceGraph promotes candidate on clarification answer", () => {
  const g = new EvidenceGraph();
  g.addCandidate({ code: "OBS_DEEP_SOWING", provenance: "INTENT_MAP", source_module: "intent_observation_mapping" });
  assert(g.candidateCodes().includes("OBS_DEEP_SOWING"));
  const promoted = g.promoteToConfirmed("OBS_DEEP_SOWING", "clarification_handler");
  assert(promoted);
  assert(g.confirmedCodes().includes("OBS_DEEP_SOWING"));
  assert(!g.candidateCodes().includes("OBS_DEEP_SOWING"));
});

Deno.test("EvidenceGraph confirmed wins over candidate (never demoted)", () => {
  const g = new EvidenceGraph();
  g.addConfirmed({ code: "OBS_RICE_NO_EMERGENCE", provenance: "FARMER_ASSERTED", source_module: "nlu" });
  g.addCandidate({ code: "OBS_RICE_NO_EMERGENCE", provenance: "INTENT_MAP", source_module: "intent_observation_mapping" });
  assertEquals(g.confirmedCodes(), ["OBS_RICE_NO_EMERGENCE"]);
  assertEquals(g.candidateCodes(), []);
});

Deno.test("No hardcoded RICE_EMERGENCE_GUARD list remains in orchestrator", async () => {
  const src = await Deno.readTextFile(new URL("../agents/orchestrator.ts", import.meta.url));
  assert(
    !src.includes("RICE_EMERGENCE_GUARD"),
    "RICE_EMERGENCE_GUARD must not be re-introduced (hardcoded logic forbidden)"
  );
  assert(
    !src.includes("RICE_EMERGENCE_OBSERVATION_GUARD"),
    "RICE_EMERGENCE_OBSERVATION_GUARD must not be re-introduced"
  );
  // The hardcoded nursery code list must also be gone.
  assert(
    !src.includes("nurseryNoEmergenceCodes"),
    "nurseryNoEmergenceCodes hardcoded list must not exist"
  );
});

Deno.test("Alias expander defaults to alias→canonical (no canonical→alias fan-out)", async () => {
  const src = await Deno.readTextFile(
    new URL("../decision/observation-code-mapper.ts", import.meta.url)
  );
  // Default param must be alias_to_canonical.
  assert(
    /direction:\s*AliasExpansionDirection\s*=\s*['"]alias_to_canonical['"]/.test(src),
    "expandObservationVocabularyViaAliases default direction must be 'alias_to_canonical'"
  );
});
