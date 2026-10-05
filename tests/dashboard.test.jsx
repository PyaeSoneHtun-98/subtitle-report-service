import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import Dashboard from '../components/Dashboard.jsx';
const row = { id: 1, term: 'example', category: 'incorrect', status: 'new', report_count: 2, dictionary_version: '1.0', phrase_dictionary_version: '1.0.0', last_app_version: '1.0.6', first_reported_at: '2026-10-01T00:00:00Z', last_reported_at: '2026-10-05T00:00:00Z' };
const ok = value => Response.json({ ok: true, ...value });
const reports = (rows = [row], total = rows.length) => ok({ reports: rows, total, page: 0 });
let fetcher;
beforeEach(() => {
  fetcher = vi.fn(async url => String(url).includes('session') ? ok({}) : reports());
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('owner dashboard actual React lifecycle', () => {
  it('loads authenticated reports and displays selected details', async () => {
    render(<Dashboard />);
    await screen.findByRole('button', { name: 'Open report for example' });
    expect(screen.getByRole('heading', { name: 'example' })).toBeTruthy();
    expect(screen.getByText('learner reports')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save status' }).disabled).toBe(true);
  });
  it('uses a private POST body for search and resets pagination for filters', async () => {
    render(<Dashboard />);
    await screen.findByRole('button', { name: 'Open report for example' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search word or phrase' }), { target: { value: 'give up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply search' }));
    await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => url.endsWith('reports') && JSON.parse(init.body).q === 'give up')).toBe(true));
    expect(fetcher.mock.calls.every(([url]) => !url.includes('give'))).toBe(true);
    const call = fetcher.mock.calls.filter(([url]) => url.endsWith('reports')).at(-1);
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body).page).toBe('0');
  });
  it('ignores a stale listing after switching review views', async () => {
    let finish;
    fetcher.mockImplementation(async url => url.includes('session') ? ok({}) : new Promise(resolve => { finish = resolve; }));
    render(<Dashboard />);
    await screen.findByRole('heading', { name: 'Report inbox' });
    await waitFor(() => expect(finish).toBeTruthy());
    const old = finish;
    fireEvent.click(screen.getByRole('button', { name: 'Reviewed' }));
    await waitFor(() => expect(finish).not.toBe(old));
    finish(reports([{ ...row, id: 2, term: 'current', status: 'reviewed' }]));
    await screen.findByRole('button', { name: 'Open report for current' });
    old(reports([row]));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open report for example' })).toBeNull());
  });
  it('shows a retryable storage error, preserving sign-out access', async () => {
    fetcher.mockImplementation(async url => url.includes('session') ? ok({}) : Response.json({ ok: false, code: 'storage_access_denied' }, { status: 503 }));
    render(<Dashboard />);
    expect((await screen.findByRole('alert')).textContent).toContain('server secret key');
    expect(screen.getByRole('button', { name: 'Sign out' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Retry' }).disabled).toBe(false);
  });
  it('expires safely to login when report session is no longer valid', async () => {
    fetcher.mockImplementation(async url => url.includes('session') ? ok({}) : Response.json({ ok: false }, { status: 401 }));
    render(<Dashboard />);
    await screen.findByLabelText('Email address');
    expect(screen.queryByRole('heading', { name: 'example' })).toBeNull();
  });
  it('uses a single-flight write and restores controls after failed status save', async () => {
    let finish;
    fetcher.mockImplementation(async url => url.includes('session') ? ok({}) : url.includes('status') ? new Promise(resolve => { finish = resolve; }) : reports());
    render(<Dashboard />);
    await screen.findByRole('button', { name: 'Open report for example' });
    fireEvent.change(screen.getByLabelText('Review status'), { target: { value: 'reviewed' } });
    const save = screen.getByRole('button', { name: 'Save status' });
    fireEvent.click(save); fireEvent.click(save);
    expect(fetcher.mock.calls.filter(([url]) => url.includes('status')).length).toBe(1);
    expect(screen.getByLabelText('Review status').disabled).toBe(true);
    finish(Response.json({ ok: false }, { status: 503 }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Save status' }).disabled).toBe(false);
    expect(screen.getByLabelText('Review status').value).toBe('reviewed');
  });
  it('cancels pending report requests on unmount', async () => {
    let signal;
    fetcher.mockImplementation(async (url, init) => url.includes('session') ? ok({}) : new Promise(() => { signal = init.signal; }));
    const view = render(<Dashboard />);
    await waitFor(() => expect(signal).toBeTruthy());
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
  it('clears the password input and prevents duplicate login requests', async () => {
    let finish;
    fetcher.mockImplementation(async url => url.includes('session') ? Response.json({ ok: false }, { status: 401 }) : new Promise(resolve => { finish = resolve; }));
    render(<Dashboard />);
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'owner@example.test' } });
    const password = screen.getByLabelText('Password');
    fireEvent.change(password, { target: { value: 'test-only-password' } });
    const form = password.closest('form');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(password.value).toBe('');
    expect(fetcher.mock.calls.filter(([url]) => url.includes('login')).length).toBe(1);
    finish(Response.json({ ok: false, code: 'login_failed' }, { status: 403 }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Sign in' }).disabled).toBe(false);
  });
});
