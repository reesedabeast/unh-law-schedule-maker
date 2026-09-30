/**
 * Dual degree programs with UNH — Rule XIX plus the graduate catalog program pages.
 */
import type { DualId } from '../../engine/types';
import { SOURCES } from './sources';

export interface MasterGroup {
  label: string;
  codes: string[];
  /** Minimum courses from `codes`; defaults to all of them. */
  minCourses?: number;
  /** Alternatively a credit minimum from `codes` (or any course with `subject` when codes is empty). */
  minCredits?: number;
  subject?: string;
}

export interface DualDef {
  id: DualId;
  name: string;
  majorCode: string;
  subject: string;
  source: string;
  /** Master's credits the law school may accept toward the JD. */
  maxToJd: number;
  /** Master's courses eligible to count toward the JD; null = per program protocol (unpublished). */
  jdTransferable: string[] | null;
  /** Law credits the master's program accepts. */
  lawCreditsToMaster: number;
  lawCoursesToMaster: string[] | null;
  groups: MasterGroup[];
  minGrade?: string;
  minGpa?: number;
  totalMasterCredits: number;
  manualItems: { key: string; label: string }[];
  notes: string[];
}

export const DUAL_RULES = {
  minGpaAfter1L: 3.0,
  applyBy: 'Apply to the MBA, MSW or MPP program before the end of your second JD semester.',
};

export const DUAL_DEGREES: Record<DualId, DualDef> = {
  mba: {
    id: 'mba',
    name: 'JD/MBA (Paul College)',
    majorCode: 'JD MBA',
    subject: 'ADMN',
    source: SOURCES.mba,
    maxToJd: 12,
    jdTransferable: ['ADMN 840', 'ADMN 912', 'ADMN 919', 'ADMN 930', 'ADMN 950', 'ADMN 960', 'ADMN 970'],
    lawCreditsToMaster: 9,
    lawCoursesToMaster: ['LGP 920', 'LGP 960', 'LGP 952'],
    groups: [
      {
        label: 'MBA core courses',
        codes: ['ADMN 912', 'ADMN 919', 'ADMN 926', 'ADMN 930', 'ADMN 940', 'ADMN 950', 'ADMN 960', 'ADMN 970', 'ADMN 982'],
      },
      { label: 'PAUL Assessment of MBA Core Knowledge', codes: ['ADMN 901'] },
    ],
    minGrade: 'B-',
    minGpa: 3.0,
    totalMasterCredits: 36,
    manualItems: [],
    notes: [
      'MBA total is 36 credits. The 9 "additional coursework" credits can be covered by the law credits applied to the MBA (Contracts, Torts, Property) or by a specialization / three approved ADMN electives. Confirm your plan with your Paul College advisor.',
      'MBA students must earn B- or better in all classes and a 3.0 GPA at graduation.',
      'Program length is typically 3.5 years: one year at the law school, then MBA courses online/hybrid alongside law courses.',
    ],
  },
  mpp: {
    id: 'mpp',
    name: 'JD/MPP (Carsey School of Public Policy)',
    majorCode: 'JD MPP',
    subject: 'PPOL',
    source: SOURCES.mpp,
    maxToJd: 12,
    jdTransferable: null,
    lawCreditsToMaster: 9,
    lawCoursesToMaster: null,
    groups: [
      { label: 'MPP core courses', codes: ['PPOL 806', 'PPOL 810', 'PPOL 902', 'PPOL 904', 'PPOL 908'] },
      { label: 'Experiential learning activities', codes: ['PPOL 950', 'PPOL 990A', 'PPOL 990'] },
      { label: 'Policy internship', codes: ['PPOL 998', 'PPOL 998A'], minCourses: 1 },
      { label: 'Public policy track (2 courses)', codes: [], subject: 'PPOL', minCredits: 6 },
    ],
    totalMasterCredits: 40,
    manualItems: [
      { key: 'mpp-jd-electives', label: 'Three policy-relevant JD electives chosen with your MPP advisor (count as 9 MPP credits)' },
    ],
    notes: [
      'The dual degree requires 104 total credits (vs. 125 separately).',
      'Complete at least one year of the JD before starting MPP coursework.',
      'Which MPP courses count toward the JD is set by the JD-MPP protocol, which is not published in the catalog. This tool counts up to 12 PPOL credits — confirm with Academic Advising.',
    ],
  },
  msw: {
    id: 'msw',
    name: 'JD/MSW (Department of Social Work)',
    majorCode: 'JD SW',
    subject: 'SW',
    source: SOURCES.msw,
    maxToJd: 12,
    jdTransferable: null,
    lawCreditsToMaster: 9,
    lawCoursesToMaster: null,
    groups: [
      {
        label: 'Social Work required courses',
        codes: [
          'SW 820', 'SW 826', 'SW 830', 'SW 831', 'SW 840', 'SW 850', 'SW 851', 'SW 860', 'SW 880', 'SW 881',
          'SW 930', 'SW 931', 'SW 952', 'SW 962', 'SW 965', 'SW 982', 'SW 983',
        ],
      },
    ],
    totalMasterCredits: 0,
    manualItems: [],
    notes: [
      'Which MSW courses count toward the JD (up to 12 credits) and which 9 law credits count toward the MSW are set by the JD-MSW protocol, which is not published in the catalog. This tool counts up to 12 SW credits toward the JD — confirm with Academic Advising.',
    ],
  },
};

export interface MasterTag {
  kind: 'required' | 'jd';
  label: string;
}

/** How a graduate course figures in a dual degree: required group(s) and whether it can count toward the JD. */
export function masterTags(code: string, dual: DualId): MasterTag[] {
  const def = DUAL_DEGREES[dual];
  const tags: MasterTag[] = def.groups.filter((g) => g.codes.includes(code)).map((g) => ({ kind: 'required' as const, label: g.label }));
  if (def.jdTransferable?.includes(code)) tags.push({ kind: 'jd', label: `Can count toward the JD (up to ${def.maxToJd} credits)` });
  else if (!def.jdTransferable && code.startsWith(`${def.subject} `))
    tags.push({ kind: 'jd', label: `May count toward the JD per the ${dual.toUpperCase()} protocol — confirm with Academic Advising` });
  return tags;
}
