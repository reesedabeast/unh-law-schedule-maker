import { CAPS, PROGRAMS, ULW_PREREQS, type CourseReq } from '../data/rules/programs';
import { CONCENTRATION_RULES, CONCENTRATIONS, type ConcentrationDef } from '../data/rules/concentrations';
import { DUAL_DEGREES, DUAL_RULES, type DualDef } from '../data/rules/dualDegrees';
import { categoriesOf, isLawCourse } from '../data/rules/courseCategories';
import { SOURCES } from '../data/rules/sources';
import { allocateUlwEl, type Candidate } from './allocate';
import { COURSES, LATEST_TERM, flagFor, getCourse, matchesAny, normCode, subjectOf } from './catalog';
import { belowCMinusCredits, earnsCredit, formatGpa, gpa, gradeAtLeast, isLetterGrade, layerOf, normGrade, sumCredits, upTo } from './gpa';
import { jdEnrollments, nonLawCountsTowardJd } from './jdCredit';
import { evaluateResidency } from './residency';
import { termName } from './terms';
import type { Enrollment, Layer, Profile, ReqResult, Status } from './types';

type Triple = [number, number, number];
const LAYERS: Layer[] = [0, 1, 2];

export function statusFor(have: Triple, need: number): Status {
  if (have[0] >= need - 1e-9) return 'met';
  if (have[1] >= need - 1e-9) return 'in-progress';
  if (have[2] >= need - 1e-9) return 'planned';
  return 'unmet';
}

/** Worst status among children, for group headers. */
export function rollup(children: ReqResult[]): Status {
  const order: Status[] = ['unmet', 'manual', 'planned', 'in-progress', 'manual-met', 'met', 'info'];
  let worst: Status = 'info';
  for (const c of children) if (order.indexOf(c.status) < order.indexOf(worst)) worst = c.status;
  return worst === 'manual-met' ? 'met' : worst;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// ---------------- credit tally with caps ----------------

export interface CreditTally {
  total: number;
  countable: number;
  clinical: number;
  residency: number;
  independentStudy: number;
  nonLaw: number;
  nonRegular: number;
  excess: Record<keyof typeof CAPS, number>;
  /** Non-law courses that never count toward the JD (e.g. MBA courses not on the accepted list). */
  notAccepted: Enrollment[];
}

export function tallyCredits(es: Enrollment[], profile: Profile): CreditTally {
  const dual = profile.dual ? DUAL_DEGREES[profile.dual] : null;
  const earned = es.filter(earnsCredit);
  const law = earned.filter((e) => isLawCourse(e.code) || e.transferredIn);
  const nonLawEs = earned.filter((e) => nonLawCountsTowardJd(e, profile));
  const notAccepted = earned.filter((e) => !isLawCourse(e.code) && !e.transferredIn && !nonLawCountsTowardJd(e, profile));
  const cat = (c: string) => sumCredits(law.filter((e) => categoriesOf(e.code).includes(c as never)));

  const residency = cat('residency');
  const clinicOnly = sumCredits(law.filter((e) => categoriesOf(e.code).includes('clinic') && !categoriesOf(e.code).includes('residency')));
  const independentStudy = cat('independentStudy');
  const coCurricular = cat('coCurricular');
  const nonLaw = sumCredits(nonLawEs);
  const nonLawCap = dual ? Math.min(CAPS.nonLaw, dual.maxToJd) : CAPS.nonLaw;

  const resC = Math.min(residency, CAPS.residency);
  const clinical = clinicOnly + residency;
  const clinC = Math.min(clinicOnly + resC, CAPS.clinical);
  const isC = Math.min(independentStudy, CAPS.independentStudy);
  const nlC = Math.min(nonLaw, nonLawCap);
  // Non-regularly-scheduled: residencies, independent study, non-law, co-curriculars
  // (clinics with a paired class are treated as having a classroom component).
  const resInClin = Math.min(resC, clinC);
  // Measured after the other caps so credits already dropped aren't counted twice.
  const nonRegC = resInClin + isC + nlC + coCurricular;
  const nonRegular = nonRegC;

  const excess = {
    belowCMinus: 0,
    residency: residency - resC,
    clinical: clinicOnly + resC - clinC,
    independentStudy: independentStudy - isC,
    nonLaw: nonLaw - nlC,
    nonRegular: Math.max(0, nonRegC - CAPS.nonRegular),
  };
  const total = sumCredits(law) + nonLaw;
  const countable = total - excess.residency - excess.clinical - excess.independentStudy - excess.nonLaw - excess.nonRegular;
  return { total, countable, clinical, residency, independentStudy, nonLaw, nonRegular, excess, notAccepted };
}

// ---------------- requirement builders ----------------

function courseRequirement(r: CourseReq, es: Enrollment[]): ReqResult {
  const matches = es.filter((e) => matchesAny(e, r.codes) && earnsCredit(e));
  const failed = es.filter((e) => matchesAny(e, r.codes) && !earnsCredit(e));
  const best = matches.length ? Math.min(...matches.map(layerOf)) : 3;
  const status: Status = best === 0 ? 'met' : best === 1 ? 'in-progress' : best === 2 ? 'planned' : 'unmet';
  const hit = matches.find((e) => layerOf(e) === best);
  return {
    id: r.id,
    label: `${r.codes.join(' or ')} — ${r.label}`,
    status,
    detail: hit ? `${hit.code} ${termName(hit.term)}${hit.grade ? ` (${hit.grade})` : ''}` : r.note,
    counted: hit ? [hit.id] : [],
    suggestions: status === 'unmet' ? r.codes : undefined,
    warnings: failed.length ? failed.map((f) => `${f.code} in ${termName(f.term)} did not earn credit (${f.grade}).`) : undefined,
  };
}

function suggestByAttr(attr: 'LWI' | 'LEXP', taken: Enrollment[], categories?: string[]): string[] {
  const takenCodes = new Set(taken.map((e) => normCode(e.code)));
  return COURSES.filter((c) => {
    if (takenCodes.has(c.code)) return false;
    const recent = c.offerings.find((o) => o.term === LATEST_TERM);
    if (!recent?.attrsSome.includes(attr)) return false;
    return !categories || categoriesOf(c.code).some((k) => categories.includes(k));
  }).map((c) => c.code);
}

function ulwElRequirements(es: Enrollment[], profile: Profile): ReqResult[] {
  const program = PROGRAMS[profile.program];
  const earned = es.filter(earnsCredit);
  const unsure = new Map<string, { ulw?: string; el?: string }>();
  const all: (Candidate & { layer: Layer })[] = earned.map((e) => {
    const u = flagFor(e, 'LWI');
    const x = flagFor(e, 'LEXP');
    const note = (f: typeof u, tog: string) => (f.uncertain ? `${e.code} (${termName(e.term)}): ${f.reason}. Use the ${tog} toggle on the course to confirm.` : undefined);
    unsure.set(e.id, { ulw: note(u, 'ULW'), el: note(x, 'EL') });
    const elOk = !program.elCategories || categoriesOf(e.code).some((c) => program.elCategories!.includes(c));
    return { id: e.id, credits: e.credits, ulw: u.value, el: x.value && elOk, layer: layerOf(e) };
  });
  const candidates = (layer: Layer): Candidate[] => all.filter((c) => c.layer <= layer);
  const allocs = LAYERS.map((l) => allocateUlwEl(candidates(l), program.ulwCredits, program.elCredits));
  const ulwHave = allocs.map((a) => a.ulwCredits) as Triple;
  const elHave = allocs.map((a) => a.elCredits) as Triple;
  const final = allocs[2];
  // Ask for confirmation only where it matters: an uncertain course we're counting, or one that
  // might count toward a requirement that's still short.
  const unsureFor = (key: 'ulw' | 'el', counted: string[], short: boolean) =>
    [...unsure.entries()]
      .filter(([id, n]) => n[key] && (counted.includes(id) || (short && !final.ulw.includes(id) && !final.el.includes(id))))
      .map(([, n]) => n[key]!);
  const byId = new Map(es.map((e) => [e.id, e]));
  const describe = (ids: string[]) => ids.map((id) => byId.get(id)!).map((e) => `${e.code} (${e.credits})`).join(', ');

  const warnings: string[] = [];
  // ULW courses need LAWR I & II first.
  const lawr = es.filter((e) => matchesAny(e, ULW_PREREQS) && earnsCredit(e));
  for (const id of final.ulw) {
    const e = byId.get(id)!;
    const donePrereqs = ULW_PREREQS.every((p) => lawr.some((l) => matchesAny(l, [p]) && l.term < e.term));
    if (!donePrereqs) warnings.push(`${e.code} (${termName(e.term)}) is an Upper-Level Writing course; LSK 921 and LSK 922 must be completed first.`);
  }
  // Encourage completion by the next-to-last semester.
  const terms = [...new Set(es.map((e) => e.term))].sort();
  const lastTerm = terms[terms.length - 1];
  // Only meaningful once the plan runs through graduation, so the last term really is the final one.
  const planReachesGraduation = tallyCredits(es, profile).countable >= program.minCredits;
  const timing = (ids: string[], label: string) => {
    if (planReachesGraduation && ids.length && ids.every((id) => byId.get(id)!.term === lastTerm))
      warnings.push(`${label} is only satisfied in your final semester (${termName(lastTerm)}). The school encourages finishing it by your next-to-last semester — a problem here could delay graduation.`);
  };
  timing(final.ulw, 'Upper-Level Writing');
  timing(final.el, 'Experiential Learning');
  const elOnly = program.elCategories ? ['clinic', 'residency'] : undefined;

  return [
    {
      id: 'ulw',
      label: `Upper-Level Writing (${program.ulwCredits} credits)`,
      status: statusFor(ulwHave, program.ulwCredits),
      progress: { need: program.ulwCredits, have: ulwHave, unit: 'credits' },
      detail: final.ulw.length ? `Counting: ${describe(final.ulw)}` : 'Take a course designated "Law Upper Level Writing" (LWI) in the schedule.',
      counted: final.ulw,
      suggestions: ulwHave[2] < program.ulwCredits ? suggestByAttr('LWI', es) : undefined,
      warnings: [...warnings.filter((w) => w.includes('Upper-Level')), ...unsureFor('ulw', final.ulw, ulwHave[2] < program.ulwCredits)],
    },
    {
      id: 'el',
      label: `Experiential Learning (${program.elCredits} credits)${elOnly ? ' — clinic or legal residency' : ''}`,
      status: statusFor(elHave, program.elCredits),
      progress: { need: program.elCredits, have: elHave, unit: 'credits' },
      detail:
        (final.el.length ? `Counting: ${describe(final.el)}. ` : '') +
        'ULW and EL must be met by separate courses — a course designated for both counts toward only one.',
      counted: final.el,
      suggestions: elHave[2] < program.elCredits ? suggestByAttr('LEXP', es, elOnly) : undefined,
      warnings: [...warnings.filter((w) => w.includes('Experiential')), ...unsureFor('el', final.el, elHave[2] < program.elCredits)],
    },
  ];
}

function capResult(id: string, label: string, have: Triple, cap: number, detail: string): ReqResult {
  const over = LAYERS.find((l) => have[l] > cap);
  return {
    id,
    label: `${label} (max ${cap} credits)`,
    status: over === undefined ? 'met' : 'unmet',
    detail:
      over === undefined
        ? `${fmt(have[2])} credits in your record and plan. ${detail}`
        : `${fmt(have[over])} credits${over === 2 ? ' with your plan' : over === 1 ? ' including in-progress courses' : ''} — ${fmt(have[over] - cap)} over the cap won't count toward the 85. ${detail}`,
  };
}

function manualItem(key: string, label: string, profile: Profile, detail?: string): ReqResult {
  return { id: key, label, status: profile.manual[key] ? 'manual-met' : 'manual', manualKey: key, detail };
}

// ---------------- program ----------------

export function evaluateProgram(es: Enrollment[], profile: Profile): ReqResult {
  const program = PROGRAMS[profile.program];
  const tallies = LAYERS.map((l) => tallyCredits(upTo(es, l), profile));
  const countable = tallies.map((t) => t.countable) as Triple;
  const final = tallies[2];

  // JD GPA and the below-C- cap cover only enrollment credited toward the JD.
  const jdEs = jdEnrollments(es, profile);
  const g = gpa(jdEs);
  const gpaStatus: Status = g.gpa === null ? 'info' : g.gpa >= program.minGpa - 1e-9 ? 'met' : 'unmet';
  const below = belowCMinusCredits(jdEs);
  const notAccepted = final.notAccepted;

  const creditChildren: ReqResult[] = [
    {
      id: 'total-credits',
      label: `Total credits (${program.minCredits})`,
      status: statusFor(countable, program.minCredits),
      progress: { need: program.minCredits, have: countable, unit: 'credits' },
      detail:
        [
          final.total !== final.countable ? `${fmt(final.total - final.countable)} credits in your plan exceed a cap and don't count.` : '',
          notAccepted.length
            ? `Not counted toward the JD: ${notAccepted.map((e) => `${e.code} (${e.credits})`).join(', ')} — only the master's courses the law school accepts count.`
            : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined,
    },
    {
      id: 'gpa',
      label: `GPA of at least ${program.minGpa.toFixed(2)}`,
      status: gpaStatus,
      detail: g.gpa === null ? 'No graded courses yet.' : `Current JD GPA ${formatGpa(g.gpa)} over ${fmt(g.hours)} graded credits.`,
    },
    {
      id: 'below-c-minus',
      label: `No more than ${CAPS.belowCMinus} credits below C-`,
      status: below > CAPS.belowCMinus ? 'unmet' : 'met',
      detail: `${fmt(below)} credits of D+, D or D-.`,
    },
    capResult('cap-clinical', 'Clinical work incl. residencies', tallies.map((t) => t.clinical) as Triple, CAPS.clinical, ''),
    capResult('cap-residency', 'Legal residencies', tallies.map((t) => t.residency) as Triple, CAPS.residency, ''),
    capResult('cap-is', 'Independent study', tallies.map((t) => t.independentStudy) as Triple, CAPS.independentStudy, ''),
    capResult(
      'cap-nonlaw',
      'Non-law graduate courses',
      tallies.map((t) => t.nonLaw) as Triple,
      profile.dual ? DUAL_DEGREES[profile.dual].maxToJd : CAPS.nonLaw,
      profile.dual ? 'Master\'s credits the law school accepts under the dual degree.' : '',
    ),
    capResult(
      'cap-nonregular',
      'Not "regularly scheduled" coursework',
      tallies.map((t) => t.nonRegular) as Triple,
      CAPS.nonRegular,
      'Includes independent study, residencies, non-law courses, and co-curriculars (law review, moot court, competitions). Clinic classification is best-effort.',
    ),
  ];

  const groups: ReqResult[] = program.groups.map((grp) => {
    const children = grp.courses.map((c) => courseRequirement(c, es));
    return { id: grp.id, label: grp.label, status: rollup(children), children };
  });

  const writing = ulwElRequirements(es, profile);
  const residency = evaluateResidency(es, profile);

  const prelimCount = es.filter((e) => normCode(e.code) === 'LGP 970' && e.status === 'completed').length;
  const other: ReqResult[] = [
    manualItem(
      'prelim-bar',
      'Preliminary bar exam (spring of 1L and 2L)',
      profile,
      `Taken in spring of your first year and retaken in spring of your second year; meet the target score or complete the required follow-up program.${prelimCount ? ` Your record shows LGP 970 ${prelimCount} time(s).` : ''}`,
    ),
    manualItem('bachelors', 'Official bachelor\'s degree transcript on file (due October 15)', profile),
    manualItem('geo-residency', 'At least 4 semesters at the Concord campus', profile),
    manualItem('standing', 'Good academic standing (not on probation going into graduation)', profile),
    manualItem('financial', 'No outstanding financial obligations to the law school', profile),
  ];

  const children: ReqResult[] = [
    { id: 'credits', label: 'Credits, GPA and caps', status: rollup(creditChildren), children: creditChildren },
    ...groups,
    { id: 'writing-el', label: 'Upper-Level Writing & Experiential Learning', status: rollup(writing), children: writing },
    residency,
    { id: 'other', label: 'Other graduation requirements (confirm yourself)', status: rollup(other), children: other },
  ];

  return {
    id: program.id,
    label: program.name,
    status: rollup(children.filter((c) => c.id !== 'other')),
    children,
    source: program.rulesSource,
    notes: program.notes,
  };
}

// ---------------- concentrations ----------------

export function evaluateConcentration(def: ConcentrationDef, es: Enrollment[], profile: Profile): ReqResult {
  if (def.eligiblePrograms && !def.eligiblePrograms.includes(profile.program)) {
    return {
      id: `conc-${def.id}`,
      label: `Concentration: ${def.name}`,
      status: 'info',
      detail: 'This concentration is only available to Hybrid JD students.',
      source: SOURCES.concentrations,
    };
  }
  const approval = profile.concentrationApprovals[def.id] ?? { extraCodes: [], experientialCredits: 0 };
  const pool = [...new Set([...def.groups.flatMap((g) => g.codes), ...def.electives, ...approval.extraCodes])];
  const warnings: string[] = [];

  const qualifies = (e: Enrollment) => {
    if (!matchesAny(e, pool) || !earnsCredit(e)) return false;
    if (e.status !== 'completed') return true;
    const g = normGrade(e.grade);
    if (isLetterGrade(g)) {
      if (gradeAtLeast(e, CONCENTRATION_RULES.minGrade)) return true;
      warnings.push(`${e.code} (${e.grade}) doesn't qualify — concentration courses need ${CONCENTRATION_RULES.minGrade} or better.`);
      return false;
    }
    // S/U is not allowed, except for listed courses that are only offered S/U.
    const sOnly = /Satisf/i.test(getCourse(e.code)?.gradeMode ?? '');
    if (sOnly && g === 'S') {
      warnings.push(`${e.code} was graded S/U; the rule bars S/U courses, but this course is listed and only offered S/U — confirm with the Concentration Advisor.`);
      return true;
    }
    warnings.push(`${e.code} was taken S/U and doesn't qualify.`);
    return false;
  };
  const qualifying = es.filter(qualifies);
  const expCredits = Math.min(approval.experientialCredits || 0, CONCENTRATION_RULES.maxExperientialCredits);

  const groupResults: ReqResult[] = def.groups.map((g, i) => {
    const have = LAYERS.map(
      (l) => new Set(upTo(qualifying, l).filter((e) => matchesAny(e, g.codes)).map((e) => normCode(e.code))).size,
    ) as Triple;
    const takenCodes = new Set(qualifying.map((e) => normCode(e.code)));
    return {
      id: `conc-${def.id}-g${i}`,
      label: `${g.label}: ${g.codes.join(', ')}`,
      status: statusFor(have, g.minCourses),
      progress: { need: g.minCourses, have, unit: 'courses' },
      suggestions: have[2] < g.minCourses ? g.codes.filter((c) => !takenCodes.has(c)) : undefined,
    };
  });
  const credits = LAYERS.map((l) => sumCredits(upTo(qualifying, l)) + expCredits) as Triple;
  const takenCodes = new Set(qualifying.map((e) => normCode(e.code)));
  const children: ReqResult[] = [
    ...groupResults,
    {
      id: `conc-${def.id}-credits`,
      label: `${def.minCredits} qualifying credits (B- or better, no S/U)`,
      status: statusFor(credits, def.minCredits),
      progress: { need: def.minCredits, have: credits, unit: 'credits' },
      detail:
        `Counting: ${qualifying.map((e) => `${e.code} (${e.credits})`).join(', ') || 'none yet'}` +
        (expCredits ? `, plus ${expCredits} approved residency/clinic credits` : '') +
        '.',
      counted: qualifying.map((e) => e.id),
      suggestions: credits[2] < def.minCredits ? def.electives.filter((c) => !takenCodes.has(c) && getCourse(c)) : undefined,
    },
  ];
  if (def.extraRequirement) children.push(manualItem(def.extraRequirement.key, def.extraRequirement.label, profile));

  return {
    id: `conc-${def.id}`,
    label: `Concentration: ${def.name}`,
    status: rollup(children),
    detail: `${def.program}. ${CONCENTRATION_RULES.deadline} Advisors may approve other courses or waivers; up to 3 credits of relevant residency/clinic work may count with approval.`,
    children,
    source: SOURCES.concentrations,
    warnings: [...new Set(warnings)],
    notes: def.notes,
  };
}

// ---------------- dual degrees ----------------

export function evaluateDual(def: DualDef, es: Enrollment[], profile: Profile): ReqResult {
  const master = es.filter((e) => subjectOf(e.code) === def.subject && earnsCredit(e));
  const warnings: string[] = [];
  if (def.minGrade) {
    for (const e of master)
      if (e.status === 'completed' && isLetterGrade(e.grade) && !gradeAtLeast(e, def.minGrade))
        warnings.push(`${e.code} (${e.grade}) is below the ${def.minGrade} minimum for the ${def.name.split(' ')[0]}.`);
  }
  const usedInGroups = new Set<string>();
  const children: ReqResult[] = def.groups.map((g, i) => {
    if (g.codes.length === 0) {
      // Credit-based group (e.g. MPP track): any course in the subject not used elsewhere.
      const pool = master.filter((e) => !usedInGroups.has(e.id));
      const have = LAYERS.map((l) => sumCredits(upTo(pool, l))) as Triple;
      return {
        id: `dual-g${i}`,
        label: g.label,
        status: statusFor(have, g.minCredits ?? 0),
        progress: { need: g.minCredits ?? 0, have, unit: 'credits' },
      };
    }
    const need = g.minCourses ?? g.codes.length;
    const hits = master.filter((e) => matchesAny(e, g.codes));
    hits.forEach((e) => usedInGroups.add(e.id));
    const have = LAYERS.map((l) => new Set(upTo(hits, l).map((e) => normCode(e.code))).size) as Triple;
    const missing = g.codes.filter((c) => !hits.some((e) => matchesAny(e, [c])));
    return {
      id: `dual-g${i}`,
      label: g.label,
      status: statusFor(have, need),
      progress: { need, have, unit: 'courses' },
      detail: missing.length && have[2] < need ? `Not yet on your record or plan: ${missing.join(', ')}` : undefined,
      suggestions: have[2] < need ? missing : undefined,
    };
  });

  if (def.lawCoursesToMaster) {
    const lawHits = es.filter((e) => matchesAny(e, def.lawCoursesToMaster!) && earnsCredit(e));
    const have = LAYERS.map((l) => sumCredits(upTo(lawHits, l))) as Triple;
    children.push({
      id: 'dual-law-to-master',
      label: `Law credits applied to the master's (${def.lawCreditsToMaster}): ${def.lawCoursesToMaster.join(', ')}`,
      status: statusFor(have, def.lawCreditsToMaster),
      progress: { need: def.lawCreditsToMaster, have: have.map((h) => Math.min(h, def.lawCreditsToMaster)) as Triple, unit: 'credits' },
      detail: 'These three courses total 10 credits; UNH adjusts the transfer to 9.',
    });
  }
  for (const m of def.manualItems) children.push(manualItem(m.key, m.label, profile));

  if (def.minGpa) {
    const g = gpa(master);
    children.push({
      id: 'dual-gpa',
      label: `Master's GPA of at least ${def.minGpa.toFixed(1)}`,
      status: g.gpa === null ? 'info' : g.gpa >= def.minGpa ? 'met' : 'unmet',
      detail: g.gpa === null ? 'No graded master\'s courses yet.' : `Current master's GPA ${g.gpa.toFixed(2)}.`,
    });
  }

  // Eligibility: B (3.0) average at the end of the first JD year.
  const firstYearTerms = [...new Set(es.filter((e) => isLawCourse(e.code)).map((e) => e.term))].sort().slice(0, 2);
  const oneL = gpa(es.filter((e) => firstYearTerms.includes(e.term) && isLawCourse(e.code)));
  if (oneL.gpa !== null && oneL.gpa < DUAL_RULES.minGpaAfter1L)
    warnings.push(`Your first-year law GPA (${oneL.gpa.toFixed(2)}) is below the ${DUAL_RULES.minGpaAfter1L.toFixed(1)} needed to enter a dual degree program.`);

  return {
    id: `dual-${def.id}`,
    label: def.name,
    status: rollup(children),
    detail:
      `${DUAL_RULES.applyBy} ` +
      (def.jdTransferable
        ? `Only these ${def.subject} courses count toward the JD (up to ${def.maxToJd} credits): ${def.jdTransferable.join(', ')}.`
        : `Up to ${def.maxToJd} ${def.subject} credits may count toward the JD.`),
    children,
    source: def.source,
    warnings,
    notes: def.notes,
  };
}

// ---------------- top level ----------------

export interface Evaluation {
  program: ReqResult;
  concentrations: ReqResult[];
  dual: ReqResult | null;
  tally: CreditTally;
  gpa: number | null;
}

export function evaluate(es: Enrollment[], profile: Profile): Evaluation {
  return {
    program: evaluateProgram(es, profile),
    concentrations: profile.concentrations
      .map((id) => CONCENTRATIONS.find((c) => c.id === id))
      .filter((c): c is ConcentrationDef => !!c)
      .map((c) => evaluateConcentration(c, es, profile)),
    dual: profile.dual ? evaluateDual(DUAL_DEGREES[profile.dual], es, profile) : null,
    tally: tallyCredits(es, profile),
    gpa: gpa(jdEnrollments(es, profile)).gpa,
  };
}
