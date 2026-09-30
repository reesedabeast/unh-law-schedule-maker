/**
 * Which enrollments count toward the JD. Law courses and law transfer credit always do.
 * Master's courses count only as Rule XIX allows: where the dual degree enumerates accepted
 * courses (the MBA list), only those; otherwise courses in the student's own dual program.
 * Students not in a dual degree may count other non-law graduate work (Rule I-A cap of 12).
 */
import { DUAL_DEGREES } from '../data/rules/dualDegrees';
import { isLawCourse } from '../data/rules/courseCategories';
import { normCode, subjectOf } from './catalog';
import { sumCredits } from './gpa';
import type { Enrollment, Profile } from './types';

export function nonLawCountsTowardJd(e: Enrollment, profile: Profile): boolean {
  if (isLawCourse(e.code) || e.transferredIn) return false;
  const code = normCode(e.code);
  const owner = Object.values(DUAL_DEGREES).find((d) => subjectOf(code) === d.subject);
  const dual = profile.dual ? DUAL_DEGREES[profile.dual] : null;
  // Enumerated lists are exhaustive: e.g. only ADMN 840/912/919/930/950/960/970 from the MBA.
  if (owner?.jdTransferable) return owner.jdTransferable.includes(code) && (!dual || dual.id === owner.id);
  if (dual) return owner?.id === dual.id;
  return true;
}

export function countsTowardJd(e: Enrollment, profile: Profile): boolean {
  return isLawCourse(e.code) || !!e.transferredIn || nonLawCountsTowardJd(e, profile);
}

export const jdEnrollments = (es: Enrollment[], profile: Profile) => es.filter((e) => countsTowardJd(e, profile));

export const jdCreditsIn = (es: Enrollment[], profile: Profile) => sumCredits(jdEnrollments(es, profile));
