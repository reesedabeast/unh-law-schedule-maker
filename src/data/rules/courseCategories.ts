/**
 * Categories used by the credit caps in Rule I-A(C)(4). The schedule API doesn't tag these,
 * so they're curated here from subjects and titles (best effort — see notes in the UI).
 */
import { getCourse, normCode, subjectOf } from '../../engine/catalog';

export type Category = 'clinic' | 'residency' | 'independentStudy' | 'coCurricular' | 'nonLaw';

const RESIDENCY = ['LSK 906', 'LSK 907', 'LSK 933', 'LSK 934', 'LSK 948', 'LSK 949'];
const INDEPENDENT_STUDY = ['LRS 905'];
/** Law review/journal, moot court and competitions. */
const CO_CURRICULAR = ['LRS 902', 'LRS 909', 'LRS 910', 'LRS 911', 'LRS 930', 'LRS 934', 'LRS 990', 'LSK 940', 'LSK 960', 'LSK 961'];

export const LAW_SUBJECTS = ['LAW', 'LBC', 'LBS', 'LCL', 'LCR', 'LDWS', 'LGP', 'LIP', 'LPI', 'LRS', 'LSK', 'LSW'];

export function isLawCourse(code: string) {
  return LAW_SUBJECTS.includes(subjectOf(code));
}

export function categoriesOf(code: string): Category[] {
  const c = normCode(code);
  const title = getCourse(c)?.title ?? '';
  const out: Category[] = [];
  if (!isLawCourse(c)) out.push('nonLaw');
  if (subjectOf(c) === 'LCL') out.push('clinic');
  if (RESIDENCY.includes(c) || /legal residency/i.test(title)) out.push('residency');
  if (INDEPENDENT_STUDY.includes(c) || /independent study/i.test(title)) out.push('independentStudy');
  if (CO_CURRICULAR.includes(c) || /competition|moot court|law journal|law review/i.test(title)) out.push('coCurricular');
  return out;
}

export const hasCategory = (code: string, cat: Category) => categoriesOf(code).includes(cat);

export const CATEGORY_LABELS: Record<Category, string> = {
  clinic: 'Clinic',
  residency: 'Legal residency',
  independentStudy: 'Independent study',
  coCurricular: 'Co-curricular (journal, moot court, competition)',
  nonLaw: 'Non-law graduate course',
};
