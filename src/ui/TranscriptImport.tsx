import { useState } from 'react';
import { getCourse, normCode } from '../engine/catalog';
import { parseTermName, termName } from '../engine/terms';
import { useStore } from '../store';
import type { ParsedRow, ParseResult } from '../transcript/parseRows';

type Row = ParsedRow & { include: boolean; termText: string };

export function TranscriptImport({ onClose }: { onClose: () => void }) {
  const applyTranscript = useStore((s) => s.applyTranscript);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'replace-record' | 'merge'>('replace-record');

  const onFile = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      // Loaded on demand so pdf.js stays out of the main bundle.
      const { parseTranscriptPdf } = await import('../transcript/parsePdf');
      const r = await parseTranscriptPdf(file);
      setResult(r);
      setRows(r.rows.map((x) => ({ ...x, include: true, termText: termName(x.term) })));
    } catch (e) {
      setError(`Couldn't read that PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const valid = rows.filter((r) => r.include && parseTermName(r.termText));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <h2 id="import-title">Import transcript</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="small muted">
          Choose your UNH law transcript PDF. It is read entirely in your browser — nothing is uploaded. Only course rows are
          kept; your name, ID and other personal details are ignored. You can edit anything below before importing, and
          everything stays editable afterward.
        </p>
        <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {busy && <p>Reading…</p>}
        {error && <div className="issue error">{error}</div>}
        {result && (
          <>
            {result.warnings.map((w, i) => (
              <div key={i} className="issue warning">
                {w}
              </div>
            ))}
            {result.totals && (
              <p className="small muted">
                Transcript totals: {result.totals.earned} earned credits, GPA {result.totals.gpa.toFixed(2)}.
              </p>
            )}
            <div className="table-wrap">
              <table className="review">
                <thead>
                  <tr>
                    <th>Use</th>
                    <th>Term</th>
                    <th>Course</th>
                    <th>Title</th>
                    <th>Credits</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const known = !!getCourse(r.code);
                    return (
                      <tr key={i}>
                        <td>
                          <input type="checkbox" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`Include ${r.code}`} />
                        </td>
                        <td>
                          <input value={r.termText} onChange={(e) => update(i, { termText: e.target.value })} style={{ width: '7.5rem' }} aria-label="Term" />
                        </td>
                        <td>
                          <input value={r.code} onChange={(e) => update(i, { code: normCode(e.target.value) })} style={{ width: '6.5rem' }} aria-label="Course code" />
                        </td>
                        <td className="small">
                          {getCourse(r.code)?.title ?? r.title}
                          {!known && <span className="badge warn" style={{ marginLeft: 4 }}>not in catalog</span>}
                        </td>
                        <td>
                          <input type="number" step="0.5" value={r.credits} onChange={(e) => update(i, { credits: Number(e.target.value) })} style={{ width: '4rem' }} aria-label="Credits" />
                        </td>
                        <td>
                          <input
                            value={r.grade ?? 'IP'}
                            onChange={(e) => {
                              const g = e.target.value.toUpperCase();
                              update(i, g === 'IP' || g === '' ? { grade: undefined, status: 'in-progress' } : { grade: g, status: 'completed' });
                            }}
                            style={{ width: '3.5rem' }}
                            aria-label="Grade (IP = in progress)"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <fieldset className="stack small" style={{ border: 'none', padding: 0, gap: '0.3rem' }}>
              <label className="check">
                <input type="radio" checked={mode === 'replace-record'} onChange={() => setMode('replace-record')} />
                <span>Replace my completed and in-progress courses with this transcript (keeps planned courses)</span>
              </label>
              <label className="check">
                <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                <span>Merge: add these, replacing only matching course + term entries</span>
              </label>
            </fieldset>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button onClick={onClose}>Cancel</button>
              <button
                className="primary"
                disabled={!valid.length}
                onClick={() => {
                  applyTranscript(
                    valid.map((r) => ({ ...r, term: parseTermName(r.termText)! })),
                    mode,
                  );
                  onClose();
                }}
              >
                Import {valid.length} courses
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
