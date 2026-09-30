import { useEffect, useRef, useState } from 'react';
import { PROGRAMS } from './data/rules/programs';
import { useStore } from './store';
import { CatalogPage } from './ui/CatalogPage';
import { ProfilePage } from './ui/ProfilePage';
import { ProgressPage } from './ui/ProgressPage';
import { SemestersPage } from './ui/SemestersPage';

const TABS = [
  ['progress', 'Progress'],
  ['semesters', 'Semesters'],
  ['catalog', 'Course catalog'],
  ['profile', 'Profile'],
] as const;
type Tab = (typeof TABS)[number][0];

function readTab(): Tab {
  const h = location.hash.slice(1);
  return (TABS.find(([id]) => id === h)?.[0] ?? 'progress') as Tab;
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(readTab);
  const { profile, enrollments, extraTerms, loadState, reset } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onHash = () => setTabState(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setTab = (t: Tab) => {
    history.pushState(null, '', `#${t}`);
    setTabState(t);
    window.scrollTo(0, 0);
  };

  const exportPlan = () => {
    const blob = new Blob([JSON.stringify({ app: 'unh-law-schedule-maker', version: 1, profile, enrollments, extraTerms }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'unh-law-plan.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importPlan = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!data.profile || !Array.isArray(data.enrollments)) throw new Error('Not a plan file');
      loadState(data);
    } catch (e) {
      alert(`Couldn't load that file: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <header className="app-header">
        <div className="inner">
          <div className="spread">
            <div className="brand">
              <h1>UNH Law Schedule Maker</h1>
              <span>
                {PROGRAMS[profile.program].name}
                {profile.dual ? ` · JD/${profile.dual.toUpperCase()}` : ''}
              </span>
            </div>
            <div className="row small no-print">
              <button onClick={exportPlan} title="Save your record and plan to a file">
                Save plan file
              </button>
              <button onClick={() => fileRef.current?.click()} title="Load a saved plan file">
                Open plan file
              </button>
              <button onClick={() => window.print()}>Print</button>
              <button
                onClick={() => {
                  if (confirm('Clear your profile, courses and plan from this browser?')) reset();
                }}
              >
                Clear
              </button>
              <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importPlan(e.target.files[0])} />
            </div>
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {tab === 'progress' && <ProgressPage />}
        {tab === 'semesters' && <SemestersPage />}
        {tab === 'catalog' && <CatalogPage />}
        {tab === 'profile' && <ProfilePage />}
        <p className="small muted" style={{ marginTop: '2rem' }}>
          Your data stays in this browser (saved automatically). Nothing is sent to a server.
        </p>
      </main>
    </>
  );
}
