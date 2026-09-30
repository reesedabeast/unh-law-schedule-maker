import type { Enrollment, Layer } from './types';

export const GRADE_POINTS: Record<string, number> = {
  A: 4,
  'A-': 3.67,
  'B+': 3.33,
  B: 3,
  'B-': 2.67,
  'C+': 2.33,
  C: 2,
  'C-': 1.67,
  'D+': 1.33,
  D: 1,
  'D-': 0.67,
  F: 0,
};

export const LETTER_GRADES = Object.keys(GRADE_POINTS);
export const PASS_GRADES = ['S', 'P', 'CR', 'T', 'TR'];
/** Grades that earn no credit. */
const NO_CREDIT = ['F', 'U', 'W', 'WF', 'WP', 'I', 'IC', 'NC', 'AU', 'X'];
export const ALL_GRADES = [...LETTER_GRADES, 'S', 'U', 'W', 'I', 'P'];

export const layerOf = (e: Enrollment): Layer =>
  e.status === 'completed' ? 0 : e.status === 'in-progress' ? 1 : 2;

export const upTo = (es: Enrollment[], layer: Layer) => es.filter((e) => layerOf(e) <= layer);

export const normGrade = (g?: string) => (g ?? '').trim().toUpperCase();

/** Whether the enrollment earns (or, if not completed, is expected to earn) credit. */
export function earnsCredit(e: Enrollment): boolean {
  if (e.status !== 'completed') return true;
  if (e.transferredIn) return true;
  const g = normGrade(e.grade);
  return !NO_CREDIT.includes(g);
}

export function isLetterGrade(g?: string) {
  return normGrade(g) in GRADE_POINTS;
}

export function gpa(es: Enrollment[]) {
  let hours = 0;
  let points = 0;
  for (const e of es) {
    if (e.status !== 'completed' || e.transferredIn) continue;
    const g = normGrade(e.grade);
    if (!(g in GRADE_POINTS)) continue;
    hours += e.credits;
    points += e.credits * GRADE_POINTS[g];
  }
  return { hours, points, gpa: hours ? points / hours : null };
}

/** UNH transcripts truncate GPA to two decimals (53.00 / 14 = 3.7857 prints as 3.78). */
export const formatGpa = (g: number | null) => (g === null ? '—' : (Math.floor(g * 100 + 1e-9) / 100).toFixed(2));

/** Credits earned with D+, D or D- (passing but below C-). */
export function belowCMinusCredits(es: Enrollment[]) {
  return es
    .filter((e) => e.status === 'completed' && ['D+', 'D', 'D-'].includes(normGrade(e.grade)))
    .reduce((s, e) => s + e.credits, 0);
}

/** True when a completed letter grade is at least `min`; non-completed returns true (assumed). */
export function gradeAtLeast(e: Enrollment, min: string): boolean {
  if (e.status !== 'completed') return true;
  const g = normGrade(e.grade);
  if (!(g in GRADE_POINTS)) return false;
  return GRADE_POINTS[g] >= GRADE_POINTS[min] - 1e-9;
}

export const sumCredits = (es: Enrollment[]) => es.reduce((s, e) => s + e.credits, 0);
