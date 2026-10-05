const $ = id => document.getElementById(id);
let page = 0;
let loadVersion = 0;
let filterSnapshot = {};
const statuses = ['new', 'reviewed', 'added', 'rejected'];
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function signInScreen() {
  loadVersion++;
  $('rows').replaceChildren();
  $('dashboard').hidden = true; $('logout').hidden = true; $('login').hidden = false;
}
function signedIn() { $('login').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false; }
async function api(action, { method = 'GET', body, params = {} } = {}) {
  const query = new URLSearchParams({ action, ...params });
  const response = await fetch('/api/admin?' + query, {
    method, credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(20000),
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (response.status === 401) { signInScreen(); message('Your session expired. Sign in again.'); throw new Error('Your session expired. Sign in again.'); }
  if (!response.ok) {
    if (data.code === 'not_configured') throw new Error('Owner sign-in has not been configured yet.');
    if (data.code === 'login_failed') throw new Error('Sign-in failed. Check your owner account details or try again later.');
    throw new Error('Could not complete the request. Try again.');
  }
  return data;
}
function cell(text, className) { const td = document.createElement('td'); td.textContent = text; if (className) td.className = className; return td; }
function render(reports) {
  const fragment = document.createDocumentFragment();
  for (const report of reports) {
    const tr = document.createElement('tr');
    const term = cell(report.term, 'term');
    const versions = document.createElement('span'); versions.className = 'versions';
    versions.textContent = 'Words ' + report.dictionary_version + ' · Phrases ' + report.phrase_dictionary_version + ' · App ' + report.last_app_version;
    term.append(versions); tr.append(term);
    const type = cell(''); const badge = document.createElement('span'); badge.className = 'type';
    badge.textContent = report.category === 'missing' ? 'Missing translation' : 'Translation issue'; type.append(badge); tr.append(type);
    tr.append(cell(String(report.report_count), 'count'));
    const date = new Date(report.last_reported_at);
    tr.append(cell(Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()));
    const statusCell = cell(''); const select = document.createElement('select'); select.setAttribute('aria-label', 'Review status for ' + report.term);
    for (const status of statuses) { const option = document.createElement('option'); option.value = status; option.textContent = status[0].toUpperCase() + status.slice(1); select.append(option); }
    select.value = report.status;
    select.addEventListener('change', async () => {
      const original = report.status;
      select.disabled = true;
      try {
        await api('status', { method: 'POST', body: { id: String(report.id), status: select.value } });
        report.status = select.value;
        message('Review status saved.');
        if (filterSnapshot.status && filterSnapshot.status !== select.value) await loadReports();
      } catch (error) { select.value = original; message(error.message, true); }
      finally { select.disabled = false; }
    });
    statusCell.append(select); tr.append(statusCell); fragment.append(tr);
  }
  $('rows').replaceChildren(fragment); $('empty').hidden = reports.length !== 0;
}
async function loadReports() {
  const version = ++loadVersion;
  $('refresh').disabled = true; $('previous').disabled = true; $('next').disabled = true;
  filterSnapshot = { status: $('status').value, category: $('category').value, q: $('query').value.trim() };
  message('Loading reports…');
  try {
    const data = await api('reports', { method: 'POST', body: { ...filterSnapshot, page: String(page) } });
    if (version !== loadVersion) return;
    if (page > 0 && !data.reports.length) { page = Math.max(0, Math.ceil(data.total / 50) - 1); return await loadReports(); }
    render(data.reports);
    $('summary').textContent = data.total + ' matching report group' + (data.total === 1 ? '' : 's');
    $('page').textContent = 'Page ' + (page + 1);
    $('previous').disabled = page === 0; $('next').disabled = (page + 1) * 50 >= data.total;
    message('');
  } catch (error) { if (version === loadVersion) { $('rows').replaceChildren(); $('summary').textContent = 'Reports unavailable'; message(error.message, true); } }
  finally { if (version === loadVersion) $('refresh').disabled = false; }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); if ($('sign-in').disabled) return; $('sign-in').disabled = true; message('Signing in…');
  const password = $('password').value; $('password').value = '';
  try { await api('login', { method: 'POST', body: { email: $('email').value.trim(), password } }); signedIn(); page = 0; await loadReports(); }
  catch (error) { message(error.message, true); }
  finally { $('sign-in').disabled = false; }
});
$('logout').addEventListener('click', async () => {
  $('logout').disabled = true;
  try { await api('logout', { method: 'POST', body: {} }); signInScreen(); message('Signed out.'); }
  catch (error) { message(error.message, true); }
  finally { $('logout').disabled = false; }
});
$('filters').addEventListener('submit', event => { event.preventDefault(); page = 0; loadReports(); });
$('previous').addEventListener('click', () => { if (page > 0) { page--; loadReports(); } });
$('next').addEventListener('click', () => { page++; loadReports(); });
(async () => {
  try { await api('session'); signedIn(); await loadReports(); }
  catch (error) { signInScreen(); message(error.message === 'Your session expired. Sign in again.' ? '' : error.message, error.message !== 'Your session expired. Sign in again.'); }
})();
