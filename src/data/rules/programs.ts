import type { ProgramId } from '../../engine/types';
import type { Category } from './courseCategories';
import { SOURCES } from './sources';

export interface CourseReq {
  id: string;
  label: string;
  /** Any one of these codes (plus catalog equivalents) satisfies the requirement. */
  codes: string[];
  note?: string;
}

export interface RequirementGroup {
  id: string;
  label: string;
  courses: CourseReq[];
}

export interface ProgramDef {
  id: ProgramId;
  name: string;
  /** Banner major code used by section restrictions. */
  majorCode: string;
  minCredits: number;
  minGpa: number;
  ulwCredits: number;
  elCredits: number;
  /** If set, only courses in these categories count toward Experiential Learning. */
  elCategories?: Category[];
  groups: RequirementGroup[];
  rulesSource: string;
  curriculumSource: string;
  notes: string[];
}

const req = (code: string, label: string, note?: string): CourseReq => ({ id: code, label, codes: [code], note });

const FIRST_YEAR: RequirementGroup = {
  id: 'first-year',
  label: 'First-year required courses',
  courses: [
    req('LGP 909', 'Civil Procedure'),
    req('LGP 920', 'Contracts'),
    req('LSK 921', 'Legal Analysis, Writing, and Research I'),
    req('LGP 900', 'The Legal Profession'),
    req('LGP 960', 'Torts'),
    req('LGP 918', 'Constitutional Law I'),
    req('LCR 905', 'Criminal Law'),
    req('LSK 922', 'Legal Analysis, Writing, and Research II'),
    req('LGP 952', 'Property'),
    {
      id: 'perspectives',
      label: 'Perspectives course: Fundamentals of Law Practice or Fundamentals of Intellectual Property',
      codes: ['LPI 912', 'LIP 944'],
    },
  ],
};

export const PROGRAMS: Record<ProgramId, ProgramDef> = {
  residential: {
    id: 'residential',
    name: 'Residential JD',
    majorCode: 'JD',
    minCredits: 85,
    minGpa: 2.0,
    ulwCredits: 2,
    elCredits: 6,
    groups: [
      FIRST_YEAR,
      {
        id: 'upper-level',
        label: 'Upper-level required courses',
        courses: [
          req('LGP 921', 'Constitutional Law II'),
          req('LGP 951', 'Professional Responsibility', 'Suggested during the 2L year.'),
        ],
      },
    ],
    rulesSource: SOURCES.residentialRules,
    curriculumSource: SOURCES.residentialCurriculum,
    notes: [],
  },
  dws: {
    id: 'dws',
    name: 'Daniel Webster Scholar Honors JD',
    majorCode: 'JD DWS',
    minCredits: 85,
    minGpa: 3.0,
    ulwCredits: 2,
    elCredits: 6,
    elCategories: ['clinic', 'residency'],
    groups: [
      FIRST_YEAR,
      {
        id: 'dws-core',
        label: 'DWS program courses',
        courses: [
          req('LDWS 942', 'DWS Pretrial Advocacy', 'Satisfies the Upper-Level Writing requirement.'),
          req('LDWS 901', 'DWS Trial Advocacy'),
          req('LDWS 902', 'DWS Business Transactions'),
          req('LDWS 903', 'DWS Miniseries'),
          req('LDWS 904', 'DWS Negotiations & ADR'),
          req('LDWS 905', 'DWS Capstone'),
        ],
      },
      {
        id: 'upper-level',
        label: 'Upper-level required courses',
        courses: [
          req('LBS 907', 'Business Associations I'),
          req('LGP 924', 'Evidence'),
          req('LCR 906', 'Criminal Procedure: The Law of Criminal Investigation'),
          req('LGP 921', 'Constitutional Law II'),
          req('LGP 951', 'Professional Responsibility'),
          {
            id: 'dws-perspectives',
            label: 'Upper-level perspectives: Administrative Process or Personal Income Taxation',
            codes: ['LGP 903', 'LBS 932'],
          },
        ],
      },
    ],
    rulesSource: SOURCES.dwsRules,
    curriculumSource: SOURCES.dwsCurriculum,
    notes: [
      'DWS students apply at the end of 1L and begin the program in the fall of 2L.',
      'Experiential Learning must come from clinic or legal residency work.',
    ],
  },
};

/** Required 1L courses that must be done before Upper-Level Writing courses. */
export const ULW_PREREQS = ['LSK 921', 'LSK 922'];

export const CAPS = {
  belowCMinus: 9,
  clinical: 18,
  residency: 15,
  independentStudy: 8,
  nonLaw: 12,
  nonRegular: 21,
} as const;

export const RESIDENCY = {
  semesters: 6,
  transferSemesters: 4,
  fullTimeRegistered: 12,
  fullTimeCompleted: 10,
  maxMonths: 84,
  withinYears: 3,
} as const;
