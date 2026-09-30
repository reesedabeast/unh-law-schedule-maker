const C = 'https://catalog.unh.edu';

export const SOURCES = {
  residentialRules: `${C}/law/juris-doctor-academic-rules-regulations/requirements/residential-jd/`,
  residentialCurriculum: `${C}/law/programs-study/juris-doctor/juris-doctor-residential-jd/`,
  dwsRules: `${C}/law/juris-doctor-academic-rules-regulations/requirements/daniel-webster-scholar-honors-jd/`,
  dwsCurriculum: `${C}/law/programs-study/juris-doctor/juris-doctor-daniel-webster-scholar-honors-jd/`,
  concentrations: `${C}/law/juris-doctor-academic-rules-regulations/concentrations/`,
  dualRules: `${C}/law/juris-doctor-academic-rules-regulations/dual-degree-programs/`,
  mba: `${C}/graduate/programs-study/business-administration/business-administration-dual-degree-mba-jd/`,
  mpp: `${C}/graduate/programs-study/public-policy/public-policy-dual-degree-mpp-jd/`,
  msw: `${C}/graduate/programs-study/social-work/social-work-sw-jd-dual-degree-msw/`,
  schedule: 'https://courses.unh.edu/timeroom?campus=L',
} as const;

/** Catalog year the hand-entered rules were transcribed from. */
export const RULES_AS_OF = '2026-09-29 (2026–27 catalog)';
