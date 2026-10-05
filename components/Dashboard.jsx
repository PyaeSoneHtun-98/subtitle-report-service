'use client';
import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Inbox, Search, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw, LogOut, LockKeyhole, Flag, Check, Circle, X, ArrowRight, AlertCircle, ListFilter } from 'lucide-react';
import { adminRequest, errorMessage } from '../lib/dashboard-client.mjs';

const statuses = [
  ['new', 'New', Inbox], ['reviewed', 'Reviewed', Check],
  ['added', 'Added to dictionary', BookOpen], ['rejected', 'Dismissed', X], ['', 'All reports', ListFilter],
];
const statusName = value => statuses.find(([id]) => id === value)?.[1] ?? value;
const typeName = value => value === 'missing' ? 'Missing translation' : 'Translation issue';
const number = value => new Intl.NumberFormat('en').format(value);
const date = value => {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? '—' : timestamp.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
};
export default function Dashboard() {
  const [auth, setAuth] = useState('checking');
  const [sessionRevision, setSessionRevision] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const write = useRef(null);
  const alive = useRef(false);
  const [filters, setFilters] = useState({ status: 'new', category: '', q: '', page: '0' });
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draftStatus, setDraftStatus] = useState('new');
  const [saved, setSaved] = useState('');
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; write.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setAuth('checking'); setError('');
    adminRequest('session', undefined, controller.signal)
      .then(() => { if (!controller.signal.aborted) setAuth('signed-in'); })
      .catch(error => {
        if (controller.signal.aborted) return;
        setAuth(error.status === 401 ? 'signed-out' : 'unavailable');
        if (error.status !== 401) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [sessionRevision]);
  useEffect(() => {
    if (auth !== 'signed-in') { setResult(null); return; }
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null);
    adminRequest('reports', filters, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(data.reports) || !Number.isSafeInteger(data.total)) throw new Error('Invalid response');
      if (data.reports.length === 0 && data.total > 0 && Number(filters.page) > 0) {
        setFilters(previous => ({ ...previous, page: String(Math.max(0, Math.ceil(data.total / 50) - 1)) }));
        return;
      }
      setResult(data);
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error.status === 401) { setAuth('signed-out'); setSaved(''); }
      else setError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [auth, filters, revision]);
  const selected = result?.reports.find(report => String(report.id) === selectedId) ?? result?.reports[0] ?? null;
  useEffect(() => { setDraftStatus(selected?.status ?? 'new'); }, [selected?.id, selected?.status]);
  async function mutate(action, body, success) {
    if (write.current) return;
    const controller = new AbortController();
    write.current = controller;
    setBusy(true); setError(''); setSaved('');
    try {
      await adminRequest(action, body, controller.signal);
      if (alive.current && !controller.signal.aborted) success();
    } catch (error) {
      if (alive.current && !controller.signal.aborted) {
        if (error.status === 401) setAuth('signed-out');
        else setError(action === 'login' ? errorMessage(error) : 'Could not save the change. Please try again.');
      }
    } finally {
      if (write.current === controller) write.current = null;
      if (alive.current) setBusy(false);
    }
  }
  function signIn(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email')).trim();
    const password = String(data.get('password'));
    form.elements.password.value = '';
    mutate('login', { email, password }, () => setAuth('signed-in'));
  }
  const changeFilter = patch => { setSaved(''); setFilters(previous => ({ ...previous, ...patch, page: '0' })); };
  const signOut = () => mutate('logout', {}, () => { setAuth('signed-out'); setResult(null); setSelectedId(null); setSearch(''); setFilters({ status: 'new', category: '', q: '', page: '0' }); });
  if (auth !== 'signed-in') return <main className="login-page">
    <div className="login-brand"><span className="brand-mark"><BookOpen size={21} /></span> Subtitle Bridge <span className="private-tag"><LockKeyhole size={11} /> Private workspace</span></div>
    <div className="login-shell"><section className="login-intro">
      <span className="eyebrow">A BETTER DICTIONARY, ONE WORD AT A TIME</span>
      <h1>Small reports.<br /><em>Better translations.</em></h1>
      <p>Review what learners are missing, resolve translation issues, and keep your English–Burmese dictionary moving forward.</p>
      <div className="intro-line"><Flag size={18} /><span>A simple inbox for real feedback.</span></div>
    </section><section className="login-card">
      <span className="login-icon"><LockKeyhole size={23} /></span>
      <h2>Your review workspace</h2><p className="muted">Sign in with your dictionary owner account.</p>
      {error && <div className="error" role="alert"><AlertCircle size={17} />{error}</div>}
      {auth === 'checking' ? <p role="status" className="muted">Checking your session…</p> : auth === 'unavailable' ?
        <button className="primary" onClick={() => setSessionRevision(value => value + 1)}>Retry connection <RefreshCw size={16} /></button> :
        <form onSubmit={signIn}>
          <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required disabled={busy} maxLength={160} />
          <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required disabled={busy} maxLength={256} placeholder="Your password" />
          <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button>
        </form>}
      <p className="login-foot"><LockKeyhole size={12} /> Only the configured owner can access reports.</p>
    </section></div><footer>Dictionary review · English → Burmese</footer>
  </main>;
  const page = Number(filters.page);
  const total = result?.total ?? null;
  const pages = Math.max(1, Math.ceil((total ?? 0) / 50));
  return <div className="workspace">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><BookOpen size={21} /></span><div>Subtitle Bridge<small>Dictionary workspace</small></div></div>
      <div className="nav-label">REPORT INBOX</div>
      <nav aria-label="Report views">{statuses.map(([id, label, Icon]) => <button key={id} className={'nav-item ' + (filters.status === id ? 'active' : '')} aria-current={filters.status === id ? 'page' : undefined} disabled={busy} onClick={() => changeFilter({ status: id })}><Icon size={17} /><span>{label}</span>{id === filters.status && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-note"><span className="note-icon"><BookOpen size={19} /></span><strong>Built for better learning</strong><p>Every report helps you find the next word worth improving.</p><span className="language-pill">English <ArrowRight size={12} /> Burmese</span></div>
      <button className="sign-out" disabled={busy} onClick={signOut}><LogOut size={16} />Sign out</button>
      <div className="owner-label"><span className="owner-avatar">O</span><div>Dictionary owner<small><LockKeyhole size={10} /> Private access</small></div></div>
    </aside>
    <main className="main">
      <header className="page-header"><div><div className="breadcrumb">Dictionary <span>/</span> Reports</div><h1>Report inbox<span className="header-dot" /></h1><p>Turn learner feedback into a better dictionary.</p></div><button className="secondary refresh" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} className={loading ? 'spin' : ''} />Refresh</button></header>
      <section className="summary" aria-label="Current view summary">
        <div className="summary-main"><span className="summary-icon"><Inbox size={23} /></span><div><span className="summary-label">{statusName(filters.status) || 'All reports'} · matching entries</span><strong>{loading ? '—' : total === null ? '—' : number(total)}<small>entries</small></strong></div></div>
        <div className="summary-secondary"><span className="summary-label">Submissions on this page</span><strong>{result ? number(result.reports.reduce((count, row) => count + Number(row.report_count), 0)) : '—'}</strong></div>
        <div className="summary-caption"><span className="tiny-dot" /><div>Community feedback<small>Grouped by word and dictionary version</small></div></div>
      </section>
      <section className="inbox">
        <div className="inbox-toolbar"><div><h2>{statusName(filters.status) || 'All reports'}</h2><span className="count-pill">{total === null ? '—' : number(total)}</span></div><span className="toolbar-note">Review at your own pace</span></div>
        <div className="filters"><form onSubmit={event => { event.preventDefault(); changeFilter({ q: search.trim() }); }} className="search"><Search size={17} /><input aria-label="Search word or phrase" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search a word or phrase…" maxLength={120} disabled={busy} /><button type="submit" disabled={busy} aria-label="Apply search"><ArrowRight size={17} /></button></form><label className="type-filter"><span>Type</span><select aria-label="Report type" value={filters.category} disabled={busy} onChange={event => changeFilter({ category: event.target.value })}><option value="">All types</option><option value="missing">Missing translation</option><option value="incorrect">Translation issue</option></select></label></div>
        {error && <div className="error inbox-error" role="alert"><AlertCircle size={17} /><span>{error}</span><button disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
        {saved && <div className="success" role="status"><Check size={16} />{saved}</div>}
        <div className="inbox-body">
          <div className="report-list">
            {loading ? <div className="empty" role="status"><RefreshCw size={25} className="spin" /><h3>Loading reports</h3><p>Getting your latest feedback…</p></div> :
            !result ? <div className="empty"><AlertCircle size={27} /><h3>Reports unavailable</h3><p>Try refreshing to reconnect to your inbox.</p></div> :
            !result.reports.length ? <div className="empty"><Check size={28} /><h3>{filters.q || filters.category ? 'No matching reports' : 'You’re all caught up'}</h3><p>{filters.q || filters.category ? 'Try another search or report type.' : 'Reports in this view will appear here.'}</p></div> :
            <div className="table-scroll"><table><thead><tr><th>Word or phrase</th><th>Reports</th><th>Last received</th><th><span className="sr-only">Open report</span></th></tr></thead><tbody>{result.reports.map(report => <tr key={report.id} className={selected?.id === report.id ? 'selected' : ''}><td><button className="word-button" aria-pressed={selected?.id === report.id} onClick={() => setSelectedId(String(report.id))} disabled={busy}><strong>{report.term}</strong><span className={'type-badge ' + report.category}><span />{typeName(report.category)}</span></button></td><td><span className="report-count">{number(report.report_count)}</span></td><td className="date-cell">{date(report.last_reported_at)}</td><td><button className="open-report" aria-label={'Open report for ' + report.term} disabled={busy} onClick={() => setSelectedId(String(report.id))}><ArrowUpRight size={17} /></button></td></tr>)}</tbody></table></div>}
            <div className="pagination"><span>{result && total > 0 ? number(page * 50 + 1) + '–' + number(page * 50 + result.reports.length) + ' of ' + number(total) : '0 entries'}</span><div><button aria-label="Previous page" disabled={loading || busy || !result || page === 0} onClick={() => setFilters(previous => ({ ...previous, page: String(page - 1) }))}><ChevronLeft size={16} /></button><span>Page {page + 1} of {pages}</span><button aria-label="Next page" disabled={loading || busy || !result || page + 1 >= pages} onClick={() => setFilters(previous => ({ ...previous, page: String(page + 1) }))}><ChevronRight size={16} /></button></div></div>
          </div>
          <aside className="detail" aria-label="Report details">
            {selected ? <><span className="eyebrow">REPORT DETAILS</span><h2>{selected.term}</h2><span className={'type-badge ' + selected.category}><span />{typeName(selected.category)}</span><div className="detail-count"><strong>{number(selected.report_count)}</strong><span>learner {Number(selected.report_count) === 1 ? 'report' : 'reports'}</span></div><dl><div><dt>First received</dt><dd>{date(selected.first_reported_at)}</dd></div><div><dt>Last received</dt><dd>{date(selected.last_reported_at)}</dd></div><div><dt>Dictionary</dt><dd>v{selected.dictionary_version}</dd></div><div><dt>Phrase dictionary</dt><dd>v{selected.phrase_dictionary_version}</dd></div><div><dt>Latest app</dt><dd>v{selected.last_app_version}</dd></div></dl><div className="review-action"><label htmlFor="review-status">Review status</label><select id="review-status" disabled={busy} value={draftStatus} onChange={event => setDraftStatus(event.target.value)}>{statuses.filter(([id]) => id).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button className="primary" disabled={busy || draftStatus === selected.status} onClick={() => mutate('status', { id: String(selected.id), status: draftStatus }, () => { setSaved('Review status saved.'); setRevision(value => value + 1); })}>{busy ? 'Saving…' : 'Save status'}<Check size={16} /></button><p>This updates your review queue.<br />Dictionary content stays unchanged.</p></div></> : <div className="detail-empty"><Flag size={27} /><h3>A little context helps.</h3><p>Select a report to see its details and update its review status.</p></div>}
          </aside>
        </div>
      </section>
      <footer className="workspace-footer"><span><LockKeyhole size={12} />Private owner workspace</span><span>English → Burmese · Dictionary feedback</span></footer>
    </main>
  </div>;
}
