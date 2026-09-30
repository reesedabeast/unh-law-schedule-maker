/**
 * Pulls UNH Law course data into committed JSON snapshots under src/data/generated/.
 *
 *  - Sections: public schedule API used by courses.unh.edu/timeroom (campus L = Law).
 *    Term codes: YYYY10 = Fall YYYY, YYYY50 = Spring YYYY+1, YYYY70 = Summer YYYY+1.
 *  - Catalog: catalog.unh.edu/law/course-descriptions/{subject}/ course blocks.
 *
 * Run: npm run scrape
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'src', 'data', 'generated');
const API = 'https://wapi.unh.edu/dhub/api/courses';
const CATALOG = 'https://catalog.unh.edu/law/course-descriptions';
const SUBJECTS = ['law', 'lbc', 'lbs', 'lcl', 'lcr', 'ldws', 'lgp', 'lip', 'lpi', 'lrs', 'lsk', 'lsw'];
/** Graduate subjects for the dual degree programs (taken asynchronously; no section data needed). */
const GRAD_CATALOG = 'https://catalog.unh.edu/graduate/course-descriptions';
const GRAD_SUBJECTS: Record<string, string> = { admn: 'mba', sw: 'msw', ppol: 'mpp' };
const FIRST_YEAR = 2021;
const UA = { 'User-Agent': 'Mozilla/5.0 (UNH Law ScheduleMaker data refresh)' };

async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.text();
    if (attempt >= 3) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

// ---------- sections ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function trimSection(raw: any) {
  const c = raw.COURSE_DATA;
  // CODE is sometimes a comma-joined list, e.g. "ONLO, LWI, EUNH".
  const codes = (list: any[] | undefined) =>
    [...new Set((list ?? []).flatMap((a: any) => String(a.CODE ?? '').split(/\s*,\s*/)).filter(Boolean))];
  const attrs: string[] = codes(c.ATTRIBUTES?.ATTRS);
  const delivery: string[] = codes(c.ATTRIBUTES?.DELIVERY_ATTRS);
  const restrictions = Object.values(c.RESTRICTIONS ?? {})
    .filter(Boolean)
    .map((r: any) => `${String(r.text).replace(/<[^>]+>/g, '').trim()} ${r.list}`.trim());
  // Major restriction lists look like "LAW: JD HYBRID:: Juris Doctor||LAW JD DWS:: Juris Doctor".
  // Normalised to program codes such as "JD", "JD DWS", "JD HYBRID", "JD MBA".
  const major = c.RESTRICTIONS?.MAJOR;
  const majorCodes: string[] = major
    ? String(major.list)
        .split('||')
        .map((m) => m.split('::')[0].replace(/^LAW:?\s*/, '').trim())
    : [];
  const majorsExcluded = major && /not allowed/i.test(major.text);
  const onlineOnly = /Graduate Law - Online/.test(c.RESTRICTIONS?.ATTRIBUTE?.list ?? '') && !/Excluding/i.test(c.RESTRICTIONS?.ATTRIBUTE?.text ?? '');
  const low = Number(c.SYVSCHD_CREDIT_HR_LOW ?? c.CREDITS_HRS ?? 0);
  const high = c.SYVSCHD_CREDIT_HR_HIGH ? Number(c.SYVSCHD_CREDIT_HR_HIGH) : low;
  return {
    term: c.SYVSCHD_TERM_CODE as string,
    crn: c.SYVSCHD_CRN as string,
    code: `${c.SYVSCHD_SUBJ_CODE} ${c.SYVSCHD_CRSE_NUMB}`,
    section: c.SYVSCHD_SEQ_NUMB as string,
    title: (c.SYVSCHD_CRSE_LONG_TITLE || c.SYVSCHD_TITLE) as string,
    creditsMin: low,
    creditsMax: Math.max(low, high),
    partOfTerm: c.SYVSCHD_PTRM_DESC as string,
    startDate: c.SYVSCHD_PTRM_START_DATE as string,
    endDate: c.SYVSCHD_PTRM_END_DATE as string,
    gradeMode: c.STVGMOD_DESC as string,
    method: c.SYVSCHD_INSM_CODE as string | null,
    maxEnroll: Number(c.SYVSCHD_MAX_ENRL ?? 0),
    enrolled: Number(c.SYVSCHD_ENRL ?? 0),
    instructors: (c.INSTRUCTORS ?? []).map((i: any) => `${i.FIRST_NAME ?? ''} ${i.LAST_NAME ?? ''}`.trim()),
    meetings: (c.MEETINGS ?? [])
      .filter((m: any) => !m.EXAM)
      .map((m: any) => ({ days: m.DAYS ?? '', time: m.TIME ?? '', building: m.BUILDING ?? '', room: m.ROOM ?? '' })),
    attrs,
    delivery,
    restrictions,
    majorsAllowed: majorsExcluded ? [] : majorCodes,
    majorsExcluded: majorsExcluded ? majorCodes : [],
    onlineOnly,
    prereq: String(c.PRE_REQ ?? '').replace(/<[^>]+>/g, '').trim(),
  };
}

async function fetchTerm(term: string) {
  const url = `${API}/all/${term}?campus=L&page[offset]=0&page[limit]=1000`;
  const json = JSON.parse(await get(url));
  const data: any[] = Array.isArray(json.data) ? json.data : [];
  const readable: string | undefined = data[0]?.COURSE_DATA?.SYVSCHD_TERM_READABLE;
  return { term, name: readable ?? '', sections: data.map(trimSection) };
}

// ---------- catalog ----------

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

function parseCatalogPage(html: string) {
  const blocks = html.split('<div class="courseblock">').slice(1);
  return blocks.map((b) => {
    const title = decode(b.match(/courseblocktitle[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '');
    const [, code = '', name = ''] = title.match(/^([A-Z]+ \d+[A-Z]?)\s*-\s*(.*)$/) ?? [];
    const extras: Record<string, string> = {};
    for (const m of b.matchAll(/courseblockextra[^>]*><strong>([^<]+):<\/strong>([\s\S]*?)<\/p>/g)) {
      extras[m[1].trim()] = decode(m[2]);
    }
    const desc = decode(b.split('</p>').slice(1).join(' ').split('<p class="courseblockextra')[0] ?? '');
    const credits = extras['Credits'] ?? '';
    const nums = (credits.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    return {
      code,
      title: name,
      creditsText: credits,
      creditsMin: nums.length ? Math.min(...nums) : 0,
      creditsMax: nums.length ? Math.max(...nums) : 0,
      description: desc,
      prereq: extras['Prerequisite(s)'] ?? '',
      coreq: extras['Co-requisite(s)'] ?? extras['Corequisite(s)'] ?? '',
      equivalents: (extras['Equivalent(s)']?.match(/[A-Z]+ \d+[A-Z]?/g) ?? []) as string[],
      repeatRule: extras['Repeat Rule'] ?? '',
      gradeMode: extras['Grade Mode'] ?? '',
    };
  });
}

// ---------- main ----------

async function main() {
  mkdirSync(join(OUT, 'sections'), { recursive: true });

  const now = new Date();
  const lastYear = now.getFullYear() + 1;
  const terms: { term: string; name: string; count: number }[] = [];
  const allSections: ReturnType<typeof trimSection>[] = [];
  for (let y = FIRST_YEAR; y <= lastYear; y++) {
    for (const suffix of ['10', '50', '70']) {
      const t = await fetchTerm(`${y}${suffix}`);
      if (!t.sections.length) continue;
      console.log(`${t.term} ${t.name}: ${t.sections.length} sections`);
      terms.push({ term: t.term, name: t.name, count: t.sections.length });
      allSections.push(...t.sections);
      writeFileSync(join(OUT, 'sections', `${t.term}.json`), JSON.stringify(t.sections));
    }
  }

  const catalog = [];
  for (const subj of SUBJECTS) {
    const rows = parseCatalogPage(await get(`${CATALOG}/${subj}/`));
    console.log(`catalog ${subj}: ${rows.length} courses`);
    catalog.push(...rows.filter((r) => r.code).map((r) => ({ ...r, program: 'law' })));
  }
  for (const [subj, program] of Object.entries(GRAD_SUBJECTS)) {
    // Graduate-level (800+) courses only.
    const rows = parseCatalogPage(await get(`${GRAD_CATALOG}/${subj}/`)).filter((r) => /\s[89]\d\d/.test(r.code));
    console.log(`catalog ${subj}: ${rows.length} courses`);
    catalog.push(...rows.map((r) => ({ ...r, program })));
  }

  // Merge into one course index keyed by code.
  const courses: Record<string, any> = {};
  for (const c of catalog) courses[c.code] = { ...c, inCatalog: true, offerings: [] };
  for (const s of allSections) {
    const c = (courses[s.code] ??= {
      code: s.code,
      title: s.title,
      creditsText: String(s.creditsMin),
      creditsMin: s.creditsMin,
      creditsMax: s.creditsMax,
      description: '',
      prereq: s.prereq,
      coreq: '',
      equivalents: [],
      repeatRule: '',
      gradeMode: s.gradeMode,
      program: 'law',
      inCatalog: false,
      offerings: [],
    });
    // attrsAll: carried by every section that term; attrsSome: carried by at least one section.
    const existing = c.offerings.find((o: any) => o.term === s.term);
    if (existing) {
      existing.attrsAll = existing.attrsAll.filter((a: string) => s.attrs.includes(a));
      existing.attrsSome = [...new Set([...existing.attrsSome, ...s.attrs])];
    } else c.offerings.push({ term: s.term, attrsAll: s.attrs, attrsSome: s.attrs });
  }

  writeFileSync(join(OUT, 'terms.json'), JSON.stringify(terms, null, 1));
  writeFileSync(
    join(OUT, 'courses.json'),
    JSON.stringify(Object.values(courses).sort((a, b) => a.code.localeCompare(b.code))),
  );
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ retrieved: now.toISOString() }, null, 1));
  console.log(`${Object.keys(courses).length} courses, ${terms.length} terms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
