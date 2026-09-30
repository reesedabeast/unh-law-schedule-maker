import { RESIDENCY } from '../data/rules/programs';
import { earnsCredit, layerOf, sumCredits } from './gpa';
import { jdEnrollments } from './jdCredit';
import { isRegularTerm, nextTerm, termEndMonth, termName, termStartMonth } from './terms';
import type { Enrollment, Layer, Profile, ReqResult, Status } from './types';

export interface TermLoad {
  term: string;
  registered: number;
  earned: number;
  /** Highest layer present in the term (0 = all completed). */
  layer: Layer;
  fullTime: boolean;
}

/**
 * Fall/spring terms with their loads in credits toward the JD (master's courses the law school
 * doesn't accept are excluded). Summer never counts toward residency.
 */
export function regularTermLoads(es: Enrollment[], profile: Profile): TermLoad[] {
  const jd = jdEnrollments(es, profile).filter((e) => !e.transferredIn);
  const terms = [...new Set(jd.map((e) => e.term))].filter(isRegularTerm).sort();
  return terms.map((term) => {
    const inTerm = jd.filter((e) => e.term === term);
    const registered = sumCredits(inTerm);
    const earned = sumCredits(inTerm.filter(earnsCredit));
    const layer = Math.max(...inTerm.map(layerOf)) as Layer;
    const fullTime =
      registered >= RESIDENCY.fullTimeRegistered && (layer > 0 || earned >= RESIDENCY.fullTimeCompleted);
    return { term, registered, earned, layer, fullTime };
  });
}

export function evaluateResidency(es: Enrollment[], profile: Profile): ReqResult {
  const need = profile.transfer ? RESIDENCY.transferSemesters : RESIDENCY.semesters;
  const loads = regularTermLoads(es, profile);
  const have: [number, number, number] = [0, 1, 2].map(
    (l) => loads.filter((t) => t.fullTime && t.layer <= l).length,
  ) as [number, number, number];

  const warnings: string[] = [];
  for (const t of loads) {
    if (t.fullTime) continue;
    if (t.layer === 0) {
      warnings.push(
        `${termName(t.term)} was not full-time (${t.registered} registered, ${t.earned} completed; full-time needs ${RESIDENCY.fullTimeRegistered} registered and ${RESIDENCY.fullTimeCompleted} completed).`,
      );
    } else {
      warnings.push(`${termName(t.term)} has ${t.registered} credits — at least ${RESIDENCY.fullTimeRegistered} are needed for a full-time residency semester.`);
    }
  }

  // Six full-time semesters must be completed within three years of starting.
  if (!profile.dual && profile.startTerm) {
    const windowTerms: string[] = [];
    let t = isRegularTerm(profile.startTerm) ? profile.startTerm : nextTerm(profile.startTerm);
    for (let i = 0; i < RESIDENCY.withinYears * 2; i++) {
      windowTerms.push(t);
      t = nextTerm(t);
    }
    const inWindow = loads.filter((l) => l.fullTime && windowTerms.includes(l.term)).length;
    if (have[2] >= need && inWindow < need) {
      warnings.push(
        `Only ${inWindow} of your full-time semesters fall within the 3-year window (${termName(windowTerms[0])} – ${termName(windowTerms[windowTerms.length - 1])}). Exceptions exist (leave of absence, approved part-time enrollment); talk to Academic Advising.`,
      );
    }
  }

  // Degree must be finished within 84 months of starting.
  const lastTerm = [...es.map((e) => e.term)].sort().pop();
  if (profile.startTerm && lastTerm) {
    const months = termEndMonth(lastTerm) - termStartMonth(profile.startTerm);
    if (months > RESIDENCY.maxMonths) {
      warnings.push(`Your plan runs ${months} months from your start — the JD must be completed within ${RESIDENCY.maxMonths} months.`);
    }
  }

  let status: Status = have[0] >= need ? 'met' : have[1] >= need ? 'in-progress' : have[2] >= need ? 'planned' : 'unmet';
  let detail = `${need} semesters of full-time enrollment (12+ credits registered, 10+ completed), including at least 4 at the Concord campus. Summer terms don't count toward residency.`;
  if (profile.transfer) detail += ' Transfer students need 4.';
  if (profile.dual) {
    status = 'info';
    detail = 'Dual degree students meet residency by following their approved curriculum map. Full-time law semesters so far are shown for reference.';
  }

  return {
    id: 'residency',
    label: 'Residency (full-time semesters)',
    status,
    detail,
    progress: { need, have, unit: 'semesters' },
    warnings,
  };
}
