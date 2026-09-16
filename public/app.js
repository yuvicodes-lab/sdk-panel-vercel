let ME = null;
let KEYS = { mundo: [], bcore: [] };
let SERVER = null;
let pendingFn = null;

const $ = (id) => document.getElementById(id);
const api = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts });
  let j = {};
  try { j = await r.json(); } catch { j = { error: 'Server error' }; }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- tabs ----------
function switchTab(group, tab) {
  document.querySelectorAll(`[data-g="${group}"]`).forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.remove('active-mundo', 'active-bcore');
    if (on) b.classList.add(tab === 'mundo' ? 'active-mundo' : 'active-bcore');
  });
  ['mundo', 'bcore'].forEach((t) => {
    const el = $(`${group}-${t}`);
    if (el) el.classList.toggle('active', t === tab);
  });
}
function authTab(w) {
  $('authLogin').style.display = w === 'login' ? '' : 'none';
  $('authRegister').style.display = w === 'register' ? '' : 'none';
  $('tabLogin').className = 'dual-tab-btn' + (w === 'login' ? ' active-mundo' : '');
  $('tabRegister').className = 'dual-tab-btn' + (w === 'register' ? ' active-mundo' : '');
  try { history.replaceState({}, '', w === 'register' ? '/register' : '/login'); } catch {}
}

// ---------- clean URLs: /dashboard /keys /generate /server /referral /test /login /register ----------
function routeFromPath() {
  const p = (location.pathname || '/').replace(/\/$/, '') || '/';
  const m = { '/login': 'auth-login', '/register': 'auth-register', '/dashboard': 'dashboard', '/generate': 'generate', '/keys': 'keys', '/server': 'server', '/referral': 'referral', '/test': 'test' };
  return m[p] || null;
}
function pushUrl(page) {
  const path = page === 'auth-login' ? '/login' : page === 'auth-register' ? '/register' : '/' + page;
  try { history.pushState({}, '', path); } catch {}
}

// ---------- nav ----------
function go(page) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $('page-' + page).classList.add('active');
  document.querySelectorAll('.bottom-nav button').forEach((b) => b.classList.remove('active'));
  const n = $('nav-' + page);
  if (n) n.classList.add('active');
  window.scrollTo({ top: 0 });
  if (page === 'dashboard') loadDashboard();
  if (page === 'keys') loadKeys();
  if (page === 'generate') renderGenerate();
  if (page === 'server') loadServer();
  if (page === 'test') renderTest();
  if (page === 'referral') loadReferrals();
  pushUrl(page);
}
window.addEventListener('popstate', () => {
  const r = routeFromPath();
  if (!r) return;
  if (!ME) { showAuth(r === 'auth-register' ? 'register' : 'login'); return; }
  if (r === 'auth-login' || r === 'auth-register') { go('dashboard'); return; }
  if ((r === 'server' || r === 'referral') && ME.role !== 'OWNER') { go('dashboard'); return; }
  go(r);
});

// ---------- auth ----------
async function boot() {
  const first = routeFromPath();
  try {
    const j = await api('/api/auth?op=me');
    ME = j.user;
    enterApp();
    if (first && first !== 'auth-login' && first !== 'auth-register') {
      if ((first === 'server' || first === 'referral') && ME.role !== 'OWNER') return;
      go(first);
    }
  } catch {
    showAuth(first === 'auth-register' ? 'register' : 'login');
    pushUrl(first === 'auth-register' ? 'auth-register' : 'auth-login');
  }
}
function showAuth(tab) {
  authTab(tab === 'register' ? 'register' : 'login');
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $('page-auth').classList.add('active');
  $('topbar').style.display = 'none';
  $('bottomNav').style.display = 'none';
}
function enterApp() {
  $('page-auth').classList.remove('active');
  $('topbar').style.display = '';
  $('bottomNav').style.display = '';
  $('userLine').textContent = ME.username + ' • ' + ME.role;
  // ADMIN: server + referral hide (test sabko)
  $('nav-server').style.display = ME.role === 'OWNER' ? '' : 'none';
  $('nav-referral').style.display = ME.role === 'OWNER' ? '' : 'none';
  $('nav-test').style.display = '';
  go('dashboard');
}
async function doLogin() {
  setMsg('authMsg', 'Login...', 'text-slate-500');
  try {
    const j = await api('/api/auth?op=login', { method: 'POST', body: JSON.stringify({ username: $('liUser').value, password: $('liPass').value }) });
    ME = j.user; enterApp();
  } catch (e) { setMsg('authMsg', e.message, 'text-red-500'); }
}
async function doRegister() {
  setMsg('authMsg', 'Register...', 'text-slate-500');
  try {
    const j = await api('/api/auth?op=register', { method: 'POST', body: JSON.stringify({ username: $('rgUser').value, password: $('rgPass').value, referralCode: $('rgRef').value }) });
    ME = j.user; enterApp();
  } catch (e) { setMsg('authMsg', e.message, 'text-red-500'); }
}
async function logout() { await api('/api/auth?op=logout', { method: 'POST' }); location.reload(); }
function setMsg(id, t, cls) { const e = $(id); e.textContent = t; e.className = 'text-xs font-bold text-center mt-3 ' + cls; }

// ---------- dashboard ----------
async function loadDashboard() {
  const j = await api('/api/panel?op=stats');
  const card = (label, val, sub, grad, icon) => `
    <div class="glass-card p-4">
      <div class="flex items-center justify-between mb-2">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow" style="background:${grad}"><i class="bi ${icon}"></i></div>
        <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 uppercase">${label}</span>
      </div>
      <p class="text-2xl font-black">${val}</p><p class="text-[11px] text-slate-500">${sub}</p>
    </div>`;
  const recent = (list, color) => list.length === 0
    ? `<div class="text-center py-8 text-slate-400 text-xs">No keys yet — Generate se banao</div>`
    : list.map((k) => `<div class="clay-card p-3 flex items-center justify-between gap-2 mb-2">
        <div class="min-w-0"><p class="font-mono text-xs font-bold truncate">${esc(k.sdk_key)}</p>
        <p class="text-[10px] text-slate-400">${k.pkg_limit} Pkg • ${k.app_limit} App • ${k.duration_days} Days</p></div>
        <span class="text-[10px] font-extrabold px-2 py-1 rounded-lg ${k.is_blocked ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}">${k.is_blocked ? 'BLOCKED' : 'ACTIVE'}</span>
      </div>`).join('');
  $('dash-mundo').innerHTML = `<div class="grid grid-cols-2 gap-3 mb-4">
      ${card('Total', j.mundo.total, 'MUNDO Keys', 'linear-gradient(135deg,#8b5cf6,#6366f1)', 'bi-key-fill')}
      ${card('Active', j.mundo.active, 'Active', 'linear-gradient(135deg,#10b981,#14b8a6)', 'bi-check-circle-fill')}
      ${card('Blocked', j.mundo.blocked, 'Blocked', 'linear-gradient(135deg,#ef4444,#ec4899)', 'bi-x-circle-fill')}
      ${card('Bind', j.mundo.pkgs, 'Packages Bound', 'linear-gradient(135deg,#f59e0b,#f97316)', 'bi-box-seam-fill')}
    </div><div class="glass-card p-4"><h3 class="font-bold text-sm mb-3"><i class="bi bi-clock-history text-purple-500"></i> Recent MUNDO</h3>${recent(j.mundo.recent)}</div>`;
  $('dash-bcore').innerHTML = `<div class="grid grid-cols-2 gap-3 mb-4">
      ${card('Total', j.bcore.total, 'BCORE Keys', 'linear-gradient(135deg,#f59e0b,#f97316)', 'bi-lightning-charge-fill')}
      ${card('Active', j.bcore.active, 'Active', 'linear-gradient(135deg,#10b981,#14b8a6)', 'bi-check-circle-fill')}
      ${card('Blocked', j.bcore.blocked, 'Blocked', 'linear-gradient(135deg,#ef4444,#ec4899)', 'bi-x-circle-fill')}
      ${card('Bind', j.bcore.pkgs, 'Packages Bound', 'linear-gradient(135deg,#f59e0b,#f97316)', 'bi-box-seam-fill')}
    </div><div class="glass-card p-4"><h3 class="font-bold text-sm mb-3"><i class="bi bi-clock-history text-amber-500"></i> Recent BCORE</h3>${recent(j.bcore.recent)}</div>`;
}

// ---------- generate ----------
function renderGenerate() {
  const form = (eng, grad, icon) => `
    <div class="glass-card p-5">
      <div class="flex items-center gap-3 mb-5 pb-4 border-b">
        <div class="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow" style="background:${grad}"><i class="bi ${icon} text-lg"></i></div>
        <div><h3 class="font-black">${eng} Engine</h3><p class="text-[11px] text-slate-500">Generate key for ${eng}</p></div>
      </div>
      <label class="block text-[11px] font-extrabold text-slate-500 uppercase mb-1">SDK Key <span class="normal-case font-medium">(empty = auto)</span></label>
      <input id="g-${eng}-key" class="w-full clay-card px-4 py-3 text-sm font-mono mb-4 focus:outline-none" placeholder="Empty = random 16 char" maxlength="100">
      <label class="block text-[11px] font-extrabold text-slate-500 uppercase mb-1">Duration</label>
      <select id="g-${eng}-dur" class="w-full clay-card px-4 py-3 text-sm font-bold mb-4">
        <option value="7">7 Days</option><option value="15">15 Days</option><option value="30" selected>30 Days</option><option value="60">60 Days</option>
      </select>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="block text-[11px] font-extrabold text-slate-500 uppercase mb-1">Pkg Limit</label>
        <input id="g-${eng}-pkg" type="number" min="1" max="10" value="1" class="w-full clay-card px-4 py-3 text-sm font-bold text-center"></div>
        <div><label class="block text-[11px] font-extrabold text-slate-500 uppercase mb-1">App Limit</label>
        <input id="g-${eng}-app" type="number" min="1" max="20" value="1" class="w-full clay-card px-4 py-3 text-sm font-bold text-center"></div>
      </div>
      <div class="rounded-xl p-3 text-[11px] mb-4 bg-slate-50 border"><i class="bi bi-info-circle-fill"></i> <b>Rule:</b> Total apps = Pkg × App</div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <label class="feature-card checked"><input type="checkbox" id="g-${eng}-f1" checked onchange="this.closest('label').classList.toggle('checked',this.checked)"><span class="text-sm font-bold">F1</span></label>
        <label class="feature-card checked"><input type="checkbox" id="g-${eng}-f2" checked onchange="this.closest('label').classList.toggle('checked',this.checked)"><span class="text-sm font-bold">F2</span></label>
      </div>
      <button onclick="genKey('${eng}')" class="btn-premium w-full py-4 rounded-2xl font-extrabold text-sm"><i class="bi bi-magic"></i> GENERATE ${eng} KEY</button>
    </div>`;
  $('gen-mundo').innerHTML = form('MUNDO', 'linear-gradient(135deg,#8b5cf6,#6366f1)', 'bi-cpu');
  $('gen-bcore').innerHTML = form('BCORE', 'linear-gradient(135deg,#f59e0b,#f97316)', 'bi-lightning-charge-fill');
}
async function genKey(eng) {
  try {
    const j = await api('/api/keys?op=generate', { method: 'POST', body: JSON.stringify({
      engine: eng, sdk_key: $('g-' + eng + '-key').value, duration: $('g-' + eng + '-dur').value,
      pkg_limit: $('g-' + eng + '-pkg').value, app_limit: $('g-' + eng + '-app').value,
      feature1: $('g-' + eng + '-f1').checked, feature2: $('g-' + eng + '-f2').checked }) });
    $('genMsg').innerHTML = `<div class="glass-card p-4 mb-4 border-l-4 border-emerald-500"><p class="font-bold text-emerald-700 text-sm">Success! ${eng} key ban gayi</p><p class="font-mono text-xs break-all mt-1">${esc(j.key.sdk_key)}</p></div>`;
    $('g-' + eng + '-key').value = '';
  } catch (e) { $('genMsg').innerHTML = `<div class="glass-card p-4 mb-4 border-l-4 border-red-500"><p class="font-bold text-red-600 text-sm">${esc(e.message)}</p></div>`; }
}

// ---------- keys ----------
async function loadKeys() {
  const j = await api('/api/keys?op=list');
  KEYS = j;
  $('keysSub').textContent = ME.role === 'OWNER' ? 'All users keys' : 'Sirf tumhari keys';
  renderKeys('mundo', j.mundo, 'purple');
  renderKeys('bcore', j.bcore, 'amber');
}
function renderKeys(eng, list, color) {
  const box = $(`keys-${eng}`);
  if (!list.length) { box.innerHTML = `<div class="glass-card p-10 text-center text-slate-400 text-sm">No ${eng.toUpperCase()} keys — Generate se banao</div>`; return; }
  box.innerHTML = list.map((k) => {
    const binds = k.bindings || [];
    const total = k.pkg_limit * k.app_limit;
    const pkgs = new Set(binds.map((b) => b.pkg_name)).size;
    return `<div class="glass-card overflow-hidden mb-3">
      <div onclick="document.getElementById('p-${k.id}').classList.toggle('hidden')" class="p-4 cursor-pointer">
        <div class="flex gap-2 flex-wrap mb-2">
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg ${k.is_blocked ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}">${k.is_blocked ? 'BLOCKED' : 'ACTIVE'}</span>
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500">${k.duration_days}D</span>
          ${k.feature1 ? '<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-500">F1</span>' : ''}
          ${k.feature2 ? '<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-pink-50 text-pink-500">F2</span>' : ''}
          ${ME.role === 'OWNER' ? `<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-800 text-white">@${esc(k.owner)}</span>` : ''}
        </div>
        <p id="kt-${k.id}" class="font-mono text-sm font-bold break-all blur-sm select-none">${esc(k.sdk_key)}</p>
        <div class="grid grid-cols-3 gap-2 my-3">
          <div class="clay-card p-2 text-center text-xs font-black">${pkgs}/${k.pkg_limit}<p class="text-[9px] text-slate-400 font-bold">PKG</p></div>
          <div class="clay-card p-2 text-center text-xs font-black">${binds.length}/${total}<p class="text-[9px] text-slate-400 font-bold">APP</p></div>
          <div class="clay-card p-2 text-center text-xs font-black text-emerald-600">${Math.max(0, total - binds.length)}<p class="text-[9px] text-slate-400 font-bold">FREE</p></div>
        </div>
        <div class="flex flex-wrap gap-2" onclick="event.stopPropagation()">
          <button onclick="toggleBlur(${k.id},this)" class="clay-card px-3 py-1.5 text-xs font-bold"><i class="bi bi-eye"></i> Show</button>
          <button onclick="copyText('${esc(k.sdk_key)}',this)" class="clay-card px-3 py-1.5 text-xs font-bold"><i class="bi bi-clipboard"></i> Copy</button>
          ${k.is_blocked
            ? `<button onclick="ask('Unblock key?',()=>keyAction('unblock_key','${eng.toUpperCase()}',${k.id}))" class="clay-card px-3 py-1.5 text-xs font-bold text-emerald-600">Unblock</button>`
            : `<button onclick="ask('Block key?',()=>keyAction('block_key','${eng.toUpperCase()}',${k.id}))" class="clay-card px-3 py-1.5 text-xs font-bold text-amber-600">Block</button>`}
          <button onclick="ask('Delete key permanently?',()=>keyAction('delete_key','${eng.toUpperCase()}',${k.id}))" class="clay-card px-3 py-1.5 text-xs font-bold text-red-600">Delete</button>
        </div>
      </div>
      <div id="p-${k.id}" class="hidden border-t p-4 bg-white/40">
        <p class="text-[11px] font-extrabold text-slate-500 uppercase mb-2">Bound Apps</p>
        ${binds.length === 0 ? '<p class="text-xs text-slate-400 italic mb-2">No apps bound yet.</p>' : binds.map((b) => `
          <div class="clay-card p-2.5 mb-2">
            <div class="flex gap-2">
              <input id="bp-${b.id}" value="${esc(b.pkg_name)}" class="flex-1 min-w-0 clay-card px-2 py-1.5 text-xs font-mono">
              <input id="ba-${b.id}" value="${esc(b.app_name)}" class="flex-1 min-w-0 clay-card px-2 py-1.5 text-xs font-mono">
              <button onclick="saveBind('${eng.toUpperCase()}',${k.id},${b.id})" class="clay-card px-2.5 text-emerald-600"><i class="bi bi-check2"></i></button>
            </div>
            <div class="flex gap-3 mt-1.5 ml-1">
              <span class="text-[10px] font-extrabold ${b.is_blocked ? 'text-red-500' : 'text-emerald-500'}">${b.is_blocked ? 'BLOCKED' : 'ACTIVE'}</span>
              ${b.is_blocked
                ? `<button onclick="bindAction('unblock_bind','${eng.toUpperCase()}',${k.id},${b.id})" class="text-[10px] text-emerald-600 font-bold">Unblock</button>`
                : `<button onclick="bindAction('block_bind','${eng.toUpperCase()}',${k.id},${b.id})" class="text-[10px] text-amber-600 font-bold">Block</button>`}
              <button onclick="ask('Delete binding?',()=>bindAction('delete_bind','${eng.toUpperCase()}',${k.id},${b.id}))" class="text-[10px] text-red-600 font-bold">Delete</button>
            </div>
          </div>`).join('')}
        ${binds.length < total ? `<div class="clay-card p-2.5 flex gap-2">
          <input id="np-${k.id}" placeholder="pkg_name" class="flex-1 min-w-0 clay-card px-2 py-1.5 text-xs font-mono">
          <input id="na-${k.id}" placeholder="app_name" class="flex-1 min-w-0 clay-card px-2 py-1.5 text-xs font-mono">
          <button onclick="addBind('${eng.toUpperCase()}',${k.id})" class="btn-premium px-3 rounded-xl text-xs font-bold">+ Add</button>
        </div>` : `<p class="text-[11px] text-amber-600 font-bold text-center">App limit reached (${total})</p>`}
      </div>
    </div>`;
  }).join('');
}
function toggleBlur(id, btn) {
  const el = $('kt-' + id);
  el.classList.toggle('blur-sm');
  btn.innerHTML = el.classList.contains('blur-sm') ? '<i class="bi bi-eye"></i> Show' : '<i class="bi bi-eye-slash"></i> Hide';
}
function copyText(t, btn) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => {
    const o = btn.innerHTML; btn.innerHTML = 'Copied ✓'; setTimeout(() => (btn.innerHTML = o), 1200);
  }).catch(() => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); });
}
async function keyAction(action, engine, key_id) {
  await api('/api/keys?op=do', { method: 'POST', body: JSON.stringify({ action, engine, key_id }) });
  loadKeys(); loadDashboard();
}
async function bindAction(action, engine, key_id, bind_id) {
  await api('/api/keys?op=do', { method: 'POST', body: JSON.stringify({ action, engine, key_id, bind_id }) });
  loadKeys();
}
async function saveBind(engine, key_id, bind_id) {
  await api('/api/keys?op=do', { method: 'POST', body: JSON.stringify({ action: 'save_bind', engine, key_id, bind_id, pkg_name: $('bp-' + bind_id).value, app_name: $('ba-' + bind_id).value }) });
  loadKeys();
}
async function addBind(engine, key_id) {
  try {
    await api('/api/keys?op=do', { method: 'POST', body: JSON.stringify({ action: 'add_bind', engine, key_id, pkg_name: $('np-' + key_id).value, app_name: $('na-' + key_id).value }) });
    loadKeys();
  } catch (e) { alert(e.message); }
}

// ---------- key test (dry-run) ----------
function renderTest() {
  const form = (eng, grad, icon) => `
    <div class="glass-card p-5">
      <div class="flex items-center gap-3 mb-4 pb-3 border-b">
        <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow" style="background:${grad}"><i class="bi ${icon}"></i></div>
        <div><h3 class="font-black text-sm">${eng} Key Test</h3><p class="text-[11px] text-slate-500">Dry-run — kuch save nahi hoga</p></div>
      </div>
      <label class="block text-[11px] font-extrabold text-slate-500 uppercase mb-1">SDK Key</label>
      <input id="t-${eng}-key" class="w-full clay-card px-4 py-3 text-sm font-mono mb-3 focus:outline-none" placeholder="Keys page se copy karo">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="block text-[11px] font-extrabold text-slate-500 uppercase mb-1">Pkg Name</label>
        <input id="t-${eng}-pkg" class="w-full clay-card px-3 py-3 text-xs font-mono focus:outline-none" placeholder="com.example.app"></div>
        <div><label class="block text-[11px] font-extrabold text-slate-500 uppercase mb-1">App Name</label>
        <input id="t-${eng}-app" class="w-full clay-card px-3 py-3 text-xs font-mono focus:outline-none" placeholder="MyApp"></div>
      </div>
      <label class="block text-[11px] font-extrabold text-slate-500 uppercase mb-1">Device ID (optional)</label>
      <input id="t-${eng}-dev" class="w-full clay-card px-4 py-3 text-sm font-mono mb-4 focus:outline-none" placeholder="HWID / device id">
      <button onclick="runTest('${eng}')" class="btn-premium w-full py-3.5 rounded-2xl font-extrabold text-sm"><i class="bi bi-flask"></i> TEST ${eng} KEY</button>
    </div>`;
  $('tst-mundo').innerHTML = form('MUNDO', 'linear-gradient(135deg,#8b5cf6,#6366f1)', 'bi-cpu');
  $('tst-bcore').innerHTML = form('BCORE', 'linear-gradient(135deg,#f59e0b,#f97316)', 'bi-lightning-charge-fill');
}
async function runTest(eng) {
  $('testResult').innerHTML = '<div class="glass-card p-4 text-xs text-slate-500 text-center">Testing...</div>';
  try {
    const r = await api('/api/keys?op=test', { method: 'POST', body: JSON.stringify({
      engine: eng, sdk_key: $('t-' + eng + '-key').value, pkg_name: $('t-' + eng + '-pkg').value,
      app_name: $('t-' + eng + '-app').value, device_id: $('t-' + eng + '-dev').value }) });
    $('testResult').innerHTML = `
      <div class="glass-card p-4 mb-3 ${r.ok ? 'border-l-4 border-emerald-500' : 'border-l-4 border-red-500'}">
        <p class="font-black text-sm ${r.ok ? 'text-emerald-700' : 'text-red-600'}">${r.ok ? 'KEY WORKING HAI' : 'FAILED: ' + esc(r.code)}</p>
        <p class="text-xs text-slate-500 mt-0.5">${esc(r.message)} (${esc(r.engine)})</p>
      </div>
      <div class="glass-card p-4"><p class="text-[11px] font-extrabold text-slate-500 uppercase mb-2">Step-by-step</p>
      ${r.steps.map((s) => `<div class="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
        <span class="${s.pass ? 'text-emerald-500' : 'text-red-500'} font-black">${s.pass ? '✓' : '✗'}</span>
        <div><p class="text-xs font-bold">${esc(s.label)}</p><p class="text-[11px] text-slate-500">${esc(s.info || '')}</p></div>
      </div>`).join('')}
      ${r.data ? `<div class="bg-slate-900 rounded-xl p-3 mt-2 overflow-x-auto"><pre class="text-[11px] font-mono text-emerald-300">${esc(JSON.stringify(r.data, null, 2))}</pre></div>` : ''}
      </div>`;
  } catch (e) { $('testResult').innerHTML = `<div class="glass-card p-4 text-xs font-bold text-red-600">${esc(e.message)}</div>`; }
}

// ---------- server ----------
async function loadServer() {
  if (ME.role !== 'OWNER') { $('srv-mundo').innerHTML = '<div class="glass-card p-6 text-center text-sm">Only OWNER</div>'; return; }
  const j = await api('/api/panel?op=server');
  SERVER = j;

  // live status strip + storage warning
  const anyMaint = j.status.MUNDO.maintenance_mode === 1 || j.status.BCORE.maintenance_mode === 1;
  $('srvStrip').innerHTML = `
    <div class="glass-card p-3"><div class="flex items-center justify-between mb-1"><i class="bi bi-circle-fill ${anyMaint ? 'text-amber-500' : 'text-emerald-500'} text-[10px] animate-pulse"></i><span class="text-[9px] font-extrabold ${anyMaint ? 'text-amber-500 bg-amber-50' : 'text-emerald-500 bg-emerald-50'} px-2 py-0.5 rounded-lg uppercase">${anyMaint ? 'Partial' : 'Online'}</span></div><p class="text-xs font-black">Server</p><p class="text-[10px] text-slate-500">${anyMaint ? 'Maintenance ON' : 'All systems go'}</p></div>
    <div class="glass-card p-3"><div class="flex items-center justify-between mb-1"><i class="bi bi-activity text-teal-500"></i><span class="text-[9px] font-extrabold text-teal-500 bg-teal-50 px-2 py-0.5 rounded-lg uppercase">${j.meta.health}</span></div><p class="text-xs font-black">API Health</p><p class="text-[10px] text-slate-500">&lt;120ms response</p></div>
    <div class="glass-card p-3"><div class="flex items-center justify-between mb-1"><i class="bi bi-speedometer2 text-indigo-500"></i><span class="text-[9px] font-extrabold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg uppercase">${j.meta.load}</span></div><p class="text-xs font-black">Load</p><p class="text-[10px] text-slate-500">CPU / Memory</p></div>
    <div class="glass-card p-3"><div class="flex items-center justify-between mb-1"><i class="bi bi-hdd text-emerald-500"></i><span class="text-[9px] font-extrabold ${j.meta.persistent ? 'text-emerald-500 bg-emerald-50' : 'text-amber-500 bg-amber-50'} px-2 py-0.5 rounded-lg uppercase">${j.meta.persistent ? 'Redis' : 'File'}</span></div><p class="text-xs font-black">Storage</p><p class="text-[10px] text-slate-500">${j.meta.persistent ? 'Persistent ✓' : 'Temporary!'}</p></div>`;
  $('srvMsg').innerHTML = (!j.meta.persistent && location.hostname.indexOf('localhost') === -1)
    ? `<div class="glass-card p-3 mb-1 border-l-4 border-amber-500"><p class="text-xs font-bold text-amber-700"><i class="bi bi-exclamation-triangle-fill"></i> Upstash Redis nahi laga!</p><p class="text-[11px] text-slate-600 mt-0.5">Vercel par keys permanent rakhne ke liye Upstash env variables lagao — README me steps hain. Nahi to generate ki keys gayab dikhengi.</p></div>` : '';
  const sec = (eng, grad, icon, enc) => {
    const st = j.status[eng];
    return `<div class="glass-card p-5 mb-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow" style="background:${grad}"><i class="bi ${icon}"></i></div>
          <div><h3 class="font-black text-sm">${eng} Server</h3><p class="text-[11px] text-slate-500">${st.maintenance_mode ? 'OFFLINE — maintenance' : 'ONLINE — accepting requests'}</p></div>
        </div>
        <span class="text-[10px] font-extrabold px-2 py-1 rounded-lg ${st.maintenance_mode ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}">${st.maintenance_mode ? 'OFFLINE' : 'ONLINE'}</span>
      </div>
      <label class="block text-[11px] font-extrabold text-slate-500 uppercase mb-1">POST Endpoint URL</label>
      <div class="clay-card p-3 flex items-center gap-2 mb-3">
        <code class="flex-1 text-xs font-mono font-bold break-all">${esc(j.endpoints[eng.toLowerCase()])}</code>
        <button onclick="copyText('${esc(j.endpoints[eng.toLowerCase()])}',this)" class="clay-card px-2 py-1"><i class="bi bi-clipboard"></i></button>
      </div>
      <div class="grid grid-cols-4 gap-2 mb-3 text-center">
        <div class="clay-card p-2"><p class="text-[9px] text-slate-400 font-bold">METHOD</p><p class="text-xs font-black">POST</p></div>
        <div class="clay-card p-2"><p class="text-[9px] text-slate-400 font-bold">FORMAT</p><p class="text-xs font-black">ENC</p></div>
        <div class="clay-card p-2"><p class="text-[9px] text-slate-400 font-bold">CRYPT</p><p class="text-xs font-black">${enc}</p></div>
        <div class="clay-card p-2"><p class="text-[9px] text-slate-400 font-bold">UPTIME</p><p class="text-xs font-black">${j.meta.uptime}</p></div>
      </div>
      <label class="flex items-center justify-between clay-card p-3 mb-3 cursor-pointer">
        <span class="text-xs font-black">Maintenance Mode</span>
        <input type="checkbox" id="m-${eng}" ${st.maintenance_mode ? 'checked' : ''} onchange="document.getElementById('mw-${eng}').style.display=this.checked?'':'none'" class="w-5 h-5 accent-red-500">
      </label>
      <div id="mw-${eng}" style="display:${st.maintenance_mode ? '' : 'none'}">
        <input id="mm-${eng}" value="${esc(st.maintenance_message)}" placeholder="Maintenance message..." class="w-full clay-card px-4 py-3 text-sm mb-3">
      </div>
      <button onclick="saveServer('${eng}')" class="btn-premium w-full py-3 rounded-2xl font-extrabold text-xs">SAVE ${eng} STATUS</button>
    </div>`;
  };
  $('srv-mundo').innerHTML = sec('MUNDO', 'linear-gradient(135deg,#8b5cf6,#6366f1)', 'bi-cpu', 'AES-ECB') + encCard('MUNDO') + sampleCard('MUNDO');
  $('srv-bcore').innerHTML = sec('BCORE', 'linear-gradient(135deg,#f59e0b,#f97316)', 'bi-lightning-charge-fill', 'RC4') + encCard('BCORE') + sampleCard('BCORE');

  const act = j.activity || [];
  $('srvActivity').innerHTML = `<div class="glass-card p-4"><h3 class="font-bold text-sm mb-3"><i class="bi bi-lightning-charge text-amber-500"></i> Live Verify Activity <span class="text-[9px] text-slate-400 font-bold">last ${act.length}</span></h3>${
    act.length === 0 ? '<p class="text-[11px] text-slate-400 italic">Abhi koi app verify hit nahi aayi — app se API hit karo, yaha dikhega.</p>' :
    act.map((a) => `<div class="clay-card p-2.5 mb-2 flex items-center gap-2">
      <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded ${a.engine === 'MUNDO' ? 'bg-purple-50 text-purple-600' : 'bg-amber-50 text-amber-600'}">${a.engine}</span>
      <div class="flex-1 min-w-0"><p class="font-mono text-[11px] font-bold truncate">${esc(a.key)} <span class="text-slate-400 font-normal">${esc(a.pkg)} / ${esc(a.app)}</span></p>
      <p class="text-[9px] text-slate-400">${esc(new Date(a.t).toLocaleString())}</p></div>
      <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded ${a.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}">${a.ok ? 'OK' : esc(a.code)}</span>
    </div>`).join('')}</div>`;
}
function encCard(eng) {
  const m = eng === 'MUNDO';
  return `<div class="glass-card p-4 mb-4"><h3 class="font-bold text-sm mb-2"><i class="bi bi-shield-lock-fill ${m ? 'text-purple-500' : 'text-amber-500'}"></i> Encryption — ${eng}</h3>
  <div class="text-[11px] ${m ? 'text-purple-700 bg-purple-50/70 border-purple-100' : 'text-amber-700 bg-amber-50/70 border-amber-100'} border rounded-xl p-3">
  ${m ? '<p><b>AES-128-ECB + Base64</b></p><p class="mt-1">Salt: <code>https://mundo.cp.cheat/v2/api/verify</code></p><p class="mt-1">Payload: <code>S1|S2|S3_A|S3_B</code> (pipe-separated)</p>'
      : '<p><b>RC4 + Base64</b></p><p class="mt-1">Secret: <code>YuviMatrix_Secure_2026</code></p><p class="mt-1">Payload: <code>sdk_key + pkg_name + app_name + device_id</code></p>'}
  </div></div>`;
}
function sampleCard(eng) {
  const ok = eng === 'MUNDO'
    ? '{\n  "status": true,\n  "code": "success",\n  "message": "SDK key validated successfully"\n}'
    : '{\n  "status": "success",\n  "code": "VALID",\n  "data": { "features1": true, "features2": false }\n}';
  return `<div class="glass-card p-4 mb-4"><h3 class="font-bold text-sm mb-2"><i class="bi bi-check-circle-fill text-emerald-500"></i> Success sample <span class="text-[9px] font-extrabold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-lg">200 OK</span></h3>
  <div class="bg-slate-900 rounded-xl p-3 overflow-x-auto"><pre class="text-[11px] font-mono text-emerald-300">${esc(ok)}</pre></div>
  <div class="mt-2 text-[11px] text-slate-500">Error codes: <code>SERVER_MAINTENANCE(503) • INVALID_KEY(403) • EXPIRED_KEY(403) • PKG_LIMIT_REACHED(403) • APP_LIMIT_REACHED(403)</code> — response hamesha encrypted aata hai.</div></div>`;
}
async function saveServer(eng) {
  try {
    await api('/api/panel?op=server', { method: 'POST', body: JSON.stringify({ engine: eng, maintenance_mode: $('m-' + eng).checked ? 1 : 0, maintenance_message: $('mm-' + eng).value }) });
    $('srvMsg').innerHTML = `<div class="glass-card p-3 mb-3 border-l-4 border-emerald-500 text-xs font-bold text-emerald-700">${eng} status saved ✓</div>`;
    loadServer();
  } catch (e) { alert(e.message); }
}

// ---------- referrals ----------
async function createReferral() {
  try {
    const j = await api('/api/referrals?op=create', { method: 'POST', body: JSON.stringify({ role: $('refRole').value, durationDays: Number($('refDur').value) }) });
    $('refNew').innerHTML = `<div class="clay-card p-3 flex items-center gap-2 mt-2"><code class="flex-1 font-mono font-black text-emerald-600">${j.referral.code}</code><button onclick="copyText('${j.referral.code}',this)" class="clay-card px-3 py-1.5 text-xs font-bold">Copy</button></div><p class="text-[11px] text-slate-500 mt-1">Role: <b>${j.referral.role}</b> • Valid ${j.referral.durationDays} din • Isko register me use karo</p>`;
    loadReferrals();
  } catch (e) { alert(e.message); }
}
async function loadReferrals() {
  if (ME.role !== 'OWNER') return;
  const j = await api('/api/referrals?op=list');
  $('refList').innerHTML = j.referrals.length === 0 ? '<div class="glass-card p-6 text-center text-xs text-slate-400">Koi referral nahi — upar se banao</div>' :
    j.referrals.map((r) => `<div class="glass-card p-4 flex items-center gap-3">
      <div class="flex-1 min-w-0"><p class="font-mono font-black text-sm">${r.code}</p>
      <p class="text-[10px] text-slate-500">${r.role} • ${r.durationDays}d • ${r.used ? 'USED' : r.expired ? 'EXPIRED' : 'ACTIVE'}</p></div>
      <span class="text-[10px] font-extrabold px-2 py-1 rounded-lg ${r.used ? 'bg-slate-100 text-slate-400' : r.expired ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}">${r.used ? 'USED' : r.expired ? 'EXPIRED' : 'ACTIVE'}</span>
      <button onclick="copyText('${r.code}',this)" class="clay-card px-2.5 py-1.5 text-xs"><i class="bi bi-clipboard"></i></button>
      <button onclick="ask('Delete referral ${r.code}?',()=>delRef('${r.code}'))" class="clay-card px-2.5 py-1.5 text-xs text-red-500"><i class="bi bi-trash"></i></button>
    </div>`).join('');
}
async function delRef(code) {
  await api('/api/referrals?op=delete', { method: 'POST', body: JSON.stringify({ code }) });
  loadReferrals();
}

// ---------- modal ----------
function ask(msg, fn) { $('modalMsg').textContent = msg; pendingFn = fn; $('modal').style.display = 'flex'; }
function closeModal() { $('modal').style.display = 'none'; pendingFn = null; }
$('modalOk').onclick = async () => { const f = pendingFn; closeModal(); if (f) { try { await f(); } catch (e) { alert(e.message); } } };

boot();
