import type { Enrollment, EnrollmentStatus, Profile } from '../src/engine/types';

let n = 0;
export function en(code: string, term: string, credits: number, grade?: string, status: EnrollmentStatus = 'completed', extra: Partial<Enrollment> = {}): Enrollment {
  return { id: `e${++n}`, code, term, credits, grade, status, ...extra };
}

export const profile = (p: Partial<Profile> = {}): Profile => ({
  program: 'residential',
  transfer: false,
  startTerm: '202410',
  concentrations: [],
  dual: null,
  manual: {},
  concentrationApprovals: {},
  ...p,
});

/** Standard 1L year starting Fall 2024. */
export const firstYear = (): Enrollment[] => [
  en('LGP 900', '202410', 1, 'S'),
  en('LGP 909', '202410', 4, 'A'),
  en('LGP 920', '202410', 4, 'A'),
  en('LGP 960', '202410', 3, 'B+'),
  en('LSK 921', '202410', 3, 'A-'),
  en('LCR 905', '202450', 3, 'A'),
  en('LGP 918', '202450', 3, 'B+'),
  en('LGP 952', '202450', 4, 'A'),
  en('LIP 944', '202450', 3, 'A'),
  en('LSK 922', '202450', 3, 'A-'),
];

/** Upper-level years that complete the residential JD (85+ credits, 6 full-time semesters). */
export const upperYears = (status: EnrollmentStatus = 'completed'): Enrollment[] => {
  const g = status === 'completed' ? 'B+' : undefined;
  return [
    // Fall 2025
    en('LGP 921', '202510', 3, g, status),
    en('LGP 951', '202510', 3, g, status),
    en('LGP 924', '202510', 3, g, status),
    en('LBS 907', '202510', 3, g, status),
    en('LCR 906', '202510', 3, g, status),
    // Spring 2026
    en('LBS 943', '202550', 3, g, status, { ulw: true }),
    en('LSK 928', '202550', 3, g, status, { el: true }),
    en('LBS 942', '202550', 3, g, status),
    en('LGP 926', '202550', 3, g, status),
    en('LGP 953', '202550', 3, g, status),
    // Fall 2026
    en('LCL 917', '202610', 3, g, status, { el: true }),
    en('LCL 918', '202610', 3, g, status, { el: true }),
    en('LGP 903', '202610', 3, g, status),
    en('LGP 933', '202610', 3, g, status),
    en('LBS 904', '202610', 3, g, status),
    // Spring 2027
    en('LGP 910', '202650', 3, g, status),
    en('LGP 922', '202650', 3, g, status),
    en('LGP 929', '202650', 3, g, status),
    en('LBS 932', '202650', 3, g, status),
    en('LGP 928', '202650', 3, g, status),
  ];
};
