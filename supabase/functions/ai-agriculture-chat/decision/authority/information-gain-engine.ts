/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INFORMATION GAIN ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Selects clarification questions that maximally reduce hypothesis entropy.
 *
 *   score(q) = H(hypotheses) − Σ_a P(a) · H(hypotheses | q=a)
 *
 * A "question" maps to one OBS_* code; an "answer" is presence / absence /
 * unknown. Each hypothesis declares which OBS codes it requires (positive
 * evidence) and which it forbids (negative evidence).
 *
 * RULE: a question is only emitted if it splits ≥2 competing hypotheses.
 * Generic yes/no questions are rejected.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface HypothesisCandidate {
  id: string;
  prior: number;                  // current posterior in [0,1]
  requires_obs: string[];         // OBS codes that support this hypothesis
  forbids_obs?: string[];         // OBS codes that contradict this hypothesis
  label?: string;
}

export interface CandidateQuestion {
  observation_key: string;        // OBS_* code this question asks about
  question_text?: string;         // pre-translated text (optional)
  i18n_key?: string;
}

export interface RankedQuestion extends CandidateQuestion {
  information_gain: number;
  discriminates: string[];        // hypothesis ids it discriminates
}

const EPS = 1e-9;

export function rankQuestionsByInformationGain(
  hypotheses: HypothesisCandidate[],
  candidates: CandidateQuestion[],
  topN = 5,
): RankedQuestion[] {
  if (hypotheses.length < 2 || candidates.length === 0) return [];

  const normalized = normalizePriors(hypotheses);
  const H0 = entropy(normalized.map(h => h.prior));

  const ranked = candidates
    .map(q => {
      // Partition: hypotheses for which q is positive evidence / negative evidence / neutral
      const pos = normalized.filter(h => h.requires_obs.includes(q.observation_key));
      const neg = normalized.filter(h => (h.forbids_obs ?? []).includes(q.observation_key));
      const neutral = normalized.filter(
        h => !h.requires_obs.includes(q.observation_key)
          && !(h.forbids_obs ?? []).includes(q.observation_key),
      );

      // Need to actually discriminate something
      const discriminates = pos.length > 0 && (neg.length + neutral.length) > 0
        ? pos.map(p => p.id)
        : [];
      if (discriminates.length === 0) {
        return null;
      }

      // P(answer=yes) ≈ sum of priors of hypotheses that require the obs
      const pYes = pos.reduce((s, h) => s + h.prior, 0);
      const pNo = 1 - pYes;

      // After yes: hypotheses that forbid it drop to 0; renormalize the rest
      const afterYes = renormalize(
        normalized.map(h => ((h.forbids_obs ?? []).includes(q.observation_key) ? 0 : h.prior))
      );
      const afterNo = renormalize(
        normalized.map(h => (h.requires_obs.includes(q.observation_key) ? 0 : h.prior))
      );

      const H1 = pYes * entropy(afterYes) + pNo * entropy(afterNo);
      const gain = H0 - H1;

      return {
        ...q,
        information_gain: gain,
        discriminates,
      } as RankedQuestion;
    })
    .filter((r): r is RankedQuestion => r !== null && r.information_gain > EPS)
    .sort((a, b) => b.information_gain - a.information_gain)
    .slice(0, topN);

  return ranked;
}

function normalizePriors(hyps: HypothesisCandidate[]): HypothesisCandidate[] {
  const total = hyps.reduce((s, h) => s + Math.max(0, h.prior), 0);
  if (total <= 0) {
    return hyps.map(h => ({ ...h, prior: 1 / hyps.length }));
  }
  return hyps.map(h => ({ ...h, prior: Math.max(0, h.prior) / total }));
}

function renormalize(priors: number[]): number[] {
  const total = priors.reduce((s, p) => s + Math.max(0, p), 0);
  if (total <= 0) return priors.map(() => 0);
  return priors.map(p => Math.max(0, p) / total);
}

function entropy(priors: number[]): number {
  let h = 0;
  for (const p of priors) {
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}
