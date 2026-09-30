# UNH Law Schedule Maker

A browser-only planning aid for UNH Franklin Pierce School of Law students. It compares a student's record and a
proposed course plan against JD graduation requirements and explains what's met, in progress, planned, or missing.

**Not an official degree audit.** Students should confirm plans with Academic Advising and the Registrar.

## What it does

- **Start**: pick your first semester and program. The standard 1L year is filled in automatically (Fundamentals
  of Law Practice by default, with one-click swap to Fundamentals of IP). The defaults are fully editable and move
  with the start term until you edit them.
- **Suggested courses pane**: lists every requirement still missing (required courses, ULW, EL, concentration and
  dual degree courses). Each shows whether it's offered and open to you in the chosen semester and whether its
  prerequisites are met, and one click adds it.
- **Semesters**: enter completed courses by hand, or import a UNH transcript PDF to pre-fill them. The PDF is read in
  the browser, only course rows are kept, and everything stays editable. Add planned courses to future semesters, pick
  sections, and see a weekly calendar.
- **Plan checks**: prerequisites (including "may be taken concurrently"), sections restricted to other programs
  (e.g. Hybrid JD), meeting-time conflicts, courses not offered that term, and full-time residency load. There's no
  hard cap on credits per semester; more than 17 credits toward the JD is flagged as an overload (fees apply).
- **Credits toward the JD**: law courses, law transfer credit, and only the master's courses the law school
  accepts. For the MBA that's the enumerated list (ADMN 840, 912, 919, 930, 950, 960, 970), up to 12 credits.
  Other ADMN courses never count toward JD credits, JD GPA or the 17-credit overload threshold. Full-time residency
  status, however, counts every enrolled credit, graduate courses included.
- **Credit limits**: the caps (below C- 9, clinical 18, residency 15, independent study 8, non-law 12,
  non-regularly-scheduled 21) aren't graduation requirements. They show as *Under cap*, *Cap hit* or
  *Cap exceeded*, and credits beyond a cap simply don't count toward the 85.
- **Progress**: evaluates the requirements for
  - Residential JD (Rule I-A) and Daniel Webster Scholar Honors JD (Rule I-D): 85 credits, GPA, required courses,
    Upper-Level Writing (2) and Experiential Learning (6) from separate courses, and residency semesters;
  - all JD concentrations (Rule XVIII), with advisor-approval inputs;
  - JD/MBA, JD/MSW and JD/MPP dual degrees (Rule XIX and the graduate catalog pages).
  Progress is layered as completed → in progress → planned.
- **Course catalog**: search every law course, filter by term offered, ULW/EL/Bar designation, subject, or
  concentration, and see sections, seats and who can enroll. It also covers the graduate ADMN (MBA), PPOL (MPP)
  and SW (MSW) courses, tagged with their dual degree role. They are taken asynchronously, so there are no
  time or section checks for them.

Data is saved in the browser's localStorage. Students can also save or open a plan file (JSON).

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine + transcript parser tests
npm run build    # static site in dist/ (relative paths; host anywhere)
```

### Refreshing course data

```bash
npm run scrape
```

This pulls every law section since Fall 2022 from the public schedule API behind courses.unh.edu/timeroom
(`wapi.unh.edu/dhub/api/courses/all/{term}?campus=L`) and the course descriptions from
catalog.unh.edu/law/course-descriptions, plus the 800/900-level ADMN, PPOL and SW courses from
catalog.unh.edu/graduate/course-descriptions. It writes the results to `src/data/generated/`. Term codes: `YYYY10` = Fall YYYY,
`YYYY50` = Spring YYYY+1, `YYYY70` = Summer YYYY+1.

ULW / EL / Bar designations come from section attributes (`LWI`, `LEXP`, `LBAR`). They are attached to sections, so
they can vary by term and section. Where they vary, the app asks the student to confirm.

### Updating rules

The rules are hand-transcribed from the catalog into `src/data/rules/`:

| File | Source |
| --- | --- |
| `programs.ts` | Rule I-A (Residential), Rule I-D (DWS), curriculum tables |
| `concentrations.ts` | Rule XVIII |
| `dualDegrees.ts` | Rule XIX + graduate catalog MBA/MPP/MSW pages |
| `courseCategories.ts` | Curated clinic / residency / independent study / co-curricular lists for the credit caps |
| `sources.ts` | Links shown in the UI, and the "as of" date |

The engine (`src/engine/`) is generic, so most rule changes are data edits there.

## Known limitations / to confirm with the law school

- The JD-MSW and JD-MPP protocols (which master's credits count toward the JD, and vice versa) aren't published.
  The app counts up to 12 SW/PPOL credits and labels this "confirm with Academic Advising".
- The JD/MBA "additional coursework (9 credits)" is interpreted as satisfiable by the 9 law credits applied to the
  MBA. This is flagged in the UI to confirm with Paul College.
- For the 21-credit cap, clinics with a paired class are treated as having a classroom component. The 1-credit
  Legal Residency Class (LSK 949) is a regular elective and doesn't count toward the residency or 21-credit caps.
- Accepted dual degree master's credits are counted toward the 21-credit "non-regularly-scheduled" cap, as Rule I-A
  lists non-law graduate work there.
- Geographic residency (4 semesters in Concord), the preliminary bar exam, the bachelor's transcript, standing and
  financial holds are student-confirmed checkboxes.
- Not yet supported: Hybrid JD, Advanced Standing JD, JD certificates.
