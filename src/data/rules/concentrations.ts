/**
 * JD Concentrations — Rule XVIII. Every concentration: at least 15 qualifying credits,
 * no S/U (except legal residencies), B- or better, and up to 3 credits of residency/clinic
 * work with approval. Concentration Advisors may approve other courses and waivers.
 */
import type { ProgramId } from '../../engine/types';

export interface ConcentrationGroup {
  label: string;
  codes: string[];
  /** Minimum number of courses from this group. */
  minCourses: number;
}

export interface ConcentrationDef {
  id: string;
  name: string;
  program: string;
  groups: ConcentrationGroup[];
  electives: string[];
  minCredits: number;
  /** Restricted to certain programs (e.g. Hybrid JD only). */
  eligiblePrograms?: (ProgramId | 'hybrid')[];
  extraRequirement?: { key: string; label: string };
  notes?: string[];
}

export const CONCENTRATION_RULES = {
  minCredits: 15,
  minGrade: 'B-',
  maxExperientialCredits: 3,
  deadline: 'Submit the concentration application to the Registrar by the third Friday of your final term.',
};

export const CONCENTRATIONS: ConcentrationDef[] = [
  {
    id: 'criminal',
    name: 'Criminal Law',
    program: 'Criminal Law Program',
    groups: [{ label: 'Required courses', codes: ['LCR 906', 'LCR 907', 'LGP 924', 'LSK 928'], minCourses: 4 }],
    electives: ['LSK 903', 'LCL 924', 'LSK 943', 'LGP 989', 'LGP 925', 'LGP 926', 'LGP 933', 'LGP 963'],
    minCredits: 15,
    extraRequirement: {
      key: 'criminal-el',
      label:
        'Your 6 Experiential Learning credits include the Criminal Practice Clinic or a legal residency with a prosecutor, public defender, or criminal defense firm',
    },
  },
  {
    id: 'entertainment',
    name: 'Entertainment Law',
    program: 'Sports and Entertainment Law Institute',
    groups: [{ label: 'Required courses', codes: ['LIP 915', 'LIP 983'], minCourses: 2 }],
    electives: [
      'LBS 904', 'LGP 919', 'LIP 912', 'LIP 950', 'LPI 914', 'LIP 980', 'LGP 922', 'LGP 929', 'LIP 944',
      'LGP 933', 'LBS 946', 'LIP 928', 'LIP 987', 'LGP 939', 'LIP 977', 'LIP 922',
    ],
    minCredits: 15,
    notes: ['The Institute recommends a substantial writing project related to entertainment law.'],
  },
  {
    id: 'health-life-sciences',
    name: 'Health and Life Sciences (Hybrid JD only)',
    program: 'Health Law and Policy Program',
    eligiblePrograms: ['hybrid'],
    groups: [
      { label: 'Required courses', codes: ['LBS 904', 'LGP 903', 'LGP 965', 'LGP 971', 'LRS 941'], minCourses: 5 },
      { label: 'At least one of', codes: ['LGP 974', 'LGP 990'], minCourses: 1 },
    ],
    electives: [],
    minCredits: 15,
  },
  {
    id: 'health-policy',
    name: 'Health Law and Policy',
    program: 'Health Law and Policy Program',
    groups: [{ label: 'Required courses', codes: ['LGP 971', 'LGP 904', 'LGP 931', 'LGP 930'], minCourses: 4 }],
    electives: [
      'LBS 904', 'LBS 907', 'LGP 919', 'LGP 964', 'LGP 922', 'LBS 946', 'LGP 933', 'LGP 963', 'LIP 954',
      'LBS 932', 'LGP 939', 'LGP 906', 'LIP 977', 'LIP 905',
    ],
    minCredits: 15,
  },
  {
    id: 'ip',
    name: 'Intellectual Property Law',
    program: 'Franklin Pierce Center for Intellectual Property',
    groups: [{ label: 'At least three of', codes: ['LIP 912', 'LIP 944', 'LIP 954', 'LIP 977'], minCourses: 3 }],
    electives: [
      'LCL 908', 'LIP 973', 'LIP 919', 'LIP 924', 'LIP 950', 'LIP 917', 'LRS 902', 'LIP 928', 'LCL 935', 'LCL 936',
      'LIP 979', 'LIP 963', 'LIP 987', 'LIP 997', 'LIP 961', 'LIP 962', 'LGP 939', 'LRS 909', 'LIP 951', 'LIP 918',
      'LIP 923', 'LIP 922',
    ],
    minCredits: 15,
  },
  {
    id: 'sports',
    name: 'Sports Law',
    program: 'Sports and Entertainment Law Institute',
    groups: [
      { label: 'At least three of', codes: ['LIP 914', 'LIP 983', 'LSW 905', 'LIP 932', 'LGP 956', 'LGP 958'], minCourses: 3 },
    ],
    electives: [
      'LBS 904', 'LGP 919', 'LIP 912', 'LIP 950', 'LPI 914', 'LIP 980', 'LGP 922', 'LGP 926', 'LGP 929', 'LIP 944',
      'LGP 931', 'LGP 933', 'LBS 946', 'LIP 928', 'LIP 987', 'LBS 932', 'LIP 977', 'LIP 922', 'LBS 942',
    ],
    minCredits: 15,
    notes: ['The Institute recommends a substantial writing project related to sports law.'],
  },
  {
    id: 'transactional',
    name: 'Transactional Business Law',
    program: 'Business Law Program',
    groups: [
      { label: 'Required course', codes: ['LBS 907'], minCourses: 1 },
      { label: 'At least two core electives', codes: ['LBS 904', 'LBS 906', 'LBS 912', 'LBS 932', 'LBS 934', 'LBS 943'], minCourses: 2 },
    ],
    electives: [
      'LBS 933', 'LBS 934', 'LBS 942', 'LBS 946', 'LGP 922', 'LGP 939', 'LGP 972', 'LIP 980', 'LIP 912', 'LIP 944',
      'LIP 954', 'LIP 977',
    ],
    minCredits: 15,
  },
];

export const concentrationById = (id: string) => CONCENTRATIONS.find((c) => c.id === id);
