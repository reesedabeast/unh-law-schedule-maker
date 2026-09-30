export type EnrollmentStatus = 'completed' | 'in-progress' | 'planned';

export interface Enrollment {
  id: string;
  /** "LGP 909" — subject + number, the key used everywhere. */
  code: string;
  title?: string;
  /** Banner term code, e.g. "202410". */
  term: string;
  credits: number;
  /** Letter grade, S/U, W, etc. Empty for in-progress/planned. */
  grade?: string;
  status: EnrollmentStatus;
  /** Planned section number, used for meeting times and section-level flags. */
  section?: string;
  /** Student overrides for Upper-Level Writing / Experiential Learning; undefined = use schedule data. */
  ulw?: boolean;
  el?: boolean;
  /** Credit transferred from another law school. */
  transferredIn?: boolean;
  /** Filled in from the default 1L schedule and not yet edited; follows start-term changes. */
  auto?: boolean;
}

export type ProgramId = 'residential' | 'dws';
export type DualId = 'mba' | 'msw' | 'mpp';

export interface ConcentrationApproval {
  /** Extra course codes the Concentration Advisor approved. */
  extraCodes: string[];
  /** Up to 3 credits of residency/clinic work approved toward the concentration. */
  experientialCredits: number;
}

export interface Profile {
  program: ProgramId;
  transfer: boolean;
  /** First JD term, e.g. "202410". */
  startTerm: string;
  concentrations: string[];
  dual: DualId | null;
  /** Manual confirmations keyed by requirement id (bachelor's degree, prelim bar, etc.). */
  manual: Record<string, boolean>;
  concentrationApprovals: Record<string, ConcentrationApproval>;
}

/** Layer 0 = completed, 1 = + in progress, 2 = + planned. */
export type Layer = 0 | 1 | 2;

export type Status =
  | 'met'
  | 'in-progress'
  | 'planned'
  | 'unmet'
  | 'manual-met'
  | 'manual'
  | 'info'
  /** Credit caps report usage, not pass/fail. */
  | 'cap-under'
  | 'cap-hit'
  | 'cap-exceeded';

export interface Progress {
  need: number;
  /** Cumulative values per layer: [completed, +in-progress, +planned]. */
  have: [number, number, number];
  unit: 'credits' | 'courses' | 'semesters';
}

export interface ReqResult {
  id: string;
  label: string;
  status: Status;
  detail?: string;
  progress?: Progress;
  /** Enrollment ids counted toward this requirement. */
  counted?: string[];
  /** Course codes that could satisfy what's missing. */
  suggestions?: string[];
  /** Key into Profile.manual for student-confirmed items. */
  manualKey?: string;
  source?: string;
  children?: ReqResult[];
  /** Problems the student should act on. */
  warnings?: string[];
  /** Informational notes about the rule. */
  notes?: string[];
}

export interface Issue {
  severity: 'error' | 'warning' | 'info';
  term?: string;
  enrollmentId?: string;
  message: string;
}
