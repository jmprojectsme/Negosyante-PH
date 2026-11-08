/* Negosyante PH: screens, scenes and mini-games. */
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// in-page confirmation (the artifact frame blocks window.confirm)
function ask(msg, fn) { scene({ em: '\u2753', title: 'Sigurado ka?', body: esc(msg), choices: [{ label: 'Oo, ituloy', cls: 'primary', fn: () => { const before = UI.scene; fn(); if (UI.scene === before) closeS(); } }, { label: 'Huwag na', fn: closeS }] }); }
function askT(msg, fn) { $('modal').classList.remove('hide'); scene({ em: '\u2753', title: 'Sigurado ka?', body: esc(msg), choices: [{ label: 'Oo', cls: 'primary', fn: () => { $('modal').classList.add('hide'); fn(); } }, { label: 'Huwag na', fn: () => $('modal').classList.add('hide') }] }); }
function wipeSave() { if (S && S.slot) deleteSlot(S.slot); }
const UI = { tab: 'home', sub: { ops: null, people: 'staff', books: 'rep', company: 'board' }, period: 'month', auto: false, timer: null, scene: null };
let toastT = 0;
function toast(msg) {
  if (/^(Kulang|Hindi|Max|Puno|Save failed)/.test(msg)) sfx('bad'); const t = $('toast'); t.textContent = msg; t.classList.remove('hide'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hide'), 2600); }
// daily rate and its monthly equivalent (6-day week: daily x 313 / 12, the DOLE formula)
const perMonth = (d) => Math.round(d * 313 / 12);
const payLabel = (d) => `${peso(d)}/day (~${pesoK(perMonth(d))}/mo)`;
const pct = (x) => (x * 100).toFixed(1) + '%';
const stars = (v) => '★'.repeat(clamp(Math.round((v - 0.45) * 5), 1, 5)) + '☆'.repeat(5 - clamp(Math.round((v - 0.45) * 5), 1, 5));

// ---------- tiny DOM helpers ----------
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function card(title, right) { const c = el(`<section class="card"><h3><span>${title}</span>${right ? `<small>${right}</small>` : ''}</h3></section>`); return c; }
function row(left, right, opts) {
  opts = opts || {};
  const r = el(`<div class="row${opts.tap ? ' tap' : ''}">${opts.em ? `<div class="em">${opts.em}</div>` : ''}<div class="tx">${left}</div></div>`);
  if (right instanceof Node) r.appendChild(right); else if (right != null) r.appendChild(el(`<div class="num">${right}</div>`));
  if (opts.tap) r.addEventListener('click', opts.tap);
  return r;
}
function btn(label, fn, cls, dis) { const b = el(`<button type="button" class="sm ${cls || ''}">${label}</button>`); b.disabled = !!dis; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; }
function btns(...bs) { const d = el('<div class="row" style="gap:6px;justify-content:flex-end;flex:none"></div>'); bs.forEach((b) => b && d.appendChild(b)); return d; }
function seg(items, cur, fn) { const s = el('<div class="seg"></div>'); for (const [k, label] of items) { const b = el(`<button type="button" class="${k === cur ? 'on' : ''}">${label}</button>`); b.addEventListener('click', () => fn(k)); s.appendChild(b); } return s; }
function stepper(val, dec, inc) { const s = el(`<div class="stepper"></div>`); s.append(btn('−', dec), el(`<b>${val}</b>`), btn('+', inc)); return s; }
function meter(label, v, max, cls) { const p = clamp(v / max, 0, 1) * 100; return el(`<div class="meter"><small><span>${label}</span><span>${Math.round(v)}${max === 100 ? '' : '/' + Math.round(max)}</span></small><div class="bar ${cls || (p < 35 ? 'r' : p < 60 ? 'w' : '')}"><i style="width:${p}%"></i></div></div>`); }

// ---------- title & setup ----------
// ---------- settings (for the whole app, not per company) ----------
const SET = (() => { try { return Object.assign({ sound: true, speed: 1100 }, JSON.parse(lsGet('negosyante:settings') || '{}')); } catch (e) { return { sound: true, speed: 1100 }; } })();
function saveSettings() { lsSet('negosyante:settings', JSON.stringify(SET)); }
const closeT = () => { $('modal').classList.add('hide'); UI.scene = null; };
// ---------- title / main menu ----------
function showTitle() {
  UI.auto = false; clearTimeout(UI.timer); $('btnAuto').classList.remove('on');
  $('modal').classList.add('hide'); UI.scene = null;
  $('app').classList.add('hide'); $('setup').classList.add('hide'); $('title').classList.remove('hide');
  migrateSaves();
  const L = slotList(), s = load(), last = s && L.find((x) => x.id === s.slot);
  const C = $('btnContinue');
  C.classList.toggle('hide', !s);
  if (s) C.innerHTML = `▶ Ituloy: ${esc(s.company)}<small>${INDUSTRIES[s.ind].em} ${esc(INDUSTRIES[s.ind].name)} · ${fshortY(s.day)} · Stage ${s.stage || 1}${last ? ' · ' + pesoK(last.cash) : ''}${s.over ? ' · sarado na' : ''}</small>`;
  $('btnSlots').classList.toggle('hide', !L.length);
  $('btnSlots').innerHTML = `\u{1F4BC} Mga negosyo ko (${L.length}/${MAX_SLOTS})`;
  $('titleVer').textContent = `v${typeof APP_VERSION === 'string' ? APP_VERSION : '?'}`;
}
const fshortY = (d) => `${MONTHS[monthOf(d) - 1]} ${dom(d)}, ${yearOf(d)}`;
function openSlot(id) { const s = load(id); if (!s) return toast('Hindi mabuksan ang save'); S = s; closeT(); lsSet(SLOT_LAST, id); sfx('open'); startApp(); }
function slotsScene() {
  const L = slotList(), nodes = [];
  if (!L.length) nodes.push(el('<div class="empty">Wala pang saved na negosyo.</div>'));
  for (const x of L) {
    const I = INDUSTRIES[x.ind] || { em: '?', name: x.ind };
    nodes.push(row(`<span class="t">${esc(x.company)}</span><small>${I.em} ${esc(I.name)} · Stage ${x.stage} · ${fshortY(x.day)} · cash ${pesoK(x.cash)}${x.over ? ' · <span class="neg">sarado</span>' : ''}</small>`,
      btns(btn('Open', () => openSlot(x.id), 'primary'), btn('\u{1F5D1}', () => scene({ em: '\u{1F5D1}', title: `Delete ${esc(x.company)}?`, body: 'This business and all its books will be erased from this phone. Export it first if you want a backup.', choices: [{ label: 'Delete', cls: 'danger', fn: () => { deleteSlot(x.id); sfx('tap'); slotsScene(); showTitle(); } }, { label: 'Cancel', fn: slotsScene }] }), 'danger'))));
  }
  scene({ em: '\u{1F4BC}', title: 'Mga negosyo ko', sub: `${L.length} of ${MAX_SLOTS} save slots used`, nodes, choices: [{ label: 'Close', fn: closeT }] });
}
function newBusiness() {
  if (slotList().length >= MAX_SLOTS) { toast(`Max ${MAX_SLOTS} businesses. Delete one first.`); return slotsScene(); }
  closeT(); setup();
}
function settingsScene(inGame) {
  const back = inGame ? () => menuScene() : closeT;
  const tog = (on) => (on ? 'ON' : 'OFF');
  scene({ em: '⚙️', title: 'Settings', sub: `Negosyante PH v${typeof APP_VERSION === 'string' ? APP_VERSION : '?'}`, nodes: [
    row('<span class="t">Sound effects</span><small>Cash register, notifications, level up</small>', btn(tog(SET.sound), () => { SET.sound = !SET.sound; saveSettings(); sfx('tap'); settingsScene(inGame); }, SET.sound ? 'primary' : '')),
    row('<span class="t">Auto-play speed</span><small>How fast days pass on Auto</small>', btns(...[['Mabagal', 1800], ['Normal', 1100], ['Mabilis', 500]].map(([l, v]) => btn(l, () => { SET.speed = v; saveSettings(); settingsScene(inGame); }, SET.speed === v ? 'primary' : '')))),
    row('<span class="t">Backup / transfer</span><small>Move a business to another phone or browser</small>', btns(inGame ? btn('Export', () => exportSave()) : null, btn('Import', () => importSave(inGame))))
  ], choices: [{ label: inGame ? '← Back' : 'Close', cls: 'primary', fn: back }] });
}
function menuScene() {
  UI.auto = false; clearTimeout(UI.timer); $('btnAuto').classList.remove('on');
  scene({ em: '⏸️', title: 'Naka-pause', sub: `${esc(S.company)} · ${fdate(S.day)}`, choices: [
    { label: '▶ Ituloy ang laro', cls: 'primary', fn: closeS },
    { label: '\u{1F4BE} Save', sub: 'The game also saves every day by itself', fn: () => { toast(save() ? 'Saved' : 'Save failed: storage full'); } },
    { label: '❓ Paano laruin', fn: howTo },
    { label: '⚙️ Settings', fn: () => settingsScene(true) },
    { label: '\u{1F3E0} Main menu', sub: 'Save and switch business', fn: () => { save(); showTitle(); } }] });
}
$('btnContinue').addEventListener('click', () => { const s = load(); if (s) { S = s; sfx('open'); startApp(); } });
$('btnNew').addEventListener('click', () => newBusiness());
$('btnSlots').addEventListener('click', () => slotsScene());
$('btnSettings').addEventListener('click', () => settingsScene(false));
function setup() {
  const st = { step: 0, ind: 'trading', fund: 'angel', company: '', owner: '' };
  $('title').classList.add('hide'); $('setup').classList.remove('hide');
  const draw = () => {
    const P = $('setup'); P.textContent = '';
    if (st.step === 0) {
      P.appendChild(el('<div><h2>Anong negosyo?</h2><p class="mute">Pick an industry. Each plays differently.</p></div>'));
      for (const k in INDUSTRIES) {
        const I = INDUSTRIES[k];
        const b = el(`<button type="button" class="ind ${st.ind === k ? 'on' : ''}"><div class="em">${I.em}</div><div><b>${I.name}</b><small>${I.tag}</small><small style="margin-top:4px">${I.desc}</small><small style="margin-top:4px"><b style="display:inline">Your capital: ${peso(I.capital)}</b></small></div></button>`);
        b.addEventListener('click', () => { st.ind = k; draw(); }); P.appendChild(b);
      }
      P.appendChild(btnBig('Next', () => { st.step = 1; draw(); }));
    } else if (st.step === 1) {
      const I = INDUSTRIES[st.ind];
      P.appendChild(el('<div><h2>Saan galing ang puhunan?</h2><p class="mute">Your own money, a bank loan, or an investor who sits on your board.</p></div>'));
      for (const F of FUNDING) {
        const amt = F.none ? (F.loan ? I.invest[0] : 0) : I.invest[F.mult];
        const em = { self: '\u{1F437}', loan: '\u{1F3E6}', angel: '\u{1F474}', group: '\u{1F454}' }[F.id];
        const line = F.id === 'self' ? `Start with ${peso(I.capital)} \u00b7 100% yours \u00b7 no board` : F.loan ? `Borrow ${peso(amt)} \u00b7 ${peso(Math.round(amt * (F.loan / 12) / (1 - Math.pow(1 + F.loan / 12, -36))))}/month for 3 years \u00b7 100% yours` : `Invests ${peso(amt)} for ${Math.round(amt / (amt + I.capital) * 100)}% of the company \u00b7 ${F.strict > 1 ? 'strict' : 'patient'} board, quarterly meetings`;
        const b = el(`<button type="button" class="ind ${st.fund === F.id ? 'on' : ''}"><div class="em">${em}</div><div><b>${F.name}</b><small>${F.desc}</small><small style="margin-top:4px"><b style="display:inline">${line}</b></small></div></button>`);
        b.addEventListener('click', () => { st.fund = F.id; draw(); }); P.appendChild(b);
      }
      P.appendChild(btnBig('Next', () => { st.step = 2; draw(); }));
      P.appendChild(btnBig('Back', () => { st.step = 0; draw(); }, 'ghost'));
    } else {
      const I = INDUSTRIES[st.ind];
      P.appendChild(el('<div><h2>Pangalan</h2><p class="mute">Register your corporation with the SEC.</p></div>'));
      const ph = { trading: 'JM Trading Corp.', food: 'Kusina ni Juan Inc.', bakery: 'Pandayan Bakeshop Corp.', minimart: 'Suki Mart Inc.', laundry: 'Linis Laundry Corp.' }[st.ind];
      const c = el(`<label><small>Company name</small><input id="inCo" maxlength="32" autocomplete="off" placeholder="${ph}"></label>`);
      const o = el('<label><small>Your name (President)</small><input id="inOwner" maxlength="20" autocomplete="off" placeholder="Jaymar"></label>');
      P.append(c, o);
      const prev = el('<div class="note g"></div>');
      const inCo = c.querySelector('input'), inOw = o.querySelector('input');
      inCo.value = st.company; inOw.value = st.owner;
      const show = () => { prev.textContent = `\u{1F3E2} ${(st.company.trim() || ph)}\n\u{1F464} President ${(st.owner.trim() || '(type your name)')}`; };
      for (const ev of ['input', 'change', 'keyup', 'compositionend']) { inCo.addEventListener(ev, () => { st.company = inCo.value; show(); }); inOw.addEventListener(ev, () => { st.owner = inOw.value; show(); }); }
      show(); P.appendChild(prev);
      P.appendChild(el(`<div class="note b">Start-up costs: SEC/BIR/LGU registration \u20B118,000, ${I.locations[0].deposit} months deposit for ${esc(I.locations[0].name)}, first month's rent, and starting ${I.mode === 'stock' ? 'inventory' : 'equipment'}. You start on Monday, January 4, 2027.</div>`));
      const err = el('<div class="note r hide"></div>');
      P.appendChild(btnBig('Buksan ang negosyo! \u{1F389}', () => {
        st.company = inCo.value || st.company; st.owner = inOw.value || st.owner;
        if (!st.owner.trim()) { err.textContent = 'Pakilagay ang pangalan mo (President).'; err.classList.remove('hide'); inOw.focus(); return; }
        try {
          inCo.blur(); inOw.blur();
          newGame({ company: (st.company.trim() || ph).slice(0, 32), owner: st.owner.trim().slice(0, 20), ind: st.ind, fund: st.fund });
          window.scrollTo(0, 0); startApp(); tutorial();
        } catch (e) { err.textContent = 'May error: ' + e.message; err.classList.remove('hide'); }
      }));
      P.appendChild(err);
      P.appendChild(btnBig('Back', () => { st.step = 1; draw(); }, 'ghost'));
    }
  };
  draw();
}
function btnBig(label, fn, cls) { const b = el(`<button type="button" class="big ${cls || 'primary'}">${label}</button>`); b.addEventListener('click', fn); return b; }
function startApp() {
  $('title').classList.add('hide'); $('setup').classList.add('hide'); $('app').classList.remove('hide');
  if (S.personal == null) S.personal = 150000;
  S.stage = S.stage || 1; S.contracts = S.contracts || []; S.offers = S.offers || []; S.openings = S.openings || []; S.unlocked = S.unlocked || [];
  applyUnlocks();
  UI.sub.ops = IND().channel === 'b2b' ? 'stock' : 'growth';
  render(); pump();
}
function tutorial() {
  const I = IND();
  scene({ em: I.em, title: `Welcome, President ${esc(S.owner)}!`, sub: esc(S.company), body:
    `You have ${peso(cash())} in the bank. Right now it's just you${I.startAssets.length ? ' and your equipment' : ''}.\n\n` +
    (I.channel === 'b2b' ? '• Buy stock in Ops → Stock (it arrives tomorrow).\n• Win new store clients in Ops → Clients.\n• Hire a driver and a salesman when orders pile up.\n' :
      '• Set your prices and check capacity in Ops.\n• Hire your first staff in Tao → Hiring: you can only do so much alone.\n') +
    '\nFollow the \u{1F3AF} Mga misyon card on Home: each mission tells you exactly where to tap. The \u{1F4A1} card tells you what needs attention today. Tap ? at the top anytime for the full guide.',
    choices: [{ label: 'Simulan na!', cls: 'primary', fn: closeS }, { label: 'Paano laruin? (full guide)', fn: howTo }] });
}

// ---------- main render ----------
document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => { UI.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
$('btnHelp').addEventListener('click', () => howTo());
$('btnMenu').addEventListener('click', () => menuScene());
$('coStage').addEventListener('click', () => stagesScene());
$('btnNext').addEventListener('click', () => { if (S.over) return gameOverScene(); step(); });
$('btnAuto').addEventListener('click', () => { UI.auto = !UI.auto; $('btnAuto').classList.toggle('on', UI.auto); if (UI.auto) autoLoop(); });
function autoLoop() {
  clearTimeout(UI.timer);
  if (!UI.auto) return;
  if (!$('modal').classList.contains('hide') || S.queue.length) { UI.timer = setTimeout(autoLoop, 600); return; }
  step(true);
  UI.timer = setTimeout(autoLoop, SET.speed || 1100);
}
function step(auto) {
  if (!$('modal').classList.contains('hide')) return;
  const out = nextDay();
  const r = out[out.length - 1];
  if (!auto && r) toast(r.open ? `${fshort(r.d)}: benta ${peso(Math.round(out.reduce((s, x) => s + x.sales, 0)))}` : `${fshort(r.d)}: sarado`);
  if (!auto && r && r.open && r.sales > 0) sfx(r.sales > 50000 ? 'cash' : 'coin');
  render(); pump();
  if (S.over) gameOverScene();
}
function header() {
  { const st = STAGES[(S.stage || 1) - 1]; $('coStage').textContent = `${st.em} Stage ${st.n}/6: ${st.name}`; }
  $('coName').textContent = S.company; $('coDate').textContent = fdate(S.day) + (holidayOn(S.day) ? ' · ' + holidayOn(S.day).name : '') + (!isOpen(S.day) ? ' · sarado' : '');
  const c = cash(); $('coCash').textContent = pesoK(c); $('coCash').classList.toggle('neg', c < 0);
  // badges
  const nb = (tab, n) => { const b = document.querySelector(`#nav [data-tab=${tab}]`); const old = b.querySelector('.badge'); if (old) old.remove(); if (n) b.appendChild(el(`<span class="badge">${n}</span>`)); };
  nb('home', S.inbox.filter((m) => !m.read).length);
  nb('people', S.applicants.length + S.cases.filter((c) => c.stage !== 'closed').length);
  nb('books', S.due.filter((x) => !x.paid && x.due - S.day <= 5).length);
}
function render() {
  checkQuests();
  header();
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const V = $('view'); V.textContent = '';
  ({ home: viewHome, ops: viewOps, people: viewPeople, books: viewBooks, company: viewCompany })[UI.tab](V);
}

// ---------- HOME ----------
function viewHome(V) {
  const k = ym(S.day), isM = incomeStatement([k]), lastK = ym(dayFromYMD(yearOf(S.day), monthOf(S.day), 1) - 1), isL = S.mon[lastK] ? incomeStatement([lastK]) : null;
  const K = el('<div class="kpis"></div>');
  const kp = (label, v, sub, cls) => el(`<div class="kpi"><small>${label}</small><b class="${cls || ''}">${v}</b>${sub ? `<div class="${sub[1]}">${sub[0]}</div>` : ''}</div>`);
  K.append(kp(`Sales (${MONTHS[monthOf(S.day) - 1]})`, pesoK(isM.sales), isL ? [`last month ${pesoK(isL.sales)}`, 'mute'] : null),
    kp('Net income (MTD)', pesoK(isM.net), isM.sales ? [`${pct(isM.sales ? isM.net / isM.sales : 0)} margin`, isM.net >= 0 ? 'up' : 'dn'] : null, isM.net < 0 ? 'neg' : ''),
    kp(IND().channel === 'b2b' ? 'Client loyalty' : 'Reputation', `${Math.round(S.rep)}/100`, [S.rep >= 60 ? 'Maganda' : S.rep >= 40 ? 'OK lang' : 'Mababa', S.rep >= 50 ? 'up' : 'dn']),
    S.board.none ? kp(S.loans.length ? 'Loan balance' : 'Ownership', S.loans.length ? pesoK(S.loans.reduce((x, L) => x + L.bal, 0)) : '100% ikaw', S.loans.length ? ['next payment on the 1st', 'mute'] : ['walang board', 'mute']) : kp('Board confidence', `${Math.round(S.board.conf)}%`, [S.board.conf >= 60 ? 'Masaya ang board' : S.board.conf >= 35 ? 'Nag-aalala' : 'Delikado ka', S.board.conf >= 50 ? 'up' : 'dn']));
  V.appendChild(K);
  const apc = approvalsCard(); if (apc) V.appendChild(apc);
  const todo = todoCard(); if (todo) V.appendChild(todo);
  V.appendChild(stageCard());
  const Qc = questCard(); if (Qc) V.appendChild(Qc);
  const tp = tips();
  const A0 = card('\u{1F4A1} Ano ang gagawin ngayon?');
  if (!tp.length) A0.appendChild(el(`<div class="note g">Walang problema ngayon. Tap <b>Next day</b>${S.day - S.start > 20 ? ' or turn on <b>Auto</b>' : ''}.</div>`));
  for (const t of tp) A0.appendChild(row(`<small style="color:var(--ink);font-size:14px">${esc(t.text)}</small>`, btn(t.label, t.fn, t.cls || 'primary'), { em: t.em }));
  V.appendChild(A0);
  // today
  const L = S.last;
  const T = card(L ? `Kahapon · ${fshort(L.d)}` : 'Today', L && L.open ? '' : L ? 'sarado' : '');
  if (L && L.open) {
    T.appendChild(row('Sales', peso(Math.round(L.sales))));
    T.appendChild(row('Gross profit', peso(Math.round(L.sales - L.cogs))));
    if (IND().channel === 'b2b') { T.appendChild(row('Cases delivered', `${L.deliveries} / ${Math.round(L.cap || 0)} capacity`)); T.appendChild(row('Collections', peso(Math.round(L.collected)))); }
    else T.appendChild(row('Customers served', `${L.served} of ${L.cust}${L.lost ? ` <span class="neg">(${L.lost} left)</span>` : ''}`));
    if (L.waste) T.appendChild(row('Waste / losses', `<span class="neg">${peso(Math.round(L.waste))}</span>`));
    for (const n of (L.notes || []).slice(0, 5)) T.appendChild(el(`<div class="note">${esc(n)}</div>`));
  } else if (!L) T.appendChild(el('<div class="empty">Tap <b>Next day</b> to open for business.</div>'));
  // sparkline of the last 30 days
  const days = S.dailyLog.slice(-30);
  if (days.length > 3) { const mx = Math.max(...days.map((x) => x.sales), 1); const ch = el('<div class="chart"></div>'); for (const x of days) ch.appendChild(el(`<i style="height:${Math.max(2, x.sales / mx * 100)}%" title="${peso(Math.round(x.sales))}"></i>`)); T.appendChild(el('<small>Benta, last 30 days</small>')); T.appendChild(ch); }
  V.appendChild(T);
  // inbox
  const I = card('Inbox / updates', `${S.inbox.filter((m) => !m.read).length} unread`);
  for (const m of S.inbox.slice(0, 12)) {
    I.appendChild(row(`<span class="t" style="${m.read ? 'font-weight:500' : ''}">${esc(m.title)}</span><small>${esc(m.from)} · ${fshort(m.d)}</small>`, m.read ? null : el('<span class="pill b">new</span>'), { tap: () => openMail(m), em: { Board: '\u{1F3DB}️', DOLE: '⚖️', HR: '\u{1F4C1}', Accountant: '\u{1F9EE}', Supplier: '\u{1F69A}', SSS: '\u{1F3E5}', Sales: '\u{1F454}', 'City Hall': '\u{1F3E2}' }[m.from] || '✉️' }));
  }
  if (!S.inbox.length) I.appendChild(el('<div class="empty">Walang mensahe.</div>'));
  V.appendChild(I);
}
function estPayroll() { return active().reduce((s, e) => s + e.rate * 13, 0); }
function payNow(id) {
  const x = S.due.find((y) => y.id === id); if (!x) return;
  if (x.kind === '13th' && monthOf(S.day) !== 12) { toast('13th month is paid in December'); return; }
  const tot = x.kind === '13th' ? thirteenthAmount().total : x.amt + penaltyFor(x);
  if (cash() < tot) { toast('Kulang ang cash'); return; }
  payDue(id); if (x.kind !== 'ap') S.flags.paidGov = true; save(); toast(`Paid ${peso(Math.round(tot))}`); render();
}
function openMail(m) {
  m.read = true; save();
  const ch = [];
  if (m.act && m.act.kind === 'report') {
    if (S.board.reportSent[m.act.k]) ch.push({ label: 'Report already sent', fn: closeS });
    else ch.push({ label: `Send ${ymLabel(m.act.k)} report to the board`, sub: m.act.prepared ? 'Prepared by your bookkeeper: review it, then send' : 'Includes the income statement and cash position', cls: 'primary', fn: () => { const is = incomeStatement([m.act.k]); const dc = sendReport(m.act.k, m.act.prepared); save(); scene({ em: '\u{1F4E8}', title: 'Report sent', body: `Sales ${peso(Math.round(is.sales))}\nNet income ${peso(Math.round(is.net))}\n\nBoard confidence ${dc >= 0 ? '+' : ''}${dc}`, choices: [{ label: 'OK', fn: () => { closeS(); } }] }); } });
  }
  ch.push({ label: 'Close', fn: closeS });
  scene({ em: '✉️', title: esc(m.title), sub: `${esc(m.from)} · ${fdate(m.d)}`, body: esc(m.body), choices: ch });
  render();
}

// ---------- guidance: missions, advisor, how-to ----------
function go(tab, sub, extra) { $('modal').classList.add('hide'); UI.scene = null; UI.tab = tab; if (sub) UI.sub[tab] = sub; if (extra) extra(); render(); window.scrollTo(0, 0); }
function pastMonthProfit() { const cur = ym(S.day); return Object.keys(S.mon).some((k) => k < cur && incomeStatement([k]).net > 0); }
function questList() {
  const I = IND(), b2b = I.channel === 'b2b', F = S.flags;
  const rows = b2b ? [] : capRows();
  const firstRole = b2b ? 'driver' : ((rows.find((x) => x.have < x.need) || rows[0] || {}).r || Object.keys(I.roles)[0]);
  const Q = b2b ? [
    { id: 'stock', t: 'Bumili ng stock', how: 'Ops → Stock & PO: tap +10 on items with less than 3 days of stock. The supplier delivers tomorrow.', go: () => go('ops', 'stock'), done: () => F.boughtStock },
    { id: 'day1', t: 'Buksan ang negosyo', how: 'Tap Next day. You drive the motorsiklo and deliver your clients’ orders. Then read the "Kahapon" card.', go: () => go('home'), done: () => S.day > S.start + 1 },
    { id: 'pitch', t: 'Kumuha ng bagong client', how: 'Ops → Clients: when a prospect appears, tap Pitch. More clients means more orders.', go: () => go('ops', 'clients'), done: () => F.pitched || S.clients.length > 8 }
  ] : [
    { id: 'price', t: 'Tingnan ang presyo mo', how: 'Ops → Prices: compare your price with the market. Cheaper brings more customers; pricier gives more margin.', go: () => go('ops', 'prices'), done: () => F.visitedPrices },
    { id: 'day1', t: 'Buksan ang negosyo', how: 'Tap Next day. The store runs for one day. Then read the "Kahapon" card: sales, customers served, and how many left.', go: () => go('home'), done: () => S.day > S.start + 1 }
  ];
  Q.push({ id: 'hire', t: 'Mag-hire ng unang empleyado', how: `Tao → Hiring: choose ${roleDef(firstRole).name}, post on Facebook (₱500). In 1–3 days applicants arrive: interview them, then make an offer at or above minimum wage.`, go: () => go('people', 'hire', () => { UI.hireRole = firstRole; }), done: () => S.stats.hires > 0 || S.emps.length > 0 || Object.keys(S.years).length > 0 });
  if (!b2b) Q.push({ id: 'cap', t: 'Walang customer na aalis', how: 'Ops → Capacity: every bar should be green. A red bar means you need another person (or equipment) for that role. You can also change your own job in Tao → Staff.', go: () => go('ops', 'cap'), done: () => F.capOK });
  if (!S.board.none) Q.push({ id: 'report', t: 'I-send ang monthly report', how: 'On the 1st of each month the board asks for last month\u2019s report. It appears in the \u{1F4CB} Dapat gawin card on Home: tap Review & send before the 10th.', go: () => go('home'), done: () => Object.keys(S.board.reportSent).length > 0 });
  Q.push({ id: 'pay', t: 'Magbayad sa gobyerno', how: 'Payments show up in the \u{1F4CB} Dapat gawin card on Home (and Books \u2192 Compliance) after the end-of-month payroll. Pay before the due date, or hire a Bookkeeper to pay them for you.', go: () => go('books', 'comp'), done: () => F.paidGov });
  Q.push({ id: 'profit', t: 'Kumita sa isang buong buwan', how: 'Books → Income statement → Last month: net income must be positive. Raise sales, cut waste, don’t over-hire.', go: () => go('books', 'pl', () => { UI.period = 'last'; }), done: pastMonthProfit });
  Q.push(b2b ? { id: 'van', t: 'Bumili ng mas malaking sasakyan', how: 'Ops → Fleet & site: a Multicab (60 cases) or L300 (150 cases) delivers far more than the motorsiklo. Hire a driver for it.', go: () => go('ops', 'fleet'), done: () => ['multicab', 'l300', 'truck'].some(hasAsset) }
    : { id: 'equip', t: 'Mag-upgrade ng equipment', how: 'Ops → Equipment: buy something that removes your bottleneck (a stove, oven, machine, POS or freezer).', go: () => go('ops', 'equip'), done: () => S.assets.length > (F.startAssets || 0) });
  if (!S.board.none) Q.push({ id: 'board', t: 'Harapin ang board', how: 'The first quarterly meeting is in April. They will quiz you: know your gross margin and net income (Books tab).', go: () => go('company', 'board'), done: () => S.board.history.length > 0 });
  Q.push({ id: 'grow', t: 'Lumaki: 5 empleyado', how: 'Hire as demand grows. At 10 workers holiday pay and SIL apply; above 15 the higher minimum wage applies.', go: () => go('people', 'hire'), done: () => headcount() >= 5 });
  Q.push({ id: 'move', t: b2b ? 'Lumipat sa Warehouse' : 'Mas malaking puwesto o bagong branch', how: b2b ? 'Ops → Fleet & site: the Warehouse needs 25 clients and holds more stock and vehicles.' : 'Ops → Location: move to a busier place or open a branch. Big spending needs board approval.', go: () => go('ops', b2b ? 'fleet' : 'site'), done: () => S.locs[0] >= 1 || S.locs.length > 1 });
  Q.push({ id: 'year', t: 'Tapusin ang unang taon', how: 'Make it to January 1. You get an annual report with a grade from A to F.', go: () => go('company', 'years'), done: () => Object.keys(S.years).length > 0 });
  return Q;
}
function checkQuests() {
  if (!S) return;
  S.quests = S.quests || {};
  if (S.flags.startAssets == null) S.flags.startAssets = S.assets.length;
  const L = S.last;
  if (L && L.open && L.cust > 0 && (L.lost || 0) <= L.cust * 0.05 && S.day > S.start + 3 && IND().channel === 'walkin') S.flags.capOK = true;
  for (const q of questList()) if (!S.quests[q.id] && q.done()) { S.quests[q.id] = S.day; S.board.conf = clamp(S.board.conf + 1, 0, 100); toast(`✅ Misyon tapos: ${q.t}`); }
}
function questCard() {
  const Q = questList(), n = Q.filter((q) => S.quests && S.quests[q.id]).length;
  if (n >= Q.length) return null;
  const C = card('\u{1F3AF} Mga misyon', `${n}/${Q.length} tapos`);
  C.appendChild(el(`<div class="bar"><i style="width:${n / Q.length * 100}%"></i></div>`));
  Q.filter((q) => !(S.quests && S.quests[q.id])).slice(0, 2).forEach((q, i) => {
    const r = el(`<div class="quest ${i === 0 ? 'cur' : ''}"><b>${i === 0 ? '▶ ' : 'Susunod: '}${esc(q.t)}</b>${i === 0 ? `<small>${esc(q.how)}</small>` : ''}</div>`);
    if (i === 0) r.appendChild(btns(btn('Gawin →', q.go, 'primary')));
    C.appendChild(r);
  });
  return C;
}
// obligations: reports for the board and payments to the government
function pendingReports() { return S.board.none ? [] : S.inbox.filter((m) => m.act && m.act.kind === 'report' && !S.board.reportSent[m.act.k]); }
function approvalsCard() {
  const L = APV(); if (!L.length) return null;
  const C = card(`✍️ Para sa approval mo (${L.length})`, 'your staff recommend, you decide');
  for (const a of L.slice().sort((p, q) => p.exp - q.exp)) {
    const left = a.exp - S.day, K = APPROVAL_KINDS[a.kind];
    C.appendChild(row(`<span class="t">${esc(a.title)}</span><small>${esc(a.from)}${a.kind !== 'pay' ? ` · ${left <= 3 ? '<span class="neg">' + left + ' day(s) left</span>' : left + ' days left'}` : ''}</small>`, btn('Review', () => approvalScene(a.id), 'primary'), { em: K.em }));
  }
  return C;
}
function approvalScene(id) {
  const a = APV().find((x) => x.id === id); if (!a) return closeS();
  const K = APPROVAL_KINDS[a.kind], nodes = [];
  if (a.kind === 'pay') {
    const xs = voucherItems(a);
    nodes.push(el(`<div class="note b">Prepared by ${esc(a.from)}. Sign to release the payments. Gov't dues are filed online once paid.</div>`));
    for (const x of xs) { const late = x.due < S.day; nodes.push(row(`<span class="t ${late ? 'neg' : ''}">${esc(x.label)}</span><small>${late ? 'OVERDUE, with penalty' : 'Due ' + fdate(x.due)}</small>`, peso(Math.round(voucherAmt(x))))); }
    nodes.push(row('<b>Cash in bank</b>', peso(Math.round(cash()))));
  } else nodes.push(el(`<div class="note">${esc(a.body)}</div>`));
  const ch = K.choices(a).map((c, i) => ({ label: c.label, sub: c.sub, cls: c.cls, fn: () => { sfx(i === 0 ? 'approve' : 'decline'); const m = resolveApproval(a.id, i); if (m == null) { closeS(); return; } save(); done(c.label, esc(m), K.em); } }));
  ch.push({ label: 'Mamaya na', sub: 'Decide later', fn: closeS });
  scene({ em: K.em, title: esc(a.title), sub: esc(a.from), nodes, choices: ch });
}
function todoCard() {
  const reps = pendingReports(), dues = S.due.filter((x) => !x.paid && (x.due - S.day <= 10)).sort((a, b) => a.due - b.due);
  if (!reps.length && !dues.length) return null;
  const C = card('\u{1F4CB} Dapat gawin', bookkeeper() ? (S.policy.approvePay === false ? 'bookkeeper pays on time' : 'bookkeeper prepares the voucher') : '');
  for (const m of reps) C.appendChild(row(`<span class="t">Send ${ymLabel(m.act.k)} report to the board</span><small>${m.act.prepared ? 'Prepared by your bookkeeper' : 'Due by the 10th'}</small>`, btn('Review & send', () => openMail(m), 'primary'), { em: '\u{1F4E8}' }));
  for (const x of dues) { const late = x.due < S.day, amt = x.kind === '13th' ? thirteenthAmount().total : x.amt + penaltyFor(x); C.appendChild(row(`<span class="t ${late ? 'neg' : ''}">${esc(x.label)}</span><small>${late ? 'OVERDUE \u00b7 penalty growing' : 'Due ' + fdate(x.due)}</small>`, btn(`Pay ${pesoK(amt)}`, () => payNow(x.id), late ? 'danger' : 'primary'), { em: late ? '\u{1F6A8}' : '\u{1F4C5}' })); }
  return C;
}
// "what should I do now?" built from the state of the business
function tips() {
  const T = [], I = IND(), L = S.last;
  const add = (em, text, label, fn, cls) => T.push({ em, text, label, fn, cls });
  const oc = S.cases.find((c) => c.stage !== 'closed' && c.stage !== 'nte'); if (oc) add('\u{1F4C1}', 'An HR case is waiting for your decision.', 'Open', () => caseScene(oc.id));
  if (S.applicants.length) add('\u{1F4C4}', `${S.applicants.length} applicant(s) waiting. They leave if you don’t interview them.`, 'Interview', () => go('people', 'hire'));
  if (I.channel === 'walkin') {
    if (L && L.open && L.lost > L.cust * 0.1) { const r = capRows().filter((x) => x.have < x.need).sort((a, b) => a.have / a.need - b.have / b.need)[0]; add('\u{1F6B6}', `${L.lost} customers left yesterday: kulang sa ${r ? r.name.toLowerCase() : 'tao'}.`, r ? `Hire ${r.name}` : 'Capacity', () => (r ? go('people', 'hire', () => { UI.hireRole = r.r; }) : go('ops', 'cap'))); }
    if (S.prodShort > 0.05) add('\u{1F373}', `You could only make ${Math.round((1 - S.prodShort) * 100)}% of today’s plan.`, 'Capacity', () => go('ops', 'cap'));
    if (I.mode === 'stock' && !S.policy.autoReorder) { const low = Object.keys(I.lines).filter((k) => !(I.lines[k].needs && !hasAsset(I.lines[k].needs)) && stockQty(k) < forecast(k) * 1.5); if (low.length) add('\u{1F4E6}', `Running low: ${low.map((k) => I.lines[k].name).join(', ')}.`, 'Buy', () => go('ops', 'stock')); }
    if (S.rep < 35 && S.day > S.start + 5) add('⭐', 'Reputation is low, so fewer customers come. Serve everyone, avoid stock-outs, keep prices fair.', 'Prices', () => go('ops', 'prices'));
  } else {
    const low = Object.keys(I.lines).filter((k) => stockQty(k) + (S.inv[k].transit || 0) < Math.max(5, (S.demandAvg[k] || 0) * 0.3));
    if (low.length && !S.policy.autoReorder) add('\u{1F4E6}', `Low stock: ${low.slice(0, 3).map((k) => I.lines[k].name.split(' (')[0]).join(', ')}. Orders you can’t fill make clients leave.`, 'Buy', () => go('ops', 'stock'));
    if (L && L.open && L.cap && L.deliveries >= L.cap * 0.95 && S.backlog.length) add('\u{1F69A}', 'Delivery capacity is full and orders are waiting. Hire a helper or driver, or buy a bigger vehicle.', 'Fleet', () => go('ops', 'fleet'));
    if (!S.vat && S.day - S.start > 25 && !S.flags.vatTipSeen) add('\u{1F9FE}', 'Traders: the 3% percentage tax is on GROSS sales. Registering for VAT (tax only on your margin) is usually cheaper for low-margin trading.', 'See', () => { S.flags.vatTipSeen = true; go('books', 'comp'); });
    if (S.prospects.length) add('\u{1F91D}', `${S.prospects.length} prospect(s) ready for a sales call.`, 'Pitch', () => go('ops', 'clients'));
    const late = S.ar.filter((a) => S.day - a.due > 15); if (late.length) add('\u{1F9FE}', `${late.length} invoice(s) are more than 15 days overdue.`, 'Collect', () => go('ops', 'ar'));
  }
  { const ks = Object.keys(S.mon).filter((k) => k < ym(S.day)).sort().slice(-1); if (ks.length) { const is = incomeStatement(ks), lab = (is.opex.find((x) => x[0] === 6000) || [0, 0])[1] + (is.opex.find((x) => x[0] === 6010) || [0, 0])[1] + (is.opex.find((x) => x[0] === 6020) || [0, 0])[1]; if (lab > is.gross * 0.7 && active().length >= 2) add('\u26A0\uFE0F', `Last month, salaries (${pesoK(lab)}) ate ${Math.round(lab / Math.max(1, is.gross) * 100)}% of your gross profit (${pesoK(is.gross)}). Too many people for your sales: check Ops \u2192 Paglago before hiring more.`, 'Paglago', () => go('ops', 'growth'), 'warn'); } }
  if (cash() < estPayroll() * 1.5 && active().length) add('\u{1F4B8}', `Cash is tight for the next payroll (~${peso(Math.round(estPayroll()))}).`, 'Loans', () => go('company', 'loans'));
  return T.slice(0, 3);
}
function howTo() {
  const b2b = IND().channel === 'b2b';
  scene({ em: '❓', title: 'Paano laruin', sub: 'How to play Negosyante PH', nodes: [
    ...(b2b ? [el('<div class="note b"><b>Ikaw ang distributor (middleman)</b>\n\u{1F3ED} Supplier \u2192 \u{1F69A} IKAW \u2192 \u{1F3EA} Clients (sari-sari stores) \u2192 \u{1F468}\u200D\u{1F469}\u200D\u{1F467} consumers\nYou BUY cases from the supplier (Ops \u2192 Stock & PO), and SELL and DELIVER them to stores (Ops \u2192 Clients). Profit is the ~12% difference, so volume matters. Watch cash: you often pay the supplier before stores pay you.</div>')] : []),
    el(`<div class="note g"><b>Ang loop araw-araw</b>\n1. Ayusin ang negosyo: ${b2b ? 'buy stock, pitch clients' : 'set prices, check capacity'} (Ops tab).\n2. Tap <b>Next day</b>: the business runs for one day.\n3. On Home, read <b>Kahapon</b> and <b>Ano ang gagawin ngayon?</b>\n4. Fix the biggest problem, then repeat. Turn on <b>Auto</b> when things run smoothly.\nNot sure? Follow <b>Mga misyon</b> and tap <b>Gawin</b>.</div>`),
    el('<div class="note g"><b>\u270D\uFE0F Ikaw ang boss: approvals</b>\nOnce you hire them, your staff do their jobs and send you recommendations on Home \u2192 Para sa approval mo:\n\u2022 HR: salary increase after regularization, yearly merit increases, quarterly bonus, manpower requests\n\u2022 Bookkeeper: payment voucher for taxes, SSS and supplier bills; price changes when costs go up\n\u2022 Supervisor: accept or decline supply contracts\nYou only approve, approve half, or decline. Ignoring a request too long has consequences (late penalties, lower morale).</div>'),
    el('<div class="note b"><b>Every month</b>\n• Payroll runs by itself on the 15th and end of month.\n• Pay SSS, PhilHealth, Pag-IBIG and BIR in Books → Compliance (or hire a bookkeeper).\n• Send the monthly report to the board (Home inbox).\n<b>Every quarter</b>: board meeting with questions about your numbers.\n<b>Every year</b>: annual report and grade, permit renewal, income tax return.</div>'),
    el(`<div class="note"><b>Ang mga tab</b>\nHome: today’s results, missions, what to do next, inbox\nOps: ${b2b ? 'stock, clients, receivables, prices, fleet' : 'production or stock, prices, capacity, equipment, location'}\nTao: your own job, staff, hiring, HR cases, payroll, benefits\nBooks: financial statements, compliance calendar, journal\nBoard: targets, investors, loans, annual reports</div>`),
    el('<div class="note r"><b>Paano matalo</b>: negative cash for 30 days, or board confidence under 20% at two meetings in a row.\n<b>Paano manalo</b>: climb the 6 stages on Home (Bagong bukas \u2192 Negosyante ng Taon). Each stage unlocks something: new products, contracts, bigger locations, branches.\n<b>Hindi lumalaki ang benta?</b> Open Ops \u2192 Paglago: it shows your bottleneck and what each fix is worth.</div>')],
    choices: [{ label: 'Gets ko na!', cls: 'primary', fn: closeS }] });
}

// ---------- v1.4: stages, growth, market, contracts, openings ----------
function stageCard() {
  const cur = STAGES[(S.stage || 1) - 1], nx = STAGES[S.stage || 1];
  const C = card(`${cur.em} Yugto ${cur.n}/6: ${cur.name}`, nx ? 'next goal' : 'complete!');
  if (!nx) { C.appendChild(el('<div class="note g">You reached the top. Keep growing your equity and beat your own annual grade.</div>')); return C; }
  C.appendChild(el(`<small>Para maging <b>${nx.em} ${nx.name}</b>: (based on last month)</small>`));
  for (const p of stageProgress(nx)) C.appendChild(meter(`${p.v >= p.max ? '\u2705' : '\u2B1C'} ${p.label}`, Math.max(0, p.v), p.max, p.v >= p.max ? '' : 'w'));
  C.appendChild(el(`<div class="note b">Unlocks: ${esc(nx.unlock)}</div>`));
  return C;
}
function stagesScene() {
  const cur = S.stage || 1;
  const nodes = [el('<div class="note b">Your business grows in 6 stages. Each stage unlocks something new. Targets are checked every Monday using last month\u2019s numbers.</div>')];
  for (const st of STAGES) {
    const n = el(`<div class="stg ${st.n === cur ? 'cur' : st.n < cur ? 'done' : ''}"><b>${st.n < cur ? '\u2705' : st.n === cur ? '\u{1F4CD}' : '\u{1F512}'} ${st.em} Stage ${st.n}: ${st.name}${st.n === cur ? ' (ikaw ngayon)' : ''}</b><small>${st.desc}${st.unlock ? ' \u00b7 Unlocks: ' + esc(st.unlock) : ''}</small></div>`);
    if (st.n === cur + 1) for (const p of stageProgress(st)) n.appendChild(meter(`${p.v >= p.max ? '\u2705' : '\u2B1C'} ${p.label}`, Math.max(0, p.v), p.max, p.v >= p.max ? '' : 'w'));
    nodes.push(n);
  }
  scene({ em: STAGES[cur - 1].em, title: `Stage ${cur} of 6`, sub: STAGES[cur - 1].name, nodes, choices: [{ label: 'OK', cls: 'primary', fn: closeS }] });
}
function opsGrowth(V) {
  const G = growthAnalysis(); if (!G) return;
  const C = card('\u{1F4C8} Bakit hindi lumalaki ang benta?', 'per day');
  const lim = G.limits[0];
  C.appendChild(row('<span class="t">Customers who want to buy</span><small>From foot traffic, reputation, marketing and price</small>', `${G.demand}`));
  C.appendChild(row(`<span class="t">Customers you can serve</span><small>Limited by your weakest point</small>`, `<span class="${G.capNow < G.demand ? 'neg' : 'pos'}">${G.capNow}</span>`));
  C.appendChild(el(`<div class="note ${G.capNow < G.demand ? 'r' : 'y'}">${G.capNow < G.demand ? `\u{1F6A7} <b>Capacity problem.</b> ${G.demand - G.capNow} customers a day can\u2019t be served. Your bottleneck is <b>${esc(lim.name)}</b> (enough for ${lim.v} customers). Fix that first.` : `\u{1F465} <b>Demand problem.</b> You can serve ${G.capNow} but only ${G.demand} come. Get more customers: better reputation, marketing, a busier location, a branch, new products or supply contracts.`}</div>`));
  for (const l of G.limits) C.appendChild(meter(`${l.name}: enough for ${l.v} customers`, Math.min(l.v, G.demand), G.demand, l.v >= G.demand ? '' : 'r'));
  V.appendChild(C);
  const O = card('\u{1F4A1} Options, ranked', 'extra per day');
  O.appendChild(el(`<small>Average customer spends ${peso(Math.round(G.ticket))}, gross profit ${peso(Math.round(G.margin))}.</small>`));
  for (const o of G.opts) {
    const net = Math.round(o.dailyGP * 26 - (o.monthlyCost || 0));
    O.appendChild(row(`<span class="t">${esc(o.what)}</span><small>${o.g > 0 ? `+${Math.round(o.g)} customers \u2192 +${peso(o.daily)} sales, +${peso(o.dailyGP)} gross profit a day` : o.demandUp ? `+${o.demandUp} customers want to come, but your capacity can\u2019t serve them yet` : 'No gain right now: something else limits you'} \u00b7 cost ${o.cost}${o.monthlyCost ? ` \u00b7 <b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${pesoK(net)}/month net</b>` : o.oneTime && o.dailyGP ? ` \u00b7 pays back in ${Math.ceil(o.oneTime / Math.max(1, o.dailyGP))} days` : ''}</small>${o.why && o.why !== 'Current' ? `<small class="neg">${esc(o.why)}</small>` : ''}`, btn('Go', () => go(o.act.tab, o.act.sub, () => { if (o.act.role) UI.hireRole = o.act.role; }))));
  }
  O.appendChild(el('<div class="note">Estimates. Staff skill, morale, absences and season change the real numbers.</div>'));
  V.appendChild(O);
}
function opsMarket(V) {
  const I = IND();
  const C = card('\u{1F4CA} Market prices', 'vs when you started');
  for (const k in I.lines) {
    const m = S.market[k] || 1, ch = (m - 1) * 100;
    C.appendChild(row(`<span class="t">${esc(I.lines[k].name)}</span><small>Cost now ${peso(Math.round(lineCost(k)))} \u00b7 market selling price ${peso(refPrice(k))} \u00b7 yours ${peso(S.price[k])}</small>`, `<span class="${ch > 2 ? 'neg' : ch < -2 ? 'pos' : ''}">${ch >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(ch).toFixed(1)}%</span>`));
  }
  C.appendChild(btns(btn('Adjust prices', () => go('ops', 'prices'))));
  V.appendChild(C);
  const T = card('\u{1F525} Trend');
  if (S.trend && S.trend.until > S.day && I.lines[S.trend.k]) T.appendChild(el(`<div class="note g"><b>${esc(I.lines[S.trend.k].name)}</b>: ${esc(S.trend.why)}. Demand +${Math.round((S.trend.mult - 1) * 100)}% until ${fshort(S.trend.until)}.</div>`));
  else T.appendChild(el('<div class="empty">No trend right now. Watch the Market messages in your inbox.</div>'));
  for (const n of (S.marketLog || []).slice().reverse().slice(0, 5)) T.appendChild(row(`${esc(n.txt)}<small>${fshort(n.d)}</small>`, `<span class="${n.f > 1 ? 'neg' : 'pos'}">${n.f > 1 ? '+' : ''}${Math.round((n.f - 1) * 100)}%</span>`));
  V.appendChild(T);
  const X = EXTRA_LINES[S.ind] || {};
  const P = card('\u{1F9EA} New products (R&D)', (S.stage || 1) < 2 ? 'stage 2' : '');
  if ((S.stage || 1) < 2) P.appendChild(el('<div class="note">Reach stage 2 (Kilala sa barangay) to develop new products.</div>'));
  for (const k in X) {
    const L = X[k], have = (S.unlocked || []).includes(k);
    const m = Math.round((L.price - L.cost) / L.price * 100);
    P.appendChild(row(`<span class="t">${esc(L.name)}</span><small>Sells ${peso(L.price)} \u00b7 cost ${peso(L.cost)} \u00b7 margin ${m}%${L.summer ? ' \u00b7 sells best Mar\u2013May' : ''}${L.trendy ? ' \u00b7 launches with a trend' : ''}</small>`,
      have ? el('<span class="pill g">selling</span>') : btn(`Develop ${pesoK(L.rd)}`, () => { if (cash() < L.rd) return toast('Kulang ang cash'); ask(`Develop ${L.name}? Recipe testing, packaging and training cost ${peso(L.rd)}.`, () => { developProduct(k); save(); toast('New product launched!'); }); }, 'primary', (S.stage || 1) < 2)));
  }
  V.appendChild(P);
}
function opsContracts(V) {
  const I = IND();
  const C = card('\u{1F91D} Supply contracts', 'committed daily volume');
  if ((S.stage || 1) < 2) C.appendChild(el('<div class="note">Offers start at stage 2 (Kilala sa barangay). Businesses then ask you to supply them every working day.</div>'));
  const act = (S.contracts || []).filter((c) => c.until > S.day);
  if (!act.length) C.appendChild(el('<div class="empty">No active contracts.</div>'));
  for (const c of act) C.appendChild(row(`<span class="t">${esc(c.name)}</span><small>${c.qty} ${esc(I.lines[c.line].name)}/day at ${peso(c.price)} \u00b7 ${c.terms}-day terms \u00b7 until ${fshort(c.until)}${c.short ? ` \u00b7 <span class="neg">${c.short} short deliveries</span>` : ''}</small>`, `${pesoK(c.qty * c.price * 26)}/mo`));
  V.appendChild(C);
  const O = card('Offers', `${(S.offers || []).length}`);
  if (!(S.offers || []).length) O.appendChild(el('<div class="empty">No offers yet. New ones come at the start of a month.</div>'));
  for (const o of S.offers || []) {
    const disc = Math.round((1 - o.price / S.price[o.line]) * 100);
    O.appendChild(row(`<span class="t">${esc(o.name)}</span><small>${o.qty} ${esc(I.lines[o.line].name)} every working day \u00b7 ${peso(o.price)} each (${disc}% below your price) \u00b7 ${o.terms}-day terms \u00b7 ${o.months} months \u00b7 about ${pesoK(o.qty * o.price * 26)}/month \u00b7 decide by ${fshort(o.exp)}</small><small>Make sure you have the capacity: miss 4 deliveries and they cancel.</small>`,
      btns(btn('Sign', () => { o.until = S.day + o.months * 30; S.contracts = S.contracts || []; S.contracts.push(o); S.offers = S.offers.filter((x) => x !== o); save(); toast('Contract signed!'); render(); }, 'primary'), btn('Decline', () => { S.offers = S.offers.filter((x) => x !== o); save(); render(); }))));
  }
  V.appendChild(O);
}

// ---------- OPS ----------
function viewOps(V) {
  const I = IND();
  const tabs = I.channel === 'b2b' ? [['stock', 'Stock & PO'], ['clients', 'Clients'], ['ar', 'Receivables'], ['prices', 'Prices'], ['market', 'Market'], ['fleet', 'Fleet & site'], ['mkt', 'Marketing']]
    : [['growth', '\u{1F4C8} Paglago'], [I.mode === 'prep' ? 'plan' : I.mode === 'stock' ? 'stock' : 'cap', I.mode === 'prep' ? 'Production' : I.mode === 'stock' ? 'Inventory' : 'Capacity'], ['prices', 'Prices'], ['market', 'Market'], ['contracts', 'Contracts'], ...(I.mode !== 'service' ? [['cap', 'Capacity']] : []), ['equip', 'Equipment'], ['site', 'Location'], ['mkt', 'Marketing']];
  if (!tabs.some((t) => t[0] === UI.sub.ops)) UI.sub.ops = tabs[0][0];
  V.appendChild(seg(tabs, UI.sub.ops, (k) => { UI.sub.ops = k; render(); }));
  ({ growth: opsGrowth, market: opsMarket, contracts: opsContracts, stock: opsStock, clients: opsClients, ar: opsAR, prices: opsPrices, fleet: opsFleet, mkt: opsMkt, plan: opsPlan, cap: opsCap, equip: opsEquip, site: opsSite })[UI.sub.ops](V);
}
function opsStock(V) {
  const I = IND(), b2b = I.channel === 'b2b';
  const C = card(b2b ? 'Stock (binibili mo sa supplier)' : 'Inventory', `${Math.round(storageUsed())}/${storageCap()} storage`);
  if (b2b) C.appendChild(el(`<div class="note b">Orders arrive tomorrow. ${S.supplier.terms ? `Supplier credit: 30 days, limit ${peso(S.supplier.limit)} (open ${peso(Math.round(apOpen()))}).` : 'Cash on order (supplier terms come with a good track record).'}${S.day < S.supplier.discUntil ? ` Discount ${Math.round(S.supplier.disc * 100)}% until ${fshort(S.supplier.discUntil)}.` : ''}</div>`));
  for (const k in I.lines) {
    const ln = I.lines[k], q = Math.floor(stockQty(k)), unit = lineCost(k);
    const dayNeed = b2b ? (S.demandAvg[k] || 0) * 0.15 : forecast(k);
    const days = dayNeed > 0 ? q / dayNeed : 99;
    const tr = b2b && S.inv[k].transit ? ` · +${S.inv[k].transit} arriving` : '';
    const locked = ln.needs && !hasAsset(ln.needs);
    const n1 = b2b ? 10 : Math.max(10, Math.round(forecast(k) * 3 / 10) * 10), n2 = n1 * 5;
    const buy = (n, terms) => { if (storageUsed() + n > storageCap()) return toast('Puno na ang bodega'); if (!terms && cash() < unit * n) return toast('Kulang ang cash'); buyStock(k, n, !b2b, terms); S.flags.boughtStock = true; save(); toast(`Ordered ${n} ${ln.name}`); render(); };
    const canTerms = b2b && S.supplier.terms && apOpen() + unit * n2 <= S.supplier.limit;
    C.appendChild(row(`<span class="t">${esc(ln.name)}</span><small>${q} on hand${tr} · ${days > 60 ? '—' : days.toFixed(1) + ' days'} · cost ${peso(Math.round(unit))}</small>${locked ? `<small class="neg">Needs ${esc(I.assets[ln.needs] ? I.assets[ln.needs].name : ln.needs)}</small>` : ''}`,
      locked ? null : btns(btn(`+${n1}`, () => buy(n1)), btn(`+${n2}`, () => buy(n2)), canTerms ? btn(`+${n2} 30d`, () => buy(n2, true), 'warn') : null)));
  }
  V.appendChild(C);
  const A = card('Automation');
  A.appendChild(row(`<span class="t">Auto ${b2b ? 'purchase orders' : 'reorder'}</span><small>${b2b ? 'Keeps about 4 days of stock. Needs a warehouse clerk (or you as clerk).' : 'Restocks to about 6 days of sales when cash allows.'}</small>`, btn(S.policy.autoReorder ? 'ON' : 'OFF', () => { S.policy.autoReorder = !S.policy.autoReorder; save(); render(); }, S.policy.autoReorder ? 'primary' : '')));
  V.appendChild(A);
  if (b2b && S.backlog.length) { const B = card('Orders waiting for delivery', `${S.backlog.length}`); for (const o of S.backlog.slice(0, 10)) { const c = S.clients.find((x) => x.id === o.c); B.appendChild(row(`${esc(c ? c.name : '?')}<small>${Object.entries(o.lines).map(([k, n]) => `${n} ${I.lines[k].name.split(' ')[0]}`).join(', ')}</small>`, `${fshort(o.d)}`)); } V.appendChild(B); }
}
function opsPlan(V) {
  const I = IND();
  const C = card(S.ind === 'food' ? 'Daily cooking plan' : 'Daily baking plan');
  C.appendChild(row(`<span class="t">Auto plan</span><small>Make about 5% more than the recent average demand.</small>`, btn(S.autoPlan ? 'AUTO' : 'MANUAL', () => { S.autoPlan = !S.autoPlan; if (!S.autoPlan) for (const k in I.lines) S.plan[k] = S.plan[k] || Math.round(forecast(k) * 1.05); save(); render(); }, S.autoPlan ? 'primary' : '')));
  for (const k in I.lines) {
    const ln = I.lines[k]; if (ln.keeps >= 30) continue;
    const f = forecast(k);
    const val = S.autoPlan ? Math.round(f * 1.05) : (S.plan[k] || 0);
    C.appendChild(row(`<span class="t">${esc(ln.name)}</span><small>Demand ~${f}/day · ${peso(Math.round(lineCost(k)))} each to make${ln.keeps ? ` · keeps ${ln.keeps} days` : ' · spoils same day'}</small>`,
      S.autoPlan ? `${val}` : stepper(val, () => { S.plan[k] = Math.max(0, val - 5); save(); render(); }, () => { S.plan[k] = val + 5; save(); render(); })));
  }
  if (S.prodShort) C.appendChild(el(`<div class="note r">Yesterday you could only make ${Math.round((1 - S.prodShort) * 100)}% of the plan: not enough ${S.ind === 'food' ? 'cooks' : 'bakers or oven space'}.</div>`));
  V.appendChild(C);
  opsCap(V);
}
function capRows() {
  const I = IND(), rows = [];
  for (const r in I.roles) {
    if (r === 'helper') continue;
    const have = active().filter((e) => e.role === r && !['awol', 'leave', 'suspended'].includes(e.status)).reduce((s, e) => s + (I.roles[r].cap || 0) * e.skill * (0.8 + 0.4 * e.morale / 100), 0) + (I.owner[r] ? (S.ownerRole === r ? I.owner[r] : headcount() < 3 && S.ownerRole !== 'manage' ? I.owner[r] * 0.4 : 0) : 0);
    let need = 0;
    if (I.channel === 'walkin') {
      const served = (S.last && S.last.cust) || I.base;
      if (['server', 'cashier', 'clerk'].includes(r) && S.ind !== 'laundry') need = served;
      else if (r === 'stocker') need = Object.keys(I.lines).reduce((s, k) => s + forecast(k), 0);
      else for (const k in I.lines) need += forecast(k) * ((I.lines[k].work || {})[r] || 0);
    }
    rows.push({ r, name: I.roles[r].name, em: I.roles[r].em, have, need, unit: I.roles[r].unit });
  }
  return rows;
}
function opsCap(V) {
  const I = IND();
  const C = card('Capacity vs demand', 'per day');
  if (I.channel === 'walkin') {
    for (const x of capRows()) C.appendChild(meter(`${x.em} ${x.name} · ${Math.round(x.have)} ${x.unit || ''} capacity`, x.have, Math.max(1, x.need), x.have >= x.need ? '' : 'r'));
    if (S.ind === 'food') { const seats = S.locs.reduce((s, t) => s + I.locations[t].seats, 0); C.appendChild(row('Seats \u00d7 turns (+40% take-out)', `${seats} \u00d7 ${I.turns} \u00f7 0.6 = ${Math.round(seats * I.turns / 0.6)}`)); }
    if (S.ind === 'bakery') C.appendChild(row('Oven capacity', `${assetCount('oven')} × ${I.ovenCap} = ${assetCount('oven') * I.ovenCap} units`));
    if (S.ind === 'laundry') { C.appendChild(row('Washers', `${assetCount('washer')} × ${I.machineCap} loads`)); C.appendChild(row('Dryers', `${assetCount('dryer')} × ${I.machineCap} loads`)); C.appendChild(row('Demand', `~${Math.round(forecast('wdf') + forecast('self'))} loads/day`)); }
    C.appendChild(el('<div class="note b">A red bar means customers leave or items run out. Hire for that role, buy equipment, or work that role yourself (Tao → Ikaw).</div>'));
  }
  V.appendChild(C);
}
function opsPrices(V) {
  const I = IND(); S.flags.visitedPrices = true;
  const C = card('Prices', S.vat ? 'VAT-inclusive' : 'non-VAT');
  if (I.channel === 'walkin') C.appendChild(el(`<div class="note b">Cheaper than market brings more customers, pricier means fewer. Elasticity here is ${I.elastic}: a 10% price rise loses about ${Math.round((1 - Math.pow(1 / 1.1, I.elastic)) * 100)}% of buyers for that item.</div>`));
  else C.appendChild(el('<div class="note b">Stores compare you with the market price. Price above market and they order less or leave; below market and you win orders but thin your margin.</div>'));
  for (const k in I.lines) {
    const ln = I.lines[k], p = S.price[k], ref = refPrice(k), unit = lineCost(k);
    const net = S.vat && !ln.vatFree ? p / 1.12 : p, m = (net - unit) / net;
    const stepv = p >= 1000 ? 10 : p >= 200 ? 5 : 1;
    C.appendChild(row(`<span class="t">${esc(ln.name)}</span><small>Market ${peso(ref)} · cost ${peso(Math.round(unit))} · margin <b class="${m < 0.05 ? 'neg' : ''}">${pct(m)}</b>${p > ref * 1.08 ? ' · <span class="neg">mahal</span>' : p < ref * 0.95 ? ' · <span class="pos">mura</span>' : ''}</small>`,
      stepper(peso(p), () => { S.price[k] = Math.max(1, p - stepv); save(); render(); }, () => { S.price[k] = p + stepv; save(); render(); })));
  }
  C.appendChild(btns(btn('Set all to market', () => { for (const k in I.lines) S.price[k] = refPrice(k); save(); render(); })));
  V.appendChild(C);
}
function opsMkt(V) {
  const C = card('Marketing', 'monthly');
  MARKETING.forEach((m, i) => C.appendChild(row(`<span class="t">${m.name}</span><small>${m.cost ? peso(m.cost) + '/month' : 'Free'} · ${IND().channel === 'b2b' ? 'more prospects' : 'more walk-ins'} +${Math.round((m.boost - 1) * 100)}%</small>`, btn(S.policy.mkt === i ? 'Active' : 'Choose', () => { S.policy.mkt = i; save(); render(); }, S.policy.mkt === i ? 'primary' : ''))));
  C.appendChild(el('<div class="note">Charged on the 1st of every month.</div>'));
  V.appendChild(C);
}
function opsEquip(V) {
  const I = IND();
  const C = card('Equipment', `${S.assets.filter((a) => I.assets[a.key]).length} owned`);
  for (const k in I.assets) {
    const A = I.assets[k], n = assetCount(k), why = canBuyAsset(k);
    const fx = [A.cap ? `${A.cap} cases/trip` : '', A.boost ? Object.entries(A.boost).map(([r, v]) => `${(I.roles[r] || {}).name || r} +${v * 100}%`).join(', ') : '', A.keep ? 'less spoilage' : '', A.power ? 'runs during brownouts' : '', A.theft ? 'fewer thefts' : '', A.shoplift ? 'less shoplifting' : '', A.unlock ? 'unlocks a product/service' : '', A.machine ? `+${I.machineCap} loads/day` : '', A.oven ? `+${I.ovenCap} units/day` : '', A.monthly ? `${peso(A.monthly)}/month` : '', A.clerkBoost ? 'faster loading' : '', A.collect ? 'better collections' : ''].filter(Boolean).join(' · ');
    C.appendChild(row(`<span class="t">${esc(A.name)}${n ? ` <span class="pill g">×${n}</span>` : ''}</span><small>${fx}</small>${why && why !== 'Max na' ? `<small class="neg">${why}</small>` : ''}`,
      btns(A.service ? btn(n ? 'Cancel' : 'Hire', () => { if (n) S.assets = S.assets.filter((a) => a.key !== k); else buyAsset(k); save(); render(); }, n ? '' : 'primary') :
        btn(A.cost ? pesoK(A.cost) : 'Get', () => ask(`Buy ${A.name} for ${peso(A.cost)}?`, () => { buyAsset(k); save(); toast(`Bought ${A.name}`); }), 'primary', !!why))));
  }
  V.appendChild(C);
  const O = card('Owned assets');
  for (const a of S.assets) { const A = I.assets[a.key]; if (!A || A.service) continue; O.appendChild(row(`${esc(a.name)}${a.broken ? ' <span class="pill r">sira</span>' : ''}<small>Bought ${fshort(a.bought)} ${yearOf(a.bought)} · ${peso(a.cost)}</small>`, btn('Sell', () => ask(`Sell ${a.name} at 80% of book value?`, () => { sellAsset(a.id); save(); })))); }
  V.appendChild(O);
}
function opsSite(V) {
  const I = IND();
  const C = card('Location');
  for (const o of locationOptions()) {
    const L = o.L;
    C.appendChild(row(`<span class="t">${esc(L.name)}</span><small>Rent ${peso(L.rent)}/mo · ${L.traffic ? `foot traffic ×${L.traffic}` : ''}${L.seats ? ` · ${L.seats} seats` : ''}${L.storage ? ` · storage ${L.storage}` : ''}${L.slots ? ` · ${L.slots} ${I.channel === 'b2b' ? 'vehicles' : 'machines'}` : ''}${L.ovens ? ` · ${L.ovens} ovens` : ''}${L.priceTol ? ' · customers accept higher prices' : ''}</small>${o.block && o.block !== 'Current' && o.block !== 'Smaller' ? `<small class="neg">${o.block}</small>` : ''}`,
      o.block === 'Current' ? el('<span class="pill g">current</span>') : o.block ? null : btn(`Move ${pesoK(o.cost)}`, () => { if (cash() < o.cost) return toast('Kulang ang cash'); if (o.cost >= 300000 && S.board.conf < 45 && !capexApproved()) return toast('Needs board approval'); ask(`Move to ${L.name}? Deposit and fit-out ${peso(o.cost)}, rent ${peso(L.rent)}/month.`, () => { moveLocation(o.i); save(); toast('Lumipat na!'); }); }, 'primary')));
  }
  V.appendChild(C);
  if (I.channel === 'walkin') {
    const B = card('Branches', `${S.locs.length}`);
    B.appendChild(el(`<div class="note b">A new branch adds a ${esc(I.locations[0].name)} (more customers${S.ind === 'food' ? ' and seats' : S.ind === 'laundry' ? ' and machine space' : ''}), its own rent, and needs more staff. Staff rotate between branches.</div>`));
    S.locs.forEach((t, i) => B.appendChild(row(`${i === 0 ? 'Main' : 'Branch ' + (i + 1)}: ${esc(I.locations[t].name)}`, peso(I.locations[t].rent) + '/mo')));
    B.appendChild(btns(btn(`Open branch ${pesoK(branchCost())}`, () => { if ((S.stage || 1) < 3) return toast('Branches unlock at stage 3: Suki ng bayan'); if (S.locs.length >= 5) return toast('Max 5 branches'); if (cash() < branchCost()) return toast('Kulang ang cash'); if (S.board.conf < 50 && !capexApproved()) return toast('The board must approve (confidence 50+)'); ask('Open a new branch?', () => { openBranch(); save(); toast('New branch opened!'); }); }, 'primary')));
    V.appendChild(B);
  }
}
function opsFleet(V) {
  const I = IND();
  const C = card('Fleet');
  const drivers = active().filter((e) => e.role === 'driver').length + (S.ownerRole === 'driver' ? 1 : 0);
  for (const v of S.assets.filter((a) => I.assets[a.key] && I.assets[a.key].vehicle)) C.appendChild(row(`${esc(v.name)}${v.broken ? ' <span class="pill r">sira</span>' : ''}<small>${I.assets[v.key].cap} cases/day · fuel ${peso(I.assets[v.key].fuel)}/case</small>`, null, { em: '\u{1F69A}' }));
  C.appendChild(el(`<div class="note ${drivers < vehicles().length ? 'r' : 'b'}">${vehicles().length} vehicle(s), ${drivers} driver(s)${S.ownerRole !== 'driver' && !active().some((e) => e.role === 'driver') ? ' (you drive when nobody else can)' : ''}. Each vehicle needs a driver; up to 2 pahinante add 25% each.</div>`));
  V.appendChild(C);
  opsEquip(V); opsSite(V);
}
function opsClients(V) {
  const I = IND();
  const C = card('Clients (mga tindahang binebentahan mo)', `${S.clients.length} \u00b7 can service ${clientCapacity()}`);
  if (S.clients.length > clientCapacity()) C.appendChild(el('<div class="note r">More clients than your sales team can visit. Loyalty drops: hire a salesman.</div>'));
  for (const c of S.clients.slice().sort((a, b) => b.bought - a.bought)) {
    const ar = S.ar.filter((a) => a.c === c.id).reduce((s, a) => s + a.amt - a.paid, 0);
    C.appendChild(row(`<span class="t">${esc(c.name)}</span><small>${CLIENT_TYPES[c.type].label} · ${c.terms ? c.terms + '-day terms' : 'COD'} · bought ${pesoK(c.bought)}${ar ? ` · owes ${pesoK(ar)}` : ''}</small>`, el(`<div style="width:70px">${meter('', c.loyal, 100).outerHTML}</div>`), { tap: () => clientScene(c) }));
  }
  V.appendChild(C);
  const P = card('Prospects', `${S.prospects.length}`);
  if (!S.prospects.length) P.appendChild(el('<div class="empty">No leads yet. Salesmen and marketing bring in prospects. You find some too when you work as salesman.</div>'));
  for (const p of S.prospects) P.appendChild(row(`<span class="t">${esc(p.name)}</span><small>${CLIENT_TYPES[p.type].label} · ~${CLIENT_TYPES[p.type].size} cases/order · wants ${p.terms ? p.terms + '-day terms' : 'COD'} · lead expires ${fshort(p.exp)}</small>`, btn('Pitch', () => pitchScene(p), 'primary')));
  V.appendChild(P);
}
function opsAR(V) {
  const ar = S.ar.slice().sort((a, b) => a.due - b.due);
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const a of ar) { const late = S.day - a.due, amt = a.amt - a.paid; if (late <= 0) buckets.current += amt; else if (late <= 30) buckets.d30 += amt; else if (late <= 60) buckets.d60 += amt; else buckets.d90 += amt; }
  const A = card('Aging of receivables', pesoK(bal(1100)));
  A.append(row('Not yet due', peso(Math.round(buckets.current))), row('1–30 days overdue', peso(Math.round(buckets.d30))), row('31–60 days overdue', `<span class="${buckets.d60 ? 'neg' : ''}">${peso(Math.round(buckets.d60))}</span>`), row('Over 60 days', `<span class="${buckets.d90 ? 'neg' : ''}">${peso(Math.round(buckets.d90))}</span>`));
  V.appendChild(A);
  const L = card('Invoices');
  for (const a of ar.slice(0, 40)) { const c = S.clients.find((x) => x.id === a.c); const late = S.day - a.due; L.appendChild(row(`${esc(c ? c.name : 'Former client')}<small>Invoiced ${fshort(a.d)} · due ${fshort(a.due)}${late > 0 ? ` · <span class="neg">${late} days late</span>` : ''}</small>`, btns(el(`<span class="num">${peso(Math.round(a.amt - a.paid))}</span>`), late > 15 ? btn('Collect', () => collectScene(a.id)) : null))); }
  if (!ar.length) L.appendChild(el('<div class="empty">Walang utang ang clients. \u{1F44D}</div>'));
  V.appendChild(L);
}

// ---------- PEOPLE ----------
function viewPeople(V) {
  V.appendChild(seg([['staff', 'Staff'], ['hire', `Hiring${S.applicants.length ? ' (' + S.applicants.length + ')' : ''}`], ['cases', 'HR cases'], ['payroll', 'Payroll'], ['policy', 'Benefits'], ['law', 'Labor law']], UI.sub.people, (k) => { UI.sub.people = k; render(); }));
  ({ staff: peopleStaff, hire: peopleHire, cases: peopleCases, payroll: peoplePayroll, policy: peoplePolicy, law: peopleLaw })[UI.sub.people](V);
}
function peopleStaff(V) {
  const I = IND();
  const O = card('Ikaw (President)', 'saan ka nagtatrabaho?');
  const opts = Object.keys(I.owner).map((r) => [r, `${(I.roles[r] || COMMON_ROLES[r]).em} ${(I.roles[r] || COMMON_ROLES[r]).name}`]).concat([['manage', '\u{1F9D1}‍\u{1F4BC} Manage only']]);
  O.appendChild(seg(opts, S.ownerRole, (k) => { if (k === 'manage' && headcount() < 3) return toast('Manage-only needs at least 3 employees'); S.ownerRole = k; save(); render(); }));
  O.appendChild(el(`<div class="note b">${S.ownerRole === 'manage' ? 'Managing: +10% team productivity and better morale, but you do no frontline work.' : `You work as ${(I.roles[S.ownerRole] || {}).name || S.ownerRole}${headcount() < 3 ? ' and help everywhere else a little (small team)' : ''}.`}</div>`));
  V.appendChild(O);
  const C = card('Employees', `${headcount()} · min wage ${peso(minWage())}/day`);
  const list = S.emps.filter((e) => e.status !== 'gone');
  if (!list.length) C.appendChild(el('<div class="empty">No employees yet. Post a job in Hiring.</div>'));
  for (const e of list) {
    const st = { probi: ['Probationary', 'y'], regular: ['Regular', 'g'], awol: ['AWOL', 'r'], resigning: [`Resigning ${fshort(e.leaveOn)}`, 'r'], leave: ['On leave', 'b'], suspended: ['Suspended', 'r'] }[e.status] || [e.status, ''];
    const R = roleDef(e.role);
    C.appendChild(row(`<span class="t">${esc(e.name)} <span class="pill ${st[1]}">${st[0]}</span></span><small>${R.name} · ${payLabel(e.rate)} · ${e.startOn > S.day ? 'starts ' + fshort(e.startOn) : e.today ? 'present today' : 'absent today'}${e.prof ? ' · ' + esc(e.prof) : ''}</small>`, el(`<div style="width:80px">${meter('morale', e.morale, 100).outerHTML}</div>`), { em: R.em, tap: () => empScene(e) }));
  }
  V.appendChild(C);
  const G = S.emps.filter((e) => e.status === 'gone');
  if (G.length) { const P = card('Former employees'); for (const e of G) P.appendChild(row(`${esc(e.name)}<small>${roleDef(e.role).name} · ${e.why} ${fshort(e.left)}</small>`, e.finalPaid ? el('<span class="pill g">final pay done</span>') : el('<span class="pill y">final pay due</span>'))); V.appendChild(P); }
}
function peopleHire(V) {
  const I = IND();
  const C = card('Post a job');
  const roles = Object.keys(allRoles());
  if (!UI.hireRole || !roles.includes(UI.hireRole)) UI.hireRole = roles[0];
  C.appendChild(seg(roles.map((r) => [r, `${roleDef(r).em} ${roleDef(r).name}`]), UI.hireRole, (k) => { UI.hireRole = k; render(); }));
  const R = roleDef(UI.hireRole);
  C.appendChild(el(`<div class="note b">${esc(R.desc)}. Market rate about ${payLabel(marketWage(UI.hireRole))}. ${R.need ? `Makes sense with ${R.need}+ staff.` : ''}\nRequirements here: ${esc((IND_HIRE[S.ind] || {}).req || 'NBI clearance')}.${hrOfficer() ? `\n\u{1F4C1} HR Officer ${esc(hrOfficer().name)} screens applicants first; you do the final interview.` : ''}</div>`));
  for (const ch of JOB_CHANNELS) {
    const cost = ch.cost === 'month' ? Math.round(marketWage(UI.hireRole) * 13) : ch.cost;
    C.appendChild(row(`<span class="t">${ch.id === 'brgy' ? esc((IND_HIRE[S.ind] || {}).post || ch.name) : ch.name}</span><small>${ch.n[0]}–${ch.n[1]} applicants in ${ch.days[0]}–${ch.days[1]} days${ch.q ? ` · better quality` : ''}${ch.screened ? ' · skills verified' : ''}</small>`, btn(cost ? peso(cost) : 'Free', () => { if (cash() < cost) return toast('Kulang ang cash'); openPosition(UI.hireRole, ch.id, UI.slots || 1); save(); toast('Job posted. Applicants will come in the next few days.'); render(); }, 'primary')));
  }
  C.appendChild(row('<span class="t">How many to hire for this position?</span>', stepper(`${UI.slots || 1}`, () => { UI.slots = Math.max(1, (UI.slots || 1) - 1); render(); }, () => { UI.slots = Math.min(5, (UI.slots || 1) + 1); render(); })));
  V.appendChild(C);
  const OP = card('\u{1F4CC} Open positions', `${(S.openings || []).filter((o) => o.status === 'open').length}`);
  const ops = (S.openings || []).filter((o) => o.status === 'open' || S.day - (o.closedOn || 0) < 14);
  if (!ops.length) OP.appendChild(el('<div class="empty">No open positions. Post a job above.</div>'));
  for (const o of ops) {
    const nApp = S.applicants.filter((a) => a.role === o.role).length, nCome = S.posts.filter((p) => p.role === o.role).length;
    OP.appendChild(row(`<span class="t">${roleDef(o.role).em} ${roleDef(o.role).name} <span class="pill ${o.status === 'open' ? 'b' : 'g'}">${o.status === 'open' ? 'OPEN' : o.why === 'filled' ? 'FILLED' : 'CLOSED'}</span></span><small>Hired ${o.filled || 0} of ${o.slots} \u00b7 ${o.status === 'open' ? `${nApp} applicant(s) waiting, ${nCome} more coming \u00b7 open since ${fshort(o.opened)}` : `closed ${fshort(o.closedOn)}`}</small>`,
      o.status === 'open' ? btn('Close', () => ask(`Close the ${roleDef(o.role).name} position? Remaining applicants get a regret notice and no more will come.`, () => { const n = closePosition(o.id, 'closed'); toast(`Position closed${n ? `: ${n} applicant(s) notified` : ''}`); save(); }), 'warn') : null));
  }
  V.appendChild(OP);
  const A = card('Applicants', `${S.applicants.length}`);
  if (!S.applicants.length) A.appendChild(el('<div class="empty">Wala pang nag-apply.</div>'));
  for (const a of S.applicants) A.appendChild(row(`<span class="t">${esc(a.name)}, ${a.age}${a.hr ? ` <span class="pill ${a.hr.score > 0.75 ? 'g' : a.hr.score > 0.55 ? 'b' : 'y'}">${a.hr.rec}</span>` : ''}</span><small>${roleDef(a.role).name} · ${esc(a.profLabel || '')}${a.exp ? ` (${a.exp} yrs)` : ''}${a.cert ? ' · \u{1F3C5}' : ''} · asking ${payLabel(a.ask)} · until ${fshort(a.expires)}</small>`, btn('Interview', () => interviewScene(a), 'primary'), { em: roleDef(a.role).em }));
  V.appendChild(A);
}
function caseStageText(c) { return { open: 'Decide next step', nte: `Waiting for reply until ${fshort(c.nteOn + LAW.nteDays)}`, reply: 'Reply received: hold a conference or decide', noreply: 'No reply: you may decide', heard: 'Conference done: decide', closed: c.outcome }[c.stage] || c.stage; }
function peopleCases(V) {
  const C = card('HR cases');
  if (!S.cases.length) C.appendChild(el('<div class="empty">No cases. Peaceful workplace. \u{1F60C}</div>'));
  for (const c of S.cases.slice().reverse()) { const e = S.emps.find((x) => x.id === c.emp); C.appendChild(row(`<span class="t">${esc(e ? e.name : 'Former employee')} · ${c.type === 'awol' ? 'AWOL' : c.type === 'absent' ? 'Habitual absences' : 'Cash shortage'}</span><small>${caseStageText(c)}${c.filed ? ' · <span class="neg">complaint filed</span>' : ''}</small>`, null, { tap: () => caseScene(c.id), em: c.stage === 'closed' ? '\u{1F4C2}' : '\u{1F4C1}' })); }
  V.appendChild(C);
  V.appendChild(el('<div class="note b">Philippine due process for just causes (AWOL, theft): 1) Notice to Explain with at least 5 days to reply, 2) a chance to be heard, 3) a written Notice of Decision. Skipping it can cost you damages even when the cause is valid.</div>'));
}
function peoplePayroll(V) {
  const P = S.lastPayroll;
  const C = card('Last payroll', P ? fdate(P.d) : '');
  if (!P) C.appendChild(el('<div class="empty">Payroll runs every 15th and end of month.</div>'));
  else {
    for (const r of P.rows) C.appendChild(row(`<span class="t">${esc(r.name)}</span><small>${r.days} days · gross ${peso(r.gross, 1)} · SSS/PH/HDMF ${peso(r.ee, 1)}${r.tax ? ` · tax ${peso(r.tax, 1)}` : ''}</small>`, peso(r.net, 1)));
    C.append(row('<b>Total gross</b>', peso(P.G, 1)), row('Employer share (SSS, PhilHealth, Pag-IBIG, EC)', peso(P.ER, 1)), row('<b>Net paid</b>', peso(P.NET, 1)));
    C.appendChild(el('<small>SSS, PhilHealth and Pag-IBIG are computed on the whole month and deducted on the end-of-month payroll. Minimum wage earners are exempt from withholding tax.</small>'));
  }
  V.appendChild(C);
  const N = card('Next payroll', `${dom(S.day) <= 15 ? fshort(dayFromYMD(yearOf(S.day), monthOf(S.day), 15)) : fshort(dayFromYMD(yearOf(S.day), monthOf(S.day), lastDom(S.day)))}`);
  N.appendChild(row('Estimated', peso(Math.round(estPayroll()))));
  N.appendChild(row('13th month accrued', peso(Math.round(-bal(2170)))));
  { const mw = minWage(), m = perMonth(mw), c = contrib(m);
    N.appendChild(el(`<div class="note"><b>Paano kinukuwenta ang sahod</b>\nIn the Philippines most shop workers are <b>daily-paid</b>: rate \u00d7 days actually worked. A 6-day week averages 26 days a month, so the monthly equivalent is daily \u00d7 313 \u00f7 12.\n\nExample at minimum wage ${peso(mw)}/day:\n\u2022 Monthly equivalent \u2248 ${peso(m)}\n\u2022 Less SSS ${peso(c.sssEE)}, PhilHealth ${peso(c.phEE)}, Pag-IBIG ${peso(c.hdEE)}\n\u2022 Take-home \u2248 ${peso(Math.round(m - c.sssEE - c.phEE - c.hdEE))} (minimum wage earners pay no income tax)\n\u2022 Your cost on top: SSS ${peso(c.sssER)}, PhilHealth ${peso(c.phER)}, Pag-IBIG ${peso(c.hdER)}, plus 1/12 for 13th month \u2248 ${peso(Math.round(m / 12))}\n\u2022 Total cost to you \u2248 ${peso(Math.round(m + c.sssER + c.phER + c.hdER + m / 12))} a month\n\nA \u20B125,000/month office job is about ${peso(Math.round(25000 * 12 / 313))}/day.</div>`)); }
  N.appendChild(el(`<div class="note b">${holidayCovered() ? 'Holiday pay and service incentive leave apply to you.' : `With fewer than ${LAW.holidayExemptBelow} workers in retail/service, holiday pay and SIL are not required yet.`} Minimum wage now: ${peso(minWage())}/day.</div>`));
  V.appendChild(N);
}
function peoplePolicy(V) {
  const C = card('Benefits & policies');
  for (const k in PERKS) { const p = PERKS[k]; C.appendChild(row(`<span class="t">${p.name}</span><small>${p.desc} · morale +${p.morale}</small>`, btn(S.policy.perks[k] ? 'ON' : 'OFF', () => { S.policy.perks[k] = !S.policy.perks[k]; if (k === 'leave') for (const e of active()) if (S.policy.perks.leave) e.sil += 10; save(); render(); }, S.policy.perks[k] ? 'primary' : ''))); }
  C.appendChild(row('<span class="t">Overtime (2 hrs/day)</span><small>+25% capacity, OT pay at 125%, tired workers</small>', btn(S.policy.overtime ? 'ON' : 'OFF', () => { S.policy.overtime = !S.policy.overtime; save(); render(); }, S.policy.overtime ? 'primary' : '')));
  C.appendChild(row('<span class="t">Open on holidays</span><small>Worked regular holidays pay 200%, special days 130%</small>', btn(S.policy.openHolidays ? 'OPEN' : 'CLOSED', () => { S.policy.openHolidays = !S.policy.openHolidays; save(); render(); }, S.policy.openHolidays ? 'primary' : '')));
  C.appendChild(row('<span class="t">Register new hires with SSS, PhilHealth, Pag-IBIG</span><small>Required by law. Turning it off saves contributions, until DOLE or SSS finds out.</small>', btn(S.policy.register ? 'YES' : 'NO', () => { S.policy.register = !S.policy.register; save(); render(); }, S.policy.register ? 'primary' : 'danger')));
  C.appendChild(row('<span class="t">Payments need my approval</span><small>ON: the bookkeeper prepares a payment voucher and you sign it. OFF: the bookkeeper pays taxes and bills on their own.</small>', btn(S.policy.approvePay === false ? 'OFF' : 'ON', () => { S.policy.approvePay = S.policy.approvePay === false; save(); render(); }, S.policy.approvePay === false ? '' : 'primary')));
  const H = card('Recent decisions', `${(S.approvalLog || []).length}`);
  for (const x of (S.approvalLog || []).slice(0, 10)) H.appendChild(row(`<span class="t">${esc(x.title)}</span><small>${esc(x.from)} \u00b7 ${fshort(x.d)}</small>`, `<small>${esc(x.what)}</small>`));
  if (!(S.approvalLog || []).length) H.appendChild(el('<div class="empty">Staff recommendations you approve or decline show up here.</div>'));
  V.appendChild(C); V.appendChild(H);
}
function peopleLaw(V) {
  const C = card('Labor & tax quick guide');
  for (const n of LAW.notes) C.appendChild(el(`<div class="note b">${esc(n)}</div>`));
  C.appendChild(el('<small>Simplified for the game. Real rules have more detail and exceptions.</small>'));
  V.appendChild(C);
}

// ---------- BOOKS ----------
function viewBooks(V) {
  V.appendChild(seg([['rep', '\u{1F4D1} Reports'], ['pl', 'Income statement'], ['bs', 'Balance sheet'], ['cf', 'Cash flow'], ['comp', 'Compliance'], ['jr', 'Journal'], ['ratio', 'Ratios']], UI.sub.books, (k) => { UI.sub.books = k; render(); }));
  ({ rep: booksReports, pl: booksPL, bs: booksBS, cf: booksCF, comp: booksComp, jr: booksJR, ratio: booksRatio })[UI.sub.books](V);
}
function periodKeys() {
  const y = yearOf(S.day), m = monthOf(S.day), q = Math.ceil(m / 3);
  const lm = ym(dayFromYMD(y, m, 1) - 1);
  return { month: [[ym(S.day)], `${ymLabel(ym(S.day))} (to date)`], last: [[lm], ymLabel(lm)], quarter: [monthsOfQuarter(y, q).filter((k) => k <= ym(S.day)), `Q${q} ${y} (to date)`], ytd: [monthsOfYear(y).filter((k) => k <= ym(S.day)), `Year ${y} (to date)`], py: [monthsOfYear(y - 1), `Year ${y - 1}`] };
}
function periodSeg(V) { V.appendChild(seg([['month', 'This month'], ['last', 'Last month'], ['quarter', 'Quarter'], ['ytd', 'YTD'], ['py', 'Last year']], UI.period, (k) => { UI.period = k; render(); })); }
function fsTable(rows) {
  const t = el('<table class="fs"></table>');
  for (const r of rows) { const tr = el(`<tr class="${r[2] || ''}"><td>${r[0]}</td><td class="${r[1] < 0 ? 'neg' : ''}">${r[1] === '' || r[1] == null ? '' : (r[1] < 0 ? '(' + peso(Math.round(-r[1])) + ')' : peso(Math.round(r[1])))}</td></tr>`); t.appendChild(tr); }
  return t;
}
function booksReports(V) {
  const ks = Object.keys(S.mon).filter((k) => k < ym(S.day)).sort().reverse();
  const C = card('\u{1F4D1} Monthly reports', S.board.none ? 'for your own review' : 'send to the board by the 10th');
  if (S.board.none) C.appendChild(el('<div class="note b">You have no investors, so there is no board and <b>no report to send</b>. Use these monthly reports to check your own business.</div>'));
  else C.appendChild(el(`<div class="note b">Each month the board needs last month\u2019s report by the 10th. ${bookkeeper() ? 'Your bookkeeper prepares it on the 1st.' : 'Hire a bookkeeper to have it prepared for you.'} Tap <b>Send</b>.</div>`));
  if (!ks.length) C.appendChild(el('<div class="empty">Your first report is for January, available on February 1.</div>'));
  for (const k of ks) {
    const is = incomeStatement([k]), sent = S.board.reportSent[k];
    const mail = S.inbox.find((m) => m.act && m.act.kind === 'report' && m.act.k === k);
    C.appendChild(row(`<span class="t">${ymLabel(k)}</span><small>Sales ${pesoK(is.sales)} \u00b7 gross margin ${is.sales ? pct(is.gross / is.sales) : '\u2014'} \u00b7 net ${pesoK(is.net)}</small>`,
      btns(btn('View', () => reportScene(k)), S.board.none ? null : sent ? el('<span class="pill g">sent</span>') : btn('Send', () => { const dc = sendReport(k, mail && mail.act.prepared); if (mail) mail.read = true; save(); toast(`Report sent to the board (${dc >= 0 ? '+' : ''}${dc} confidence)`); render(); }, 'primary'))));
  }
  V.appendChild(C);
}
function reportScene(k) {
  const is = incomeStatement([k]), c = cashFlow([k]), M = S.mon[k] || { k: {} };
  const rows = [['Sales', is.sales], ['Cost of sales', -is.cogs], ['Gross profit', is.gross, 's']];
  for (const [a, v] of is.opex) rows.push([acctName(a), -v, 'i']);
  rows.push(['Operating income', is.opInc, 's'], ['Income tax', -is.tax, 'i'], ['Net income', is.net, 't'], ['Cash from operations', c.opIn - c.opOut, 'i']);
  scene({ em: '\u{1F4D1}', title: `${ymLabel(k)} report`, sub: esc(S.company), nodes: [fsTable(rows), el(`<div class="note b">${IND().channel === 'b2b' ? `Cases delivered ${M.k.deliveries || 0}` : `Customers served ${M.k.served || 0} of ${M.k.cust || 0}`} \u00b7 gross margin ${is.sales ? pct(is.gross / is.sales) : '\u2014'} \u00b7 net margin ${is.sales ? pct(is.net / is.sales) : '\u2014'}</div>`)], choices: [{ label: 'Close', cls: 'primary', fn: closeS }] });
}
function booksPL(V) {
  periodSeg(V);
  const [keys, label] = periodKeys()[UI.period];
  const py = UI.period === 'py' && S.years[yearOf(S.day) - 1];
  const is = py ? py.is : incomeStatement(keys);
  const C = card(`Statement of Comprehensive Income`, esc(label));
  const rows = [['Sales' + (S.vat ? ' (net of VAT)' : ''), is.sales], ['Cost of sales', -is.cogs], ['Gross profit', is.gross, 's'], ['Operating expenses', '', 'h']];
  for (const [a, v] of is.opex) rows.push([acctName(a), -v, 'i']);
  rows.push(['Total operating expenses', -is.totalOpex, 's'], ['Operating income', is.opInc, 's']);
  if (is.other) rows.push(['Other income', is.other]);
  if (is.interest) rows.push(['Interest expense', -is.interest]);
  rows.push(['Income before tax', is.pretax, 's'], ['Income tax expense', -is.tax], ['Net income', is.net, 't']);
  C.appendChild(fsTable(rows));
  if (is.sales) C.appendChild(el(`<small>Gross margin ${pct(is.gross / is.sales)} · Net margin ${pct(is.net / is.sales)}${UI.period === 'month' || UI.period === 'quarter' || UI.period === 'ytd' ? ' · income tax is booked at quarter end' : ''}</small>`));
  V.appendChild(C);
}
function booksBS(V) {
  const b = balanceSheet();
  const C = card('Statement of Financial Position', `as of ${fshort(S.day)}, ${yearOf(S.day)}`);
  const rows = [['Current assets', '', 'h']];
  for (const [a, v] of b.ca) rows.push([acctName(a), v, 'i']);
  rows.push(['Total current assets', b.tca, 's'], ['Non-current assets', '', 'h']);
  for (const [a, v] of b.nca) rows.push([acctName(a), v, 'i']);
  rows.push(['TOTAL ASSETS', b.TA, 't'], ['Current liabilities', '', 'h']);
  for (const [a, v] of b.cl) rows.push([acctName(a), v, 'i']);
  rows.push(['Total current liabilities', b.tcl, 's']);
  for (const [a, v] of b.ncl) rows.push([acctName(a) + ' (long-term)', v, 'i']);
  rows.push(['Total liabilities', b.TL, 's'], ['Equity', '', 'h']);
  for (const [a, v] of b.eq) rows.push([acctName(a), v, 'i']);
  rows.push(['Net income this year', b.ni, 'i'], ['Total equity', b.TE, 's'], ['TOTAL LIABILITIES & EQUITY', b.TL + b.TE, 't']);
  C.appendChild(fsTable(rows));
  C.appendChild(el(`<small class="${Math.abs(b.TA - b.TL - b.TE) < 1 ? 'pos' : 'neg'}">${Math.abs(b.TA - b.TL - b.TE) < 1 ? '✔ Balanced: Assets = Liabilities + Equity' : 'Out of balance!'} · ${msmeSize()} enterprise · ${taxSize()} taxpayer</small>`));
  V.appendChild(C);
}
function booksCF(V) {
  periodSeg(V);
  const [keys, label] = periodKeys()[UI.period];
  const c = cashFlow(keys);
  const C = card('Statement of Cash Flows (direct)', esc(label));
  C.appendChild(fsTable([['Operating activities', '', 'h'], ['Cash received (sales, collections)', c.opIn, 'i'], ['Cash paid (suppliers, payroll, taxes, expenses)', -c.opOut, 'i'], ['Net cash from operations', c.opIn - c.opOut, 's'], ['Investing activities', '', 'h'], ['Equipment, deposits, sale of assets', c.inv, 'i'], ['Financing activities', '', 'h'], ['Capital, loans, dividends', c.fin, 'i'], ['Net change in cash', c.opIn - c.opOut + c.inv + c.fin, 't'], ['Cash today', cash(), 's']]));
  V.appendChild(C);
}
function booksComp(V) {
  const C = card('Compliance calendar', `${taxSize()} taxpayer · ${S.vat ? 'VAT' : 'non-VAT'}`);
  const list = S.due.filter((x) => !x.paid).sort((a, b) => a.due - b.due);
  if (!list.length) C.appendChild(el('<div class="empty">All caught up. ✔</div>'));
  for (const x of list) {
    const late = S.day > x.due, pen = penaltyFor(x), amt = x.kind === '13th' ? thirteenthAmount().total : x.amt;
    C.appendChild(row(`<span class="t ${late ? 'neg' : ''}">${esc(x.label)}</span><small>Due ${fdate(x.due)}${late ? ` · ${S.day - x.due} days late · penalty ${peso(pen)}` : ''}</small>`, btn(`Pay ${pesoK(amt + pen)}`, () => payNow(x.id), late ? 'danger' : 'primary')));
  }
  if (!S.vat) C.appendChild(row('<span class="t">Register for VAT voluntarily</span><small>Below \u20B13M you may opt in: 12% VAT on value added instead of 3% percentage tax on gross sales. Usually better for low-margin traders.</small>', btn('Register', () => ask('Register as a VAT taxpayer? Your prices will now include 12% VAT.', () => { S.vat = true; post('BIR registration update (VAT)', [[6160, 3000], [1000, -3000]]); save(); toast('VAT-registered'); }), 'warn')));
  C.appendChild(el(`<div class="note b">${bookkeeper() ? '\u{1F9EE} Your bookkeeper pays these 2 days before the deadline when cash allows.' : 'Hire a bookkeeper to have these paid automatically.'} Micro and small taxpayers pay a 10% surcharge and 6% interest on late taxes (EOPT Act).</div>`));
  V.appendChild(C);
  const P = card('Recently paid');
  for (const x of S.due.filter((y) => y.paid).slice(-8).reverse()) P.appendChild(row(`${esc(x.label)}<small>Paid ${fshort(x.paidOn)}${x.pen ? ` · <span class="neg">penalty ${peso(x.pen)}</span>` : ''}</small>`, peso(Math.round(x.amt))));
  V.appendChild(P);
}
function booksJR(V) {
  const C = card('General journal', 'latest entries');
  for (const j of S.journal.slice(0, 60)) {
    const d = el(`<div class="jr"><small>${fshort(j.d)} · ${esc(j.memo)}</small></div>`);
    for (const [a, v] of j.lines.slice().sort((p, q) => q[1] - p[1])) d.appendChild(el(`<div class="ln ${v < 0 ? 'cr' : ''}"><span>${acctName(a)}</span><span>${v > 0 ? peso(v, 1) : ''}</span><span>${v < 0 ? peso(-v, 1) : ''}</span></div>`));
    C.appendChild(d);
  }
  V.appendChild(C);
}
function booksRatio(V) {
  const b = balanceSheet(), [keys] = periodKeys().ytd, is = incomeStatement(keys);
  const days = Math.max(1, S.day - Math.max(S.start, dayFromYMD(yearOf(S.day), 1, 1)) + 1);
  const C = card('Key ratios', 'year to date');
  const r = (label, v, hint) => C.appendChild(row(`<span class="t">${label}</span><small>${hint}</small>`, v));
  r('Current ratio', b.tcl ? (b.tca / b.tcl).toFixed(2) : '∞', 'Current assets ÷ current liabilities. Above 1.5 is comfortable.');
  r('Gross margin', is.sales ? pct(is.gross / is.sales) : '—', 'Gross profit ÷ sales');
  r('Net margin', is.sales ? pct(is.net / is.sales) : '—', 'Net income ÷ sales');
  r('Return on equity', b.TE > 0 ? pct(is.net / b.TE) : '—', 'Net income ÷ equity (year to date)');
  r('Debt to equity', b.TE > 0 ? (b.TL / b.TE).toFixed(2) : '—', 'Total liabilities ÷ equity');
  if (IND().channel === 'b2b') r('Days sales outstanding', is.sales ? Math.round(bal(1100) / (is.sales / days)) + ' days' : '—', 'How long clients take to pay');
  if (IND().mode !== 'service') r('Inventory days', is.cogs ? Math.round(bal(1200) / (is.cogs / days)) + ' days' : '—', 'How long stock sits before it sells');
  r('Labor cost % of sales', is.sales ? pct(((is.opex.find((x) => x[0] === 6000) || [0, 0])[1] + (is.opex.find((x) => x[0] === 6010) || [0, 0])[1]) / is.sales) : '—', 'Wages and employer contributions ÷ sales');
  V.appendChild(C);
}

// ---------- COMPANY / BOARD ----------
function viewCompany(V) {
  V.appendChild(seg([['board', S.board.none ? 'Owner' : 'Board'], ['loans', 'Loans'], ['years', 'Annual reports'], ['settings', 'Settings']], UI.sub.company, (k) => { UI.sub.company = k; render(); }));
  ({ board: coBoard, loans: coLoans, years: coYears, settings: coSettings })[UI.sub.company](V);
}
function coBoard(V) {
  const B = S.board, t = B.targets;
  if (B.none) {
    const O = card('Ikaw ang may-ari', '100%');
    O.appendChild(el(`<div class="note b">No investors, no board meetings, <b>no reports to send</b>. ${S.loans.length ? 'Your bank expects the amortization every 1st of the month.' : 'Grow with your own profits, or borrow in Loans.'} Check how you\u2019re doing in Annual reports.</div>`));
    for (const L of S.loans) O.appendChild(row(`${esc(L.name)}<small>${L.daily ? '' : peso(L.pmt) + '/month'}</small>`, peso(Math.round(L.bal))));
    V.appendChild(O);
    const P = card('\u{1F437} Personal savings', pesoK(S.personal || 0));
    P.appendChild(el('<div class="note y">Your own money outside the business. Putting it in saves the business (it becomes more capital), but if the business fails, it\u2019s gone. That\u2019s the real risk of sariling puhunan.</div>'));
    const amts = [25000, 50000, 100000].filter((a) => a <= (S.personal || 0));
    if (amts.length) P.appendChild(btns(...amts.map((a) => btn(`Put in ${pesoK(a)}`, () => ask(`Put ${peso(a)} of your personal savings into the business?`, () => { S.personal -= a; post('Additional capital from owner', [[1000, a], [3000, -a]], 'fin'); S.holders[0].amt += a; save(); toast('Capital added'); }), 'primary'))));
    else P.appendChild(el('<div class="empty">Ubos na ang ipon mo.</div>'));
    V.appendChild(P); return;
  }
  const Rp = card('Monthly reports to the board');
  const reps = pendingReports();
  if (!reps.length) Rp.appendChild(el('<div class="empty">All reports sent. \u2714</div>'));
  for (const m of reps) Rp.appendChild(row(`${ymLabel(m.act.k)} report${m.act.prepared ? ' <span class="pill g">prepared</span>' : ''}`, btn('Review & send', () => openMail(m), 'primary')));
  V.appendChild(Rp);
  const C = card('Board of Directors', `${B.seats + 1} seats`);
  C.appendChild(meter('Board confidence', B.conf, 100));
  C.appendChild(el(`<div class="note ${B.conf < 30 ? 'r' : 'b'}">${B.conf >= 70 ? 'The board trusts you. Big plans get approved.' : B.conf >= 45 ? 'The board is watching. Hit the targets.' : B.conf >= 25 ? 'The board is worried. Two bad meetings and you are out.' : 'Your job is on the line.'}</div>`));
  const y = yearOf(S.day), q = Math.ceil(monthOf(S.day) / 3), keys = monthsOfQuarter(y, q);
  const is = incomeStatement(keys);
  if (t) { C.appendChild(meter(`Q${q} sales target ${peso(t.rev)}`, is.sales, t.rev)); C.appendChild(meter(`Q${q} net income target ${peso(t.ni)}`, Math.max(0, is.net), Math.max(1, t.ni))); }
  const nm = [1, 4, 7, 10].map((m) => dayFromYMD(m === 1 ? y + 1 : y, m, 10)).filter((d) => d > S.day && d > S.start + 60).sort((a, b) => a - b)[0];
  C.appendChild(row('Next board meeting', nm ? fdate(nm) : '—'));
  V.appendChild(C);
  const H = card('Shareholders');
  for (const h of ownership()) H.appendChild(row(esc(h.name), pct(h.pct)));
  V.appendChild(H);
  if (B.history.length) { const Hh = card('Meeting history'); for (const h of B.history.slice().reverse()) Hh.appendChild(row(`Q${h.q} ${h.y}<small>Sales ${pesoK(h.sales)} vs ${pesoK(h.t.rev)} · net ${pesoK(h.net)}</small>`, `<span class="${h.dc >= 0 ? 'pos' : 'neg'}">${h.dc >= 0 ? '+' : ''}${h.dc}</span>`)); V.appendChild(Hh); }
}
function coLoans(V) {
  const C = card('Loans');
  for (const L of S.loans) C.appendChild(row(`${esc(L.name)}<small>${L.daily ? `${peso(L.inst)} collected daily` : `${peso(L.pmt)}/month`}</small>`, peso(Math.round(L.bal))));
  if (!S.loans.length) C.appendChild(el('<div class="empty">No loans.</div>'));
  V.appendChild(C);
  for (const L of LOANS) {
    const lim = loanLimit(L.id);
    const O = card(L.name, L.daily ? '20% per month' : `${Math.round(L.rate * 100)}% a year`);
    O.appendChild(el(`<div class="note ${L.daily ? 'r' : 'b'}">${esc(L.need)}${L.daily ? '' : ` Limit now: ${peso(lim)}.`}</div>`));
    const amts = L.daily ? [10000, 25000, 50000] : [100000, 300000, 500000, 1000000].filter((a) => a <= lim);
    if (amts.length) O.appendChild(btns(...amts.map((a) => btn(pesoK(a), () => ask(`Borrow ${peso(a)} from ${L.name}?`, () => { takeLoan(L.id, a); save(); toast('Loan released'); }), L.daily ? 'danger' : 'primary'))));
    V.appendChild(O);
  }
}
function coYears(V) {
  const C = card('Annual reports');
  const ys = Object.keys(S.years);
  if (!ys.length) C.appendChild(el('<div class="empty">Your first annual report comes on January 1, 2028.</div>'));
  for (const y of ys.reverse()) { const Y = S.years[y]; C.appendChild(row(`<span class="t">${y} annual report</span><small>Sales ${pesoK(Y.is.sales)} · net ${pesoK(Y.is.net)}</small>`, el(`<span class="pill ${Y.grade <= 'B' ? 'g' : Y.grade === 'C' ? 'y' : 'r'}">Grade ${Y.grade}</span>`), { tap: () => yearScene(+y, true) })); }
  V.appendChild(C);
}
function exportSave() {
  save();
  const txt = JSON.stringify(S), ta = el('<textarea readonly></textarea>'); ta.value = txt;
  scene({ em: '\u{1F4BE}', title: 'Export save', body: 'Copy all of this text, then paste it into Import on the other device.', nodes: [ta], choices: [{ label: 'Copy', cls: 'primary', fn: () => { try { navigator.clipboard.writeText(txt).then(() => toast('Copied!'), () => { ta.select(); toast('Select all and copy'); }); } catch (e) { ta.select(); } } }, { label: 'Close', fn: closeS }] });
}
function importSave(inGame) {
  const ta = el('<textarea placeholder="Paste your save here"></textarea>');
  scene({ em: '\u{1F4E5}', title: 'Import save', body: 'The business is added as a new save slot. Your other businesses stay.', nodes: [ta], choices: [{ label: 'Import', cls: 'primary', fn: () => { try { const s = JSON.parse(ta.value.trim()); if (!validSave(s)) throw new Error('bad'); if (slotList().length >= MAX_SLOTS && !slotList().some((x) => x.id === s.slot)) { toast(`Max ${MAX_SLOTS} businesses. Delete one first.`); return; } if (inGame) save(); s.slot = s.slot || uid(); S = s; if (!save()) throw new Error('full'); closeT(); startApp(); toast('Save imported'); } catch (e) { toast(e.message === 'full' ? 'Puno na ang storage' : 'Hindi valid ang save'); } } }, { label: 'Cancel', fn: () => (inGame ? settingsScene(true) : closeT()) }] });
}
function coSettings(V) {
  const C = card('Game');
  C.appendChild(row(`<span class="t">${esc(S.company)}</span><small>${IND().name} · since ${fdate(S.start)}</small>`, null, { em: IND().em }));
  C.appendChild(btns(btn('Save now', () => { save(); toast('Saved'); }), btn('Main menu', () => { save(); UI.auto = false; showTitle(); })));
  C.appendChild(row('<span class="t">Backup / transfer</span><small>Copy your save to move it to the installed app or another phone.</small>', btns(btn('Export', () => exportSave()), btn('Import', () => importSave()))));
  C.appendChild(el(`<small>Negosyante PH v${typeof APP_VERSION === 'string' ? APP_VERSION : '?'}</small>`));
  C.appendChild(btns(btn('Start another business', () => { save(); showTitle(); newBusiness(); }), btn('Delete this business', () => askT(`Delete ${S.company} and all its books from this phone?`, () => { wipeSave(); S = null; showTitle(); }), 'danger')));
  V.appendChild(C);
}

// ---------- scenes ----------
function scene(s) {
  const M = $('modal'), P = $('sheet'); P.textContent = '';
  UI.scene = s;
  P.appendChild(el(`<div class="head">${s.em ? `<div class="em">${s.em}</div>` : ''}<div><h2>${s.title}</h2>${s.sub ? `<small>${s.sub}</small>` : ''}</div></div>`));
  if (s.body) P.appendChild(el(`<div class="body">${s.body}</div>`));
  if (s.nodes) for (const n of s.nodes) P.appendChild(n);
  if (s.choices) {
    const C = el('<div class="choices"></div>');
    for (const c of s.choices) { const b = el(`<button type="button" class="${c.cls || ''}">${c.label}${c.sub ? `<small>${c.sub}</small>` : ''}</button>`); b.disabled = !!c.dis; b.addEventListener('click', () => { sfx('tap'); c.fn(); }); C.appendChild(b); }
    P.appendChild(C);
  }
  M.classList.remove('hide'); P.scrollTop = 0;
}
function closeS() { $('modal').classList.add('hide'); UI.scene = null; clearInterval(UI.game); save(); render(); setTimeout(pump, 50); }
function done(title, body, em) { scene({ em: em || '✔️', title, body, choices: [{ label: 'OK', cls: 'primary', fn: closeS }] }); }
// show the next queued event
function pump() {
  if (!$('modal').classList.contains('hide') || !S || !S.queue.length) return;
  const ev = S.queue.shift(); save();
  const h = HANDLERS[ev.type];
  if (h) { sfx(ev.type === 'stage' ? 'stage' : ev.type === 'yearend' ? 'fanfare' : ['case', 'dole', 'birAudit', 'bounce', 'resign'].includes(ev.type) ? 'bad' : 'notify'); h(ev); } else pump();
}
const empOf = (id) => S.emps.find((e) => e.id === id);
const HANDLERS = {
  info: (ev) => done(esc(ev.title), esc(ev.body), '\u{1F4E2}'),
  vat: () => scene({ em: '\u{1F9FE}', title: 'Lumampas ka na sa ₱3M!', body: 'Your gross sales in the last 12 months passed ₱3,000,000. The Tax Code requires you to register as a VAT taxpayer.\n\nVAT-registered: your prices now include 12% VAT, you claim input VAT on purchases, and file quarterly 2550Q. No more 3% percentage tax.\n\nNot registering is tax evasion: BIR can assess the VAT you should have charged, plus surcharge and interest.',
    choices: [{ label: 'Register for VAT (BIR Form 1905)', sub: 'Consider raising prices about 9% to keep your margins', cls: 'primary', fn: () => { S.vat = true; post('BIR registration update and new invoices', [[6160, 3000], [1000, -3000]]); done('VAT-registered', 'From today your sales carry 12% output VAT. Check your prices in Ops → Prices.'); } },
      { label: 'Huwag muna', sub: 'Risky: a BIR audit can come any time', fn: closeS }] }),
  terms: () => { const lim = Math.round(S.supplier.bought * 0.25 / 10000) * 10000 || 100000; scene({ em: '\u{1F91D}', title: 'Supplier offers credit terms', body: `Your supplier is happy with your orders. They offer 30-day terms up to ${peso(lim)}. Pay late and they cut you off.`, choices: [{ label: 'Accept 30-day terms', cls: 'primary', fn: () => { S.supplier.terms = true; S.supplier.limit = lim; done('Credit line open', 'Use the "30d" buttons in Ops → Stock. Bills appear in Books → Compliance.'); } }, { label: 'No thanks, cash lang', fn: closeS }] }); },
  regularize: (ev) => { const e = empOf(ev.emp); if (!e || e.status !== 'probi') return closeS(); const days = S.day - e.hired; scene({ em: roleDef(e.role).em, title: `Probation review: ${esc(e.name)}`, sub: `${roleDef(e.role).name} · ${days} days employed`,
    nodes: [meter('Skill', e.skill * 70, 100), meter('Morale', e.morale, 100), el(`<div class="note b">${absText(e).line}\nProbation ends at 6 months; after that they become regular automatically and can only be dismissed for just or authorized cause.</div>`), ...(hrOfficer() ? [el(`<div class="note g"><b>\u{1F4C1} HR (${esc(hrOfficer().name)}) recommends:</b> ${(() => { const t = absText(e); return t.a.noshow >= 3 || t.rate > Math.max(0.08, (t.tr || 0.04) * 2) ? 'end probation: attendance below the standard set at hiring' : e.skill < 0.7 ? 'end probation: performance below standard' : 'regularize: meets the standards'; })()}.</div>`)] : [])],
    choices: [{ label: 'Regularize', sub: 'Morale +10', cls: 'primary', fn: () => { e.status = 'regular'; e.regular = true; onRegularized(e); e.morale = clamp(e.morale + 10, 0, 100); done(`${esc(e.name)} is now regular`, 'Congratulations sent. \u{1F389}' + (hrOfficer() ? '\n\nHR will send you a salary increase recommendation for approval.' : '')); } },
      { label: 'End probation: did not meet the standards', sub: 'Legal if the standards were explained on day one (they were). Final pay due in 30 days.', cls: 'warn', fn: () => { separate(e, 'probation ended'); done('Probation ended', `${esc(e.name)} was informed in writing. Release the final pay within 30 days.`); } }] }); },
  resign: (ev) => { const e = empOf(ev.emp); if (!e || e.status !== 'resigning') return closeS(); const x = e.resign || { k: 'unhappy', counter: 0.5, quote: 'Salamat po sa lahat, pero may nakita po akong mas magandang offer.' }, hr = hrOfficer(), adv = exitAdvice(e), nr = counterRate(e);
    const ch = [{ label: 'Accept the resignation', sub: `They work until ${fshort(e.leaveOn)} (30-day notice) and turn over their work`, cls: adv.replace ? 'primary' : '', fn: () => { if (hr) requestReplacement(e); done('Resignation accepted', `HR will process clearance and the certificate of employment. Final pay is due within 30 days after the last day.${hr ? '\n\nHR sent you a replacement request for approval.' : ''}`, '\u{1F91D}'); } }];
    if (x.counter) ch.push({ label: `Counter-offer: ${peso(monthlyOf(nr))}/month (${peso(nr)}/day)`, sub: x.k === 'bpo' ? 'BPO pay is hard to match' : 'They may stay', cls: adv.counter ? 'primary' : '', fn: () => { if (tryCounter(e)) done('Nag-stay siya!', `${esc(e.name)} withdrew the resignation. New rate ${payLabel(e.rate)}.`); else { if (hr) requestReplacement(e); done('Hindi pumayag', `"Salamat po sa offer, pero desidido na po ako." ${esc(e.name)} still leaves on ${fshort(e.leaveOn)}.`, '\u{1F614}'); } } });
    else ch.push({ label: 'Ask them to extend 2 weeks', sub: 'More time to train a replacement', fn: () => { if (chance(0.55)) { e.leaveOn += 14; if (hr) requestReplacement(e); done('Pumayag', `${esc(e.name)} will stay until ${fshort(e.leaveOn)}.`); } else { if (hr) requestReplacement(e); done('Hindi kaya', `${esc(e.name)} can’t extend. Last day stays ${fshort(e.leaveOn)}.`, '\u{1F614}'); } } });
    ch.push({ label: 'Release them today', sub: 'You may waive the 30-day notice. Final pay due in 30 days.', fn: () => { separate(e, 'resigned'); if (hr) requestReplacement(e); done('Released', 'Issue the certificate of employment within 3 days.'); } });
    scene({ em: '\u{1F4E8}', title: `${esc(e.name)} is resigning`, sub: `${roleDef(e.role).name} · ${(() => { const m = Math.max(1, Math.round((S.day - e.hired) / 30)); return m + (m === 1 ? ' month' : ' months'); })()} with you · last day ${fshort(e.leaveOn)}`, nodes: [el(`<div class="note">"${esc(x.quote)}"</div>`), el(`<div class="note b">Resignation letter received with the 30-day notice the Labor Code requires (Art. 300). Morale ${Math.round(e.morale)} · skill ${Math.round(e.skill * 70)}/100 · ${payLabel(e.rate)}</div>`), ...(hr ? [el(`<div class="note g"><b>\u{1F4C1} HR (${esc(hr.name)}), exit interview:</b> ${esc(adv.text)}</div>`)] : [])], choices: ch }); },
  case: (ev) => caseScene(ev.case),
  sena: (ev) => senaScene(ev),
  solicit: (ev) => scene({ em: '\u{1F389}', title: 'Solicitation from the barangay', body: `Kapitan is asking for a donation of ${peso(ev.amt)} for the fiesta / liga.`, choices: [{ label: `Donate ${peso(ev.amt)}`, sub: 'Goodwill +', cls: 'primary', fn: () => { post('Donation: barangay fiesta', [[6240, ev.amt], [1000, -ev.amt]]); S.rep = clamp(S.rep + 3, 0, 100); done('Salamat po!', 'Your name is on the tarpaulin.'); } }, { label: 'Politely decline', fn: () => { S.rep = clamp(S.rep - 1, 0, 100); closeS(); } }] }),
  advance: (ev) => { const e = empOf(ev.emp); if (!e) return closeS(); scene({ em: '\u{1F4B8}', title: `${esc(e.name)} asks for a cash advance`, body: `"Boss, pwede po bang mag-advance ng ${peso(ev.amt)}? May sakit po ang anak ko." It will be deducted from the next payrolls (up to 25% of net pay each time).`, choices: [{ label: 'Approve', sub: 'Morale +6', cls: 'primary', fn: () => { post(`Cash advance: ${e.name}`, [[1110, ev.amt], [1000, -ev.amt]]); e.adv = (e.adv || 0) + ev.amt; e.morale = clamp(e.morale + 6, 0, 100); closeS(); } }, { label: 'Decline', sub: 'Morale −4', fn: () => { e.morale = clamp(e.morale - 4, 0, 100); closeS(); } }] }); },
  padrino: () => scene({ em: '\u{1F935}', title: 'Pakiusap from an investor', body: `${esc(S.board.inv)} asks you to hire their pamangkin. "Mabait na bata, kahit ano lang na trabaho."`, choices: [{ label: 'Interview the pamangkin', sub: 'The board will appreciate it', fn: () => { const a = makeApplicant(Object.keys(IND().roles)[0], -0.1); a.name += ' (pamangkin)'; a.rel = Math.min(a.rel, 0.85); S.applicants.push(a); S.board.conf = clamp(S.board.conf + 2, 0, 100); done('Applicant added', 'Find them in Tao → Hiring. You still decide.'); } }, { label: 'Explain you hire on merit', sub: 'Board confidence −1', fn: () => { S.board.conf = clamp(S.board.conf - 1, 0, 100); closeS(); } }] }),
  inspect: () => { const clean = avgSkill() * 50 + S.rep * 0.4 + (hasAsset('freezer') || hasAsset('chiller') ? 8 : 0); scene({ em: '\u{1F9D1}‍⚕️', title: 'Sanitary inspection', body: 'The city health office is here to check your sanitary permit, food handlers’ health certificates, and cleanliness.', choices: [{ label: 'Accompany the inspector', cls: 'primary', fn: () => { if (clean + rnd(-15, 15) >= 55) done('Passed!', 'Malinis! The inspector signs off.'); else { post('Sanitary violation fine', [[6220, 5000], [1000, -5000]]); S.rep = clamp(S.rep - 4, 0, 100); done('Violations found', 'Fine of ₱5,000. Fix the issues: train staff and keep food chilled.', '⚠️'); } } }, { label: 'Slip him "pang-kape" (₱2,000)', sub: 'Bribery. Very risky.', cls: 'danger', fn: () => { post('Payment to inspector', [[6240, 2000], [1000, -2000]]); if (chance(0.5)) done('He took it', 'Walang violation daw. You feel uneasy about it.', '\u{1F636}'); else { post('Closure and fine: attempted bribery', [[6220, 25000], [1000, -25000]]); S.closedUntil = S.day + 3; S.rep = clamp(S.rep - 10, 0, 100); S.board.conf = clamp(S.board.conf - 10, 0, 100); done('Nahuli ka!', 'The inspector reported the bribe. ₱25,000 fine and 3 days closure. The board is furious.', '\u{1F6A8}'); } } }] }); },
  bigorder: (ev) => { const k = Object.keys(IND().lines)[0], ln = IND().lines[k]; const price = Math.round(S.price[k] * 0.95), qty = ev.qty; scene({ em: '\u{1F4E6}', title: 'Malaking order!', body: `A ${S.ind === 'food' ? 'company' : 'school'} wants ${qty} ${esc(ln.name)} delivered tomorrow at ${peso(price)} each (${peso(qty * price)}). Your team will need overtime.`, choices: [{ label: 'Tanggapin', sub: 'Staff morale −3', cls: 'primary', fn: () => { const unit = lineCost(k), gross = qty * price, vat = vatable(k) ? gross / 1.12 * 0.12 : 0; post(`Bulk order: ${qty} ${ln.name}`, [[1000, gross], [4000, -(gross - vat)], [2150, -vat]]); post('Cost of bulk order', [[5000, Math.round(unit * qty)], [1000, -Math.round(unit * qty)]]); for (const e of active()) e.morale = clamp(e.morale - 3, 0, 100); S.rep = clamp(S.rep + 2, 0, 100); done('Delivered!', `Benta ${peso(gross)}. Pagod ang team pero masaya ang client.`); } }, { label: 'Decline', fn: closeS }] }); },
  bounce: (ev) => { const a = S.ar.find((x) => x.id === ev.ar); if (!a) return closeS(); const c = S.clients.find((x) => x.id === a.c); scene({ em: '\u{1F4B3}', title: 'Tumalbog ang tseke', body: `${esc(c ? c.name : 'A client')}'s check for ${peso(Math.round(a.amt - a.paid))} bounced (DAIF). Bank charge ₱500.`, choices: [{ label: 'Demand cash replacement within 5 days', cls: 'primary', fn: () => { post('Bank charge: returned check', [[6240, 500], [1000, -500]]); if (c) c.loyal -= 10; a.due = S.day + 5; done('Demand sent', 'They promised to pay in cash.'); } }, { label: 'File a BP 22 case (lawyer ₱15,000)', sub: 'You will likely collect, but lose the client', fn: () => { post('Bank charge and legal fees (BP 22)', [[6240, 500], [6170, 15000], [1000, -15500]]); if (c) { c.gone = true; S.clients = S.clients.filter((x) => x !== c); } a.due = S.day + 60; a.legal = true; c && (c.rel = 0.9); done('Case filed', 'Payment expected in about 2 months.'); } }] }); },
  maternity: (ev) => { const e = empOf(ev.emp); if (!e) return closeS(); const adv = Math.round(Math.min(e.rate * 26, 20000) * 105 / 30); scene({ em: '\u{1F930}', title: `${esc(e.name)} is pregnant`, body: `She files for 105 days of maternity leave (RA 11210). You advance her SSS maternity benefit of about ${peso(adv)}; SSS reimburses you after you file.`, choices: [{ label: 'Approve the leave', cls: 'primary', fn: () => { post(`SSS maternity benefit advanced: ${e.name}`, [[1110, adv], [1000, -adv]]); S.reimb = S.reimb || []; S.reimb.push({ amt: adv, on: S.day + irnd(45, 75), memo: `SSS maternity reimbursement: ${e.name}` }); e.wasRegular = e.status === 'regular'; e.status = 'leave'; e.backOn = S.day + 105; e.morale = clamp(e.morale + 10, 0, 100); done('Approved', 'You may need a temporary replacement. Her job is protected.'); } }, { label: 'Suggest she resign instead', sub: 'Illegal discrimination', cls: 'danger', fn: () => { separate(e, 'illegal'); const c = { id: uid(), emp: e.id, type: 'awol', stage: 'closed', closedOn: S.day, validCause: false, risk: 1, log: ['Pressured to resign during pregnancy'], outcome: 'Forced resignation' }; S.cases.push(c); startComplaint(e, c); done('Nag-resign siya...', 'She went straight to DOLE.', '\u{1F6A8}'); } }] }); },
  dole: () => doleScene(),
  birAudit: () => { const since = S.vatSince || S.day - 90; const sales = S.salesLog.slice(-(S.day - since)).reduce((s, x) => s + x, 0); const basic = Math.round(sales / 1.12 * 0.12 * 0.6); const x = { kind: 'vatAssess', amt: basic, due: since + 120 }; const pen = penaltyFor(x); scene({ em: '\u{1F575}️', title: 'BIR Letter of Authority', body: `BIR examined your books. You passed the VAT threshold but did not register.\n\nDeficiency VAT: ${peso(basic)}\nSurcharge and interest: ${peso(Math.round(pen))}\n\nYou will also be registered for VAT now.`, choices: [{ label: `Pay ${peso(Math.round(basic + pen))}`, cls: 'primary', fn: () => { post('BIR assessment: deficiency VAT', [[6160, basic], [6220, pen], [1000, -(basic + pen)]]); S.vat = true; S.board.conf = clamp(S.board.conf - 6, 0, 100); done('Paid', 'You are now VAT-registered.'); } }, { label: 'Protest with a tax lawyer (₱40,000)', sub: '50% chance to cut it by 40%', fn: () => { post('Tax lawyer: protest', [[6170, 40000], [1000, -40000]]); const f = chance(0.5) ? 0.6 : 1; const tot = Math.round((basic + pen) * f); post('BIR assessment (after protest)', [[6160, Math.round(basic * f)], [6220, tot - Math.round(basic * f)], [1000, -tot]]); S.vat = true; done(f < 1 ? 'Nabawasan!' : 'Protest denied', `Paid ${peso(tot)}. You are now VAT-registered.`); } }] }); },
  rush: () => scene({ em: '\u{1F525}', title: S.ind === 'food' ? 'Lunch rush!' : S.ind === 'bakery' ? 'Morning pandesal rush!' : 'Payday rush!', body: 'Ang haba ng pila! Help at the counter for 25 seconds? Every customer you serve right is extra sales and happier customers.', choices: [{ label: 'Tutulong ako!', cls: 'primary', fn: rushGame }, { label: 'Bahala na ang staff', fn: closeS }] }),
  cashcount: () => scene({ em: '\u{1F4B5}', title: 'Bilangin ang kaha', body: 'Closing time. Count the cash drawer and compare it with the POS/notebook. A correct count shows whether money is missing.', choices: [{ label: 'Count it myself', cls: 'primary', fn: cashGame }, { label: 'Skip tonight', fn: closeS }] }),
  negotiate: () => negotiateScene(),
  collect: (ev) => collectScene(ev.ar),
  writeoff: (ev) => { const a = S.ar.find((x) => x.id === ev.ar); if (!a) return closeS(); const c = S.clients.find((x) => x.id === a.c); const amt = Math.round(a.amt - a.paid); scene({ em: '\u{1F4C9}', title: 'Uncollectible account?', body: `${esc(c ? c.name : 'A former client')} owes ${peso(amt)}, over 120 days overdue. Write it off as a bad debt?`, choices: [{ label: 'Write off', sub: 'Dr Bad Debts, Cr Accounts Receivable', cls: 'primary', fn: () => { post(`Bad debt written off: ${c ? c.name : ''}`, [[6190, amt], [1100, -amt]]); a.paid = a.amt; a.closed = true; S.ar = S.ar.filter((x) => x !== a); if (c) { c.gone = true; S.clients = S.clients.filter((x) => x !== c); } done('Written off', `${peso(amt)} moved to bad debts expense.`); } }, { label: 'Keep trying to collect', fn: closeS }] }); },
  board: (ev) => boardScene(ev),
  hrreport: (ev) => hrReportScene(ev),
  stage: (ev) => { const st = STAGES[ev.n - 1]; scene({ em: st.em, title: `Yugto ${st.n}: ${st.name}!`, sub: esc(S.company), body: `${st.desc}\n\nUnlocked: ${st.unlock}\n\nReputation +3${S.board.none ? '' : ', board confidence +6'}.`, choices: [{ label: 'Tuloy ang laban!', cls: 'primary', fn: closeS }] }); },
  yearend: (ev) => yearScene(ev.y)
};

// --- attendance: breakdown and team average ---
function absText(e) {
  const a = e.abs || { sick: e.absences || 0, noshow: 0, sil: 0 };
  const days = Math.max(1, S.day - Math.max(e.hired, e.startOn || e.hired));
  const work = Math.round(days * 6 / 7), rate = (a.sick + a.noshow) / Math.max(1, work);
  const team = active().filter((x) => x !== e && x.abs), tr = team.length ? team.reduce((s, x) => s + (x.abs.sick + x.abs.noshow) / Math.max(1, Math.round((S.day - Math.max(x.hired, x.startOn || x.hired)) * 6 / 7)), 0) / team.length : null;
  return { a, work, rate, tr, line: `Attendance over ${work} working days: ${a.sick} sick (called in${a.sil ? `, ${a.sil} paid from SIL` : ''}) \u00b7 ${a.noshow} no-call no-show \u00b7 absence rate ${(rate * 100).toFixed(1)}%${tr != null ? ` (team average ${(tr * 100).toFixed(1)}%)` : ''} \u00b7 warnings ${e.warnings}` };
}
// HR brings the facts and a recommendation; the owner decides
function hrReportScene(ev) {
  const e = empOf(ev.emp); if (!e || e.status === 'gone') return closeS();
  const h = hrOfficer();
  const rec = ev.noshow >= 3 || (ev.noshow >= 2 && e.warnings >= 1) ? 'nte' : ev.noshow >= 1 ? 'written' : 'verbal';
  const recText = { nte: 'Issue a Notice to Explain (possible habitual absenteeism, a just cause if it continues after warnings)', written: 'Give a written warning: no-call no-shows break company rules', verbal: 'Coaching talk only: the absences were sick days with notice, which are not misconduct' }[rec];
  const act = (k) => () => {
    if (k === 'verbal') { e.rel = Math.min(0.99, e.rel + 0.01); e.morale = clamp(e.morale - 1, 0, 100); done('Coaching done', `${esc(e.name)}: "Pasensya na po, aayusin ko po." Logged in the 201 file.`); }
    else if (k === 'written') { e.warnings++; e.rel = Math.min(0.99, e.rel + 0.02); e.morale = clamp(e.morale - 4, 0, 100); done('Written warning issued', `${esc(e.name)} signed the warning. Warnings on file: ${e.warnings}.`); }
    else if (k === 'nte') { openCase(e, 'absent', { sick: ev.sick, noshow: ev.noshow }); const c = S.cases[S.cases.length - 1]; if (c && c.emp === e.id && c.stage === 'open') { caseAction(c.id, 'nte'); S.queue = S.queue.filter((q) => !(q.type === 'case' && q.case === c.id)); done('NTE served', `HR served the Notice to Explain to ${esc(e.name)}. They have ${LAW.nteDays} days to reply. The case is in Tao \u2192 HR cases.`, '\u{1F4E8}'); } else closeS(); }
    else { e.morale = clamp(e.morale + 1, 0, 100); done('No action', 'Noted. HR will keep monitoring.'); }
  };
  scene({ em: '\u{1F4C1}', title: `HR report: ${esc(e.name)}`, sub: `${roleDef(e.role).name} \u00b7 prepared by ${h ? esc(h.name) : 'HR'} \u00b7 ${ymLabel(ev.k)}`,
    nodes: [el(`<div class="note b"><b>Facts</b>\nThis month: ${ev.sick} sick day(s) with notice, ${ev.noshow} no-call no-show(s).\n${absText(e).line}</div>`), el(`<div class="note g"><b>HR recommends:</b> ${recText}.</div>`)],
    choices: [
      { label: `Approve: ${rec === 'nte' ? 'issue the NTE' : rec === 'written' ? 'written warning' : 'coaching talk'}`, cls: 'primary', fn: act(rec) },
      ...['verbal', 'written', 'nte'].filter((k) => k !== rec).map((k) => ({ label: { verbal: 'Coaching talk only', written: 'Written warning instead', nte: 'Issue a Notice to Explain instead' }[k], fn: act(k) })),
      { label: 'No action this time', fn: act('none') }] });
}
// --- employee detail ---
function empScene(e) {
  const R = roleDef(e.role), days = S.day - e.hired;
  const nodes = [meter('Morale', e.morale, 100), meter('Skill', e.skill * 70, 100),
    el(`<div class="note b">${esc(R.name)} · hired ${fdate(e.hired)} (${days} days) · ${payLabel(e.rate)}${rateIsMWE(e) ? ' (minimum wage earner, tax-exempt)' : ''}\n${e.prof ? esc(e.prof) + ' · ' : ''}learns ${e.learn > 1.5 ? 'fast' : e.learn > 0.9 ? 'normally' : 'slowly'}\n${absText(e).line} · SIL left ${e.sil}${e.adv ? ` · cash advance balance ${peso(e.adv)}` : ''}${e.registered ? '' : '\n⚠ Not registered with SSS/PhilHealth/Pag-IBIG'}</div>`)];
  const ch = [
    { label: `Raise +₱25/day (to ${peso(e.rate + 25)})`, sub: 'Morale up. Pay can never go down again (non-diminution of benefits).', fn: () => { e.rate += 25; e.attMod = (e.attMod || 0) + 2; save(); empScene(e); } },
    { label: 'Training (₱3,500)', sub: 'Skill +8%', fn: () => { if (cash() < 3500) return toast('Kulang ang cash'); post(`Training: ${e.name}`, [[6210, 3500], [1000, -3500]]); e.skill = Math.min(1.4, e.skill + 0.08); e.morale = clamp(e.morale + 3, 0, 100); save(); empScene(e); } },
    { label: 'Give a ₱1,000 bonus', sub: 'Morale +8', fn: () => { post(`Bonus: ${e.name}`, [[6020, 1000], [1000, -1000]]); e.morale = clamp(e.morale + 8, 0, 100); save(); empScene(e); } }
  ];
  if (!e.registered) ch.push({ label: 'Register with SSS, PhilHealth, Pag-IBIG', cls: 'primary', fn: () => { e.registered = true; save(); empScene(e); } });
  if (e.status === 'probi') ch.push({ label: 'Regularize now', cls: 'primary', fn: () => { e.status = 'regular'; e.regular = true; onRegularized(e); e.morale = clamp(e.morale + 10, 0, 100); save(); empScene(e); } });
  const years = Math.max(1, Math.round(days / 365)), sep = Math.round(e.rate * 26 * years);
  ch.push({ label: `Lay off (redundancy): separation pay ${peso(sep)}`, sub: 'Authorized cause: 1 month per year of service, plus DOLE notice', cls: 'warn', fn: () => ask(`Lay off ${e.name}? Separation pay ${peso(sep)} plus final pay.`, () => { post(`Separation pay: ${e.name}`, [[6220, sep], [1000, -sep]]); separate(e, 'laid off'); e.morale = 0; for (const x of active()) x.morale = clamp(x.morale - 4, 0, 100); done('Laid off', 'DOLE was notified (RKS Form 5). Final pay due within 30 days.'); }) });
  ch.push({ label: 'Close', fn: closeS });
  scene({ em: R.em, title: esc(e.name), sub: `${R.name} · ${e.status}`, nodes, choices: ch });
}

// --- interview (hands-on) ---
// stable variety: the same applicant gives the same answer to the same question
function vr(a, key, arr) { let h = Math.floor(a.seed * 1e6); for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return arr[h % arr.length]; }
const tier = (v, hi, mid) => (v >= hi ? 0 : v >= mid ? 1 : 2);
const WHY_LEFT = {
  endo: ['"Na-endo po ako, 5 months lang ang contract."', '"Contractual lang po, hindi na ni-renew pagkatapos ng 6 months."'],
  closed: ['"Nagsara po ang tindahan nung pandemya pa, tapos hindi na nagbukas."', '"Nalugi po ang may-ari kaya nagsara."'],
  family: ['"Inalagaan ko po muna ang nanay ko na na-stroke. OK na po siya ngayon."', '"Umuwi po ako ng probinsya nung nanganak ang asawa ko."'],
  growth: ['"Gusto ko na po ng mas malaking responsibilidad. Walang promotion doon."', '"Natuto na po ako doon, gusto ko pong ma-try ang mas malaking negosyo."'],
  far: ['"Malayo po kasi, tatlong sakay. Lagi akong late."', '"Lumipat po kami ng bahay, ang layo na."'],
  pay: ['"Below minimum po ang sahod doon, walang SSS."', '"Hindi po tumataas ang sahod, tatlong taon na."'],
  fired: ['"Ah... hindi po kami nagkasundo ng supervisor."', '"May nawalang pera po sa shift namin, ako ang sinisi."'],
  conflict: ['"Toxic po ang mga katrabaho ko doon."', '"May nakaaway po ako, pero hindi ko po kasalanan."'],
  awol: ['"Hindi na lang po ako bumalik, ang hirap ng trabaho."', '"Basta po umalis na lang ako."']
};
function interviewQuestions(a) {
  const R = roleDef(a.role), role = a.role, fresh = a.exp === 0;
  const all = [
    { id: 'intro', q: 'Ikwento mo ang sarili mo.', ans: () => fresh
      ? (a.prof === 'fresh' ? vr(a, 'intro', [`"${a.edu} po ako. Nag-OJT po ako sa ${a.ojt}. Gusto ko pong magkaroon ng unang trabaho para makatulong sa pamilya."`, `"Bago lang po akong graduate, ${a.edu}. Wala pa po akong experience pero mabilis po akong matuto."`])
        : a.prof === 'shifter' ? vr(a, 'intro', ['"Galing po ako sa Saudi, factory worker. Gusto ko na pong dito na lang magtrabaho malapit sa pamilya."', '"Dati po akong tricycle driver, gusto ko na po ng regular na trabaho na may SSS."'])
        : vr(a, 'intro', ['"Hindi pa po ako nakapagtrabaho, nag-alaga po ako ng mga kapatid ko. Kailangan ko na pong kumita."', '"Wala pa po akong experience, pero masipag po ako, promise."']))
      : vr(a, 'intro', [`"${a.exp} taon na po akong nagtatrabaho, huli sa ${a.hist[a.hist.length - 1].place}."`, `"Sanay na po ako sa ganitong trabaho, ${a.exp} taon na. ${a.cert ? 'May ' + a.cert + ' din po ako.' : ''}"`]) },
    { id: 'why', q: fresh ? 'Bakit gusto mong magtrabaho dito?' : 'Bakit ka umalis sa dati mong trabaho?', ans: () => fresh
      ? [vr(a, 'whyf', ['"Malapit po sa bahay, at gusto ko pong matuto ng negosyo."', '"Nakita ko po ang post ninyo, maayos daw po kayong employer."']), vr(a, 'whyf', ['"Kailangan ko lang po talaga ng trabaho."', '"Kahit ano po basta may sahod."']), vr(a, 'whyf', ['"Sabi po ng nanay ko mag-apply ako."', '"Wala lang po, try lang."'])][tier(a.att, 0.65, 0.35)]
      : vr(a, 'why', WHY_LEFT[a.leftWhy] || WHY_LEFT.endo) },
    { id: 'cash', q: 'Kung kulang ang kaha pag-close ng shift mo, ano ang gagawin mo?', ans: () => [vr(a, 'cash', ['"Sasabihin ko agad sa supervisor at bibilangin namin ulit nang magkasama."', '"I-report ko po agad, tapos i-check namin ang mga resibo."']), vr(a, 'cash', ['"Babayaran ko na lang po siguro para walang gulo."', '"Hmm, hahanapin ko muna po, baka nahulog lang."']), vr(a, 'cash', ['"Hindi naman po siguro mapapansin kung konti lang..."', '"Depende po, sino ba ang huling humawak?" (umiwas ng tingin)'])][tier(a.hon, 0.6, 0.3)] },
    { id: 'test', q: 'Practical test: ipakita mo kung paano mo gagawin ang trabaho.', ans: () => [`Mabilis at maayos. ${fresh ? 'Nakakagulat para sa fresh grad!' : 'Halatang sanay.'}`, 'Ayos naman, may ilang bagay na kailangang ituro.', fresh ? 'Nalilito pa, pero nakikinig at sinusubukan. Kailangan ng training.' : 'Mabagal at magulo. Hindi tugma sa sinabing experience.'][tier(a.skill, 1.0, 0.8)], reveal: 'skill' },
    { id: 'ref', q: fresh ? 'Tawagan ang OJT supervisor o teacher (reference)' : 'Tawagan ang dating employer (reference check)', ans: () => fresh
      ? [vr(a, 'reff', ['OJT supervisor: "Maaasahan! Never na-late sa OJT."', 'Teacher: "Isa sa pinaka-responsible sa klase."']), 'OJT supervisor: "OK naman, minsan late pero nagtatrabaho."', vr(a, 'reff', ['OJT supervisor: "Ilang beses pong absent nang walang paalam."', 'Teacher: "Matalino pero laging late sa klase."'])][tier(a.rel, 0.92, 0.85)]
      : [vr(a, 'ref', ['Dating amo: "Sayang nga umalis! Halos hindi umaabsent."', 'Dating amo: "Isa sa pinakamagaling namin. I-hire mo na."']), vr(a, 'ref', ['Dating amo: "OK naman, paminsan-minsan absent pag Lunes."', 'Dating amo: "Mabait, pero kailangang paalalahanan."']), vr(a, 'ref', ['Dating amo: "Ay, yung bigla na lang hindi pumasok ng isang linggo?"', 'Dating amo: "No comment na lang po."'])][tier(a.rel, 0.92, 0.85)] },
    { id: 'far', q: 'Saan ka nakatira? Gaano kalayo dito?', ans: () => `"${a.dist}."` },
    { id: 'future', q: 'Saan mo nakikita ang sarili mo after 2 years?', ans: () => a.amb > 1.25 ? vr(a, 'fut', ['"Gusto ko pong mag-abroad, sa Canada po sana."', '"Mag-iipon po ako para sa sarili kong negosyo."']) : a.amb > 0.85 ? vr(a, 'fut', ['"Sana po supervisor na dito."', '"Matuto pa po at ma-promote."']) : vr(a, 'fut', ['"Dito pa rin po, basta maayos ang trato."', '"Gusto ko lang po ng stable na trabaho."']) },
    { id: 'rush', q: 'Paano kung sabay-sabay ang dami ng trabaho at nagagalit na ang customer?', ans: () => [vr(a, 'rush', ['"Isa-isa po, ngingiti, at hihingi ng tulong sa katrabaho."', '"Kalma lang po. Uunahin ko ang pinakamatagal nang naghihintay."']), '"Gagawin ko po ang best ko."', vr(a, 'rush', ['"Eh di sabihan ko pong maghintay sila."', '"Hindi ko na po kasalanan kung kulang kami sa tao."'])][tier(a.att, 0.65, 0.35)] },
    { id: 'team', q: 'May katrabaho kang tamad at ikaw ang laging nagbubuhat. Ano gagawin mo?', ans: () => [vr(a, 'team', ['"Kakausapin ko po siya nang maayos. Kung ganun pa rin, sasabihin ko sa supervisor."', '"Tutulungan ko po muna, baka may pinagdadaanan."']), '"Hayaan ko na lang po siguro."', vr(a, 'team', ['"Aawayin ko po!"', '"Gagayahin ko na lang din po siya."'])][tier(a.att, 0.65, 0.35)] },
    { id: 'pay', q: 'Magkano ang expected salary mo? Bakit?', ans: () => a.floor < a.ask ? `"${peso(a.ask)} po sana kada araw, mga ${peso(perMonth(a.ask))} kada buwan. Pero pwede pong pag-usapan."` : `"${peso(a.ask)} po kada araw, mga ${peso(perMonth(a.ask))} kada buwan. Yan po kasi ang ${a.exp >= 4 ? 'sahod ko dati' : 'minimum'}."` , reveal: 'floor' },
    { id: 'holiday', q: 'Kaya mo bang pumasok kahit Sabado o holiday?', ans: () => a.att > 0.4 ? vr(a, 'hol', ['"Opo, basta may holiday pay po."', '"Kaya po, sanay po ako."']) : vr(a, 'hol', ['"Ay, Sabado po kasi may lakad ako lagi."', '"Pag holiday po sana off ako."']) },
    { id: 'family', q: 'May asawa ka ba? Balak mo bang mag-anak?', bad: true, ans: () => '"...Kailangan po ba yan sa trabaho?" (Questions about marriage or pregnancy in hiring can be discrimination under the Magna Carta of Women.)' }
  ];
  const spec = {
    cook: { q: 'Ano ang specialty mo? Lutuin mo ang adobo para sa 50 katao.', ans: () => [vr(a, 's', ['Perfect ang timpla, tamang dami, malinis ang station.', 'Masarap at mabilis, alam ang food costing pa.']), 'Masarap pero masyadong marami ang toyo at mantika na nagamit.', fresh ? 'Kinakabahan, pero sumusunod sa recipe.' : 'Medyo maalat at matagal.'][tier(a.skill, 1.0, 0.8)] },
    baker: { q: 'Kaya mo bang pumasok ng 3 AM? Gawa ka ng 10 tray ng pandesal.', ans: () => [`Pantay-pantay ang pandesal at maaga natapos. ${a.att > 0.5 ? '"Sanay po ako sa madaling-araw."' : ''}`, 'Ayos ang lasa pero hindi pantay ang laki.', 'Maraming sunog at matigas.'][tier(a.skill, 1.0, 0.8)] },
    driver: { q: 'Ipakita ang lisensya. Ilan ang traffic violations mo?', ans: () => a.cert ? vr(a, 'drv', ['May professional license, walang violation sa LTO record.', 'Professional license, isang beses lang na-ticket sa swerving.']) : vr(a, 'drv', ['"Non-pro pa po, pero kukuha na po ako."', '"Na-expire po, ire-renew ko po."']) },
    salesman: { q: 'I-pitch mo sa akin ang sardinas natin, na parang ako ang may-ari ng tindahan.', ans: () => [vr(a, 'sm', ['"Ate, mas mura po kami ng ₱2 per lata, at libre ang delivery bukas din!"', 'Kinilala muna ang tindahan, nagtanong, saka nag-offer. Magaling!']), '"Bili na po kayo, mura po ito."', 'Nautal at hindi alam ang presyo.'][tier(a.skill, 1.0, 0.8)] },
    cashier: { q: 'Mabilis: ₱1,000 ang bayad sa ₱387. Magkano ang sukli?', ans: () => a.skill > 0.8 ? '"₱613 po!" (2 segundo)' : vr(a, 'cs', ['"₱613... ay teka, ₱623? ₱613 po."', 'Kinuha ang calculator.']) },
    server: { q: 'Paano mo haharapin ang customer na nagreklamong malamig ang sabaw?', ans: () => [vr(a, 'sv', ['"Pasensya na po, papalitan ko agad." Tapos sinabi sa kusina.', 'Humingi ng tawad, pinalitan, at nag-alok ng libreng drinks.']), '"Papainitin ko po."', '"Ganun po talaga, nilalamig."'][tier(a.att, 0.65, 0.35)] },
    attendant: { q: 'Paano mo pinaghihiwalay ang labada at ano ang ginagawa mo sa may mantsa?', ans: () => [`Inihiwalay ang puti, de-kolor at delicate; pre-treat ang mantsa. ${a.cert ? 'May NC II pa.' : ''}`, 'Inihiwalay ang puti at de-kolor lang.', 'Pinagsama-sama lahat.'][tier(a.skill, 1.0, 0.8)] },
    stocker: { q: 'Ano ang FIFO at bakit mahalaga?', ans: () => a.skill > 0.85 ? '"First in, first out po: unahin ilabas ang luma para walang ma-expire."' : vr(a, 'st', ['"Ah... First In, ano po ulit?"', '"Hindi ko po alam pero matututunan ko."']) },
    clerk: { q: 'Bilangin mo ang 3 pallet na ito at itugma sa delivery receipt.', ans: () => a.skill > 0.85 ? 'Tama ang bilang at may nakitang kulang na 2 kaso. Magaling!' : 'Mali ng 5 kaso ang bilang.' },
    bookkeeper: { q: 'Sales on credit ₱10,000. Ano ang journal entry?', ans: () => a.skill > 0.85 ? '"Debit Accounts Receivable ₱10,000, credit Sales ₱10,000 po."' : '"Debit Cash, credit... Sales po?"' },
    rider: { q: 'Paano kung umuulan at may 10 delivery pa?', ans: () => a.att > 0.5 ? '"May kapote po ako, uunahin ko ang malapit at iti-text ko ang customers."' : '"Hihinto muna po ako hanggang tumila."' }
  };
  if (spec[role]) all.splice(4, 0, Object.assign({ id: 'spec' }, spec[role]));
  const iq = (IND_HIRE[S.ind] || {}).q;
  if (iq) all.splice(2, 0, { id: 'ind', q: iq.q, ans: () => iq.ans[tier(iq.by === 'skill' ? a.skill : a[iq.by], iq.by === 'skill' ? 1.0 : iq.by === 'rel' ? 0.92 : 0.65, iq.by === 'skill' ? 0.8 : iq.by === 'rel' ? 0.85 : 0.35)] });
  const must = ['intro', 'test', 'ind'];
  // each applicant brings up a different set of topics
  const rest = all.filter((q) => !must.includes(q.id)).sort((x, y) => vr(a, x.id, [0, 1, 2, 3, 4, 5, 6, 7, 8]) - vr(a, y.id, [0, 1, 2, 3, 4, 5, 6, 7, 8]));
  return all.filter((q) => must.includes(q.id)).concat(rest.slice(0, 5));
}
function resumeNode(a) {
  const R = roleDef(a.role);
  const hist = a.hist.length ? a.hist.map((h) => `• ${h.yrs < 1 ? Math.round(h.yrs * 12) + ' months' : h.yrs + (h.yrs === 1 ? ' year' : ' years')} · ${h.place}`).join('\n') : a.ojt ? `• OJT (300 hours) · ${a.ojt}` : '• No work experience';
  return el(`<div class="note b"><b>${esc(a.profLabel)}</b> · ${a.age} years old · applying as ${esc(R.name)}\n${esc(a.edu)}${a.cert ? '\n\u{1F3C5} ' + esc(a.cert) : ''}\n${esc(hist)}${a.hist.length > 2 ? '\n<span class="neg">Many short jobs</span>' : ''}\nAsking ${payLabel(a.ask)} · min wage ${payLabel(minWage())}${a.docs ? '' : '\n⚠ Still completing NBI, PSA and medical (starts later)'}${a.seen.skill ? '\nSkill: ' + stars(a.skill) : ''}</div>`);
}
function interviewScene(a, asked) {
  asked = asked || []; a.lastAsked = asked;
  const R = roleDef(a.role), Q = interviewQuestions(a), max = a.hr ? 2 : 4;
  const nodes = [resumeNode(a)];
  if (a.hr) nodes.push(el(`<div class="note g"><b>\u{1F4C1} Initial interview by ${esc(a.hr.by)} (HR): ${a.hr.rec}</b>\n${a.hr.notes.map((x) => '\u2022 ' + esc(x)).join('\n')}</div>`));
  for (const id of asked) {
    if (id === '_their') { nodes.push(el(`<div class="speech">${esc(a.theirQ)}</div>`), el(`<div class="speech me">${esc(a.myA)}</div>`)); continue; }
    const q = Q.find((x) => x.id === id); if (q) nodes.push(el(`<div class="speech me">${esc(q.q)}</div>`), el(`<div class="speech">${esc(q.ans())}</div>`));
  }
  // halfway through, some applicants ask their own question
  if (asked.filter((x) => x !== '_their').length === 2 && !asked.includes('_their') && !a.theirAsked) {
    a.theirAsked = true;
    const theirs = [
      { q: 'May tanong po ako: may SSS, PhilHealth at Pag-IBIG po ba dito?', ok: S.policy.register, yes: 'Oo, kumpleto at nire-remit namin buwan-buwan.', no: 'Ah... cash basis muna kami ngayon.' },
      { q: 'Ilang araw po ang pasok? May day off po ba?', ok: true, yes: 'Lunes hanggang Sabado, day off tuwing Linggo.', no: '' },
      { q: 'May 13th month po ba at benefits?', ok: true, yes: `Oo, 13th month by December${Object.keys(S.policy.perks).filter((k) => S.policy.perks[k]).length ? ', plus ' + Object.keys(S.policy.perks).filter((k) => S.policy.perks[k]).map((k) => PERKS[k].name.toLowerCase()).join(', ') : ''}.`, no: '' },
      { q: 'Pwede po bang ma-regular agad?', ok: true, yes: 'Six months ang probation. Kapag pumasa ka sa standards, regular ka na.', no: '' }
    ];
    const t = vr(a, 'their', theirs);
    a.theirQ = t.q; a.myA = t.ok ? t.yes : t.no;
    if (!t.ok) a.ask = Math.round(a.ask * 1.05 / 5) * 5, a.floor = Math.min(a.ask, a.floor + 30);
    return interviewScene(a, asked.concat('_their'));
  }
  const n = asked.filter((x) => x !== '_their').length;
  const ch = Q.filter((q) => !asked.includes(q.id)).map((q) => ({ label: esc(q.q), dis: n >= max, fn: () => { if (q.bad) S.flags.badQ = (S.flags.badQ || 0) + 1; if (q.reveal === 'skill') a.seen.skill = true; if (q.reveal === 'floor') a.seenFloor = true; interviewScene(a, asked.concat(q.id)); } }));
  ch.push({ label: 'Make an offer…', cls: 'primary', fn: () => offerScene(a, Math.max(minWage(), a.ask)) });
  ch.push({ label: 'Salamat, we’ll call you (reject)', fn: () => { S.applicants = S.applicants.filter((x) => x !== a); closeS(); } });
  scene({ em: R.em, title: `Interview: ${esc(a.name)}`, sub: n >= max ? 'Time is up. Decide.' : a.hr ? `Final interview: ${max - n} question(s) left` : `Ask up to ${max} questions (${max - n} left)`, nodes, choices: ch });
}
function takeHomeDed(m) { const c = contrib(m); return c.sssEE + c.phEE + c.hdEE; }
function filledNote(e) { const o = e.opening; if (!o) return ''; return o.filled ? `\n\n\u2705 Position filled and closed.${o.rejected ? ` ${o.rejected} other applicant(s) received a regret notice.` : ''}` : '\n\nThe position stays open for the remaining slot(s).'; }
function offerScene(a, rate, countered) {
  const mw = minWage();
  const p = rate >= a.ask ? 0.95 : rate >= a.floor ? 0.85 : rate >= a.floor * 0.93 ? 0.3 : 0.05;
  const cost = Math.round(rate * 26 * 1.13);
  scene({ em: '\u{1F4DD}', title: `Job offer: ${esc(a.name)}`, sub: `${roleDef(a.role).name} · probationary (6 months)`, nodes: [el(`<div class="note g" style="font-size:15px"><b>${peso(rate)} kada araw \u2248 ${peso(perMonth(rate))} kada buwan</b>\nTake-home after SSS, PhilHealth, Pag-IBIG: about ${peso(Math.round(perMonth(rate) - takeHomeDed(perMonth(rate))))}/month</div>`), stepper(`${peso(rate)}/day`, () => offerScene(a, Math.max(mw, rate - 10), countered), () => offerScene(a, rate + 10, countered)), el(`<div class="note ${rate < a.ask ? 'y' : 'g'}">Asking ${peso(a.ask)}${a.seenFloor && a.floor < a.ask ? ' (said it’s negotiable)' : ''}. Chance they accept now: about ${Math.round(p * 100)}%.\nMonthly cost about ${peso(cost)} with employer contributions and 13th month.${a.prof === 'fresh' || a.prof === 'nowork' ? '\nNo experience: lower skill now, but they learn fast.' : ''}</div>`)],
    choices: [{ label: 'Send the offer', cls: 'primary', fn: () => {
      if (chance(p)) { const e = hire(a.id, rate); sfx('hire'); e.morale = clamp(55 + (rate - a.ask) / a.ask * 150 + (e.att - 0.5) * 20, 30, 85); done('Tinanggap!', `${esc(e.name)} starts on ${fdate(e.startOn)} as ${roleDef(e.role).name}.${a.docs ? '' : ' (Completing pre-employment requirements first.)'} Job standards for regularization were explained in the contract.${filledNote(e)}`, '\u{1F91D}'); }
      else if (!countered && rate >= a.floor * 0.85) { const c = Math.max(a.floor, Math.round((rate + a.ask) / 2 / 5) * 5); scene({ em: '\u{1F914}', title: 'Counter-offer', body: `"Salamat po sa offer. Pwede po bang ${peso(c)}? ${vr(a, 'ctr', ['May inaalagaan po kasi akong magulang.', 'Pamasahe pa lang po kasi ₱120 na araw-araw.', 'May isa pa po kasing nag-offer sa akin.'])}"`, choices: [{ label: `Sige, ${peso(c)}`, cls: 'primary', fn: () => { a.ask = c; a.floor = c; offerScene(a, c, true); } }, { label: 'Hanggang dito lang kami', fn: () => { if (chance(0.35)) { const e = hire(a.id, rate); done('Pumayag din!', `${esc(e.name)} accepted ${peso(rate)}/day. Starts ${fdate(e.startOn)}.${filledNote(e)}`, '\u{1F91D}'); } else { S.applicants = S.applicants.filter((x) => x !== a); done('Hindi tinanggap', `${esc(a.name)} took the other offer.`, '\u{1F614}'); } } }] }); }
      else { S.applicants = S.applicants.filter((x) => x !== a); done('Hindi tinanggap', `${esc(a.name)}: "${vr(a, 'no', ['Pasensya na po, may mas mataas pong offer sa akin.', 'Hindi po kakayanin ng budget ko, salamat po.', 'Tinanggap ko na po ang trabaho sa mall.'])}"`, '\u{1F614}'); }
    } }, { label: 'Back to the interview', fn: () => interviewScene(a, a.lastAsked || []) }] });
}

// --- HR case (due process, hands-on) ---
function caseScene(id) {
  const c = S.cases.find((x) => x.id === id), e = c && empOf(c.emp); if (!c) return closeS();
  const nodes = [el(`<div class="note b">${c.log.map(esc).join('\n')}</div>`)];
  if (c.type === 'absent' && e) nodes.push(el(`<div class="note">${absText(e).line}</div>`));
  if (c.reply && ['reply', 'heard'].includes(c.stage)) nodes.push(el(`<div class="speech">Written explanation: "${esc(c.reply)}"</div>`));
  if (c.type === 'theft') nodes.push(el(`<div class="note ${c.evidence ? 'g' : 'y'}">Evidence: ${c.evidence ? 'CCTV / POS records show the shortage on their shift.' : 'Only the cash count. Weak evidence.'}</div>`));
  const ch = [];
  const name = e ? esc(e.name) : 'the employee';
  if (c.stage === 'open') {
    ch.push({ label: c.hrDraft ? 'Approve the NTE prepared by HR' : 'Send a Notice to Explain (NTE)', sub: c.hrDraft ? `HR serves it today. ${LAW.nteDays} calendar days to answer in writing.` : `Due process: they get ${LAW.nteDays} calendar days to answer in writing`, cls: 'primary', fn: () => { const m = caseAction(id, 'nte'); done('NTE sent', m, '\u{1F4E8}'); } });
    ch.push({ label: 'Text them: "Huwag ka nang bumalik!"', sub: 'Fire immediately, no notice, no hearing', cls: 'danger', fn: () => { const m = caseAction(id, 'firenow'); done('Tinanggal', m, '\u{1F4F1}'); } });
    if (c.type === 'awol' && c.returned) ch.push({ label: 'They came back: closeS with a written warning', fn: () => { done('Warning given', caseAction(id, 'warn')); } });
    ch.push({ label: 'Decide later', fn: closeS });
  } else if (c.stage === 'nte') {
    ch.push({ label: `Wait for the reply (until ${fshort(c.nteOn + LAW.nteDays)})`, fn: closeS });
  } else if (['reply', 'noreply', 'heard'].includes(c.stage)) {
    if (c.stage !== 'heard') ch.push({ label: 'Hold an administrative conference', sub: 'Hear their side before deciding', cls: 'primary', fn: () => hearingScene(c, e) });
    ch.push({ label: 'Notice of Decision: dismissal', sub: c.stage === 'noreply' ? 'They did not answer the NTE' : 'Based on the facts', cls: 'danger', fn: () => done('Decision served', caseAction(id, 'dismiss'), '⚖️') });
    ch.push({ label: 'Notice of Decision: 7-day suspension', fn: () => done('Suspended', caseAction(id, 'suspend')) });
    ch.push({ label: 'Notice of Decision: written warning', fn: () => done('Warning', caseAction(id, 'warn')) });
    if (c.type === 'awol' && c.reason === 'newjob') ch.push({ label: 'Accept their resignation', fn: () => done('Resigned', caseAction(id, 'accept')) });
  } else {
    ch.push({ label: 'Close', fn: closeS });
  }
  scene({ em: '\u{1F4C1}', title: `${c.type === 'awol' ? 'AWOL' : c.type === 'absent' ? 'Habitual absences' : 'Cash shortage'}: ${name}`, sub: caseStageText(c), nodes, choices: ch });
}
function hearingScene(c, e, asked) {
  asked = asked || [];
  const truth = c.type === 'awol' ? caseReasonText(c) : (e && e.hon < 0.3 ? 'Nanginginig siya. "Pasensya na po, babayaran ko po..."' : '"Hindi ko po kinuha. Baka mali lang ang sukli na naibigay ko."');
  const Q = c.type === 'absent' ? [{ id: 'why', q: 'Bakit madalas kang absent nitong buwan?', a: e && e.rel > 0.85 ? 'Nagkasakit po ang anak ko at bumaha sa amin. May medical certificate po.' : 'Malayo po kasi, minsan napupuyat ako.' }, { id: 'doc', q: 'May dokumento ka ba para sa mga absences?', a: e && e.rel > 0.85 ? 'Ipinakita ang medical certificate at barangay certificate (baha).' : 'Wala po.' }, { id: 'plan', q: 'Ano ang gagawin mo para hindi na maulit?', a: e && e.att > 0.5 ? '"Magpapaalam po ako agad at aagahan ko ang alis."' : '"Susubukan ko po."' }]
    : c.type === 'awol'
    ? [{ id: 'proof', q: 'May patunay ka ba? (medical certificate, ticket, etc.)', a: c.reason === 'hospital' ? 'Ipinakita ang medical certificate mula sa ospital.' : c.reason === 'province' ? 'Ipinakita ang bus ticket at death certificate ng tatay.' : 'Wala pong maipakita.' }, { id: 'intent', q: 'Gusto mo pa bang magtrabaho dito?', a: c.reason === 'newjob' ? '"Ah, may iba na po akong trabaho."' : '"Opo, kailangan ko po ang trabaho!"' }, { id: 'why', q: 'Bakit hindi ka man lang nag-text?', a: c.reason === 'hospital' ? '"Naka-confine po ako, walang makapag-text."' : c.reason === 'province' ? '"Walang signal po sa amin."' : '"Nakalimutan ko po."' }]
    : [{ id: 'cctv', q: 'Panoorin natin ang CCTV / POS log.', a: c.evidence ? 'Kita sa CCTV ang pagkuha ng pera sa drawer.' : 'Walang malinaw na kuha.' }, { id: 'side', q: 'Ano ang paliwanag mo?', a: truth }, { id: 'others', q: 'Sino pa ang humawak ng kaha?', a: '"Kami lang po ni ate kanina."' }];
  const nodes = [el('<div class="note b">Administrative conference. The employee may bring a representative. You listen before you decide.</div>')];
  for (const id of asked) { const q = Q.find((x) => x.id === id); nodes.push(el(`<div class="speech me">${q.q}</div>`), el(`<div class="speech">${esc(q.a)}</div>`)); }
  const ch = Q.filter((q) => !asked.includes(q.id)).map((q) => ({ label: q.q, fn: () => hearingScene(c, e, asked.concat(q.id)) }));
  ch.push({ label: 'End the conference', cls: 'primary', fn: () => { c.stage = 'heard'; c.log.push(`${fshort(S.day)}: Administrative conference held`); if (c.type === 'theft' && asked.includes('side') && e && e.hon < 0.3) c.evidence = true; caseScene(c.id); } });
  scene({ em: '⚖️', title: 'Administrative conference', sub: e ? esc(e.name) : '', nodes, choices: ch });
}
function senaScene(ev) {
  const e = empOf(ev.emp), name = e ? esc(e.name) : 'Former employee';
  const offer = (f) => () => {
    const amt = Math.round(ev.ask * f), p = f >= 1 ? 1 : f >= 0.75 ? 0.75 : f >= 0.5 ? 0.45 : 0.15;
    if (chance(p)) { post(`SEnA settlement: ${e ? e.name : ''}`, [[6220, amt], [1000, -amt]]); const c = S.cases.find((x) => x.id === ev.case); if (c) c.settled = true; done('Settled', `Quitclaim signed for ${peso(amt)}. Case closed.`, '\u{1F91D}'); }
    else nlrc(ev, name);
  };
  scene({ em: '⚖️', title: `SEnA conference: ${name}`, sub: 'DOLE Single Entry Approach (30-day conciliation)', body: `${ev.valid ? 'They admit the cause, but say you skipped due process. Legal basis: nominal damages (Agabon doctrine).' : 'They say they were illegally dismissed. If NLRC agrees: backwages, separation pay in lieu of reinstatement, plus 10% attorney’s fees.'}\n\nThey are asking for ${peso(ev.ask)}.`,
    choices: [{ label: `Offer 50% (${peso(Math.round(ev.ask * 0.5))})`, fn: offer(0.5) }, { label: `Offer 75% (${peso(Math.round(ev.ask * 0.75))})`, fn: offer(0.75) }, { label: `Pay in full (${peso(ev.ask)})`, cls: 'primary', fn: offer(1) }, { label: 'Refuse: see you at the NLRC', cls: 'danger', fn: () => nlrc(ev, name) }] });
}
function nlrc(ev, name) {
  const lawyer = 45000, award = ev.valid ? LAW.agabon : Math.round(ev.ask * 1.35);
  post('Labor lawyer: NLRC case', [[6170, lawyer], [1000, -lawyer]]);
  post(`NLRC decision: ${name}`, [[6220, award], [1000, -award]]);
  S.board.conf = clamp(S.board.conf - 5, 0, 100);
  const c = S.cases.find((x) => x.id === ev.case); if (c) c.settled = true;
  done('NLRC decision', `After months of hearings the Labor Arbiter ruled against you.\nAward: ${peso(award)}\nLawyer: ${peso(lawyer)}`, '\u{1F3DB}️');
}
function doleScene() {
  const issues = [];
  const unreg = active().filter((e) => !e.registered);
  if (unreg.length) issues.push({ t: `${unreg.length} employee(s) not registered with SSS/PhilHealth/Pag-IBIG`, amt: unreg.reduce((s, e) => s + Math.round((S.day - e.hired) / 30 + 1) * 2300, 0) });
  const late = S.due.filter((x) => !x.paid && x.due < S.day && ['sss', 'ph', 'hd'].includes(x.kind));
  if (late.length) issues.push({ t: 'Unremitted contributions', amt: 5000 });
  if (monthOf(S.day) >= 1 && !S.flags['paid13_' + (yearOf(S.day) - 1)] && S.years[yearOf(S.day) - 1] && active().length && S.day < dayFromYMD(yearOf(S.day), 6, 30)) issues.push({ t: 'Unpaid 13th month pay', amt: Math.round(-bal(2170)) });
  if (S.payrollLate > 0.5) issues.push({ t: 'Late payment of wages', amt: 10000 });
  const below = active().filter((e) => e.rate < minWage());
  if (below.length) issues.push({ t: 'Paying below minimum wage', amt: below.length * 8000 });
  const total = issues.reduce((s, x) => s + x.amt, 0);
  if (!issues.length) { S.board.conf = clamp(S.board.conf + 2, 0, 100); return done('DOLE inspection: compliant!', 'The Labor Laws Compliance Officer checked payroll, 13th month, contributions and minimum wage. Walang violation. \u{1F44F}', '⚖️'); }
  scene({ em: '⚖️', title: 'DOLE labor inspection', sub: 'Notice of Inspection Results', body: issues.map((x) => `• ${x.t}: ${peso(x.amt)}`).join('\n') + `\n\nRestitution and fines: ${peso(total)}. Correct within 10 days or get a Compliance Order.`,
    choices: [{ label: `Comply and pay ${peso(total)}`, cls: 'primary', fn: () => { post('DOLE restitution and penalties', [[6220, total], [1000, -total]]); for (const e of unreg) e.registered = true; S.policy.register = true; S.payrollLate = 0; S.board.conf = clamp(S.board.conf - 3, 0, 100); done('Complied', 'Everyone is now registered and paid properly.'); } },
      { label: 'Contest with a lawyer (₱20,000)', sub: '40% chance to cut it in half', fn: () => { const f = chance(0.4) ? 0.5 : 1.2; const tot = Math.round(total * f); post('Labor lawyer', [[6170, 20000], [1000, -20000]]); post('DOLE compliance order', [[6220, tot], [1000, -tot]]); for (const e of unreg) e.registered = true; S.policy.register = true; S.board.conf = clamp(S.board.conf - 4, 0, 100); done(f < 1 ? 'Nabawasan' : 'Lumala pa', `Paid ${peso(tot)}.`); } }] });
}

// --- trading: pitch, client, collect, negotiate ---
function pitchScene(p) {
  let pc = pitchChance(p), terms = p.terms, disc = false;
  const draw = () => {
    const nodes = [el(`<div class="note b">${CLIENT_TYPES[p.type].label} · orders about ${CLIENT_TYPES[p.type].size} cases every ${CLIENT_TYPES[p.type].freq} days · asks for ${p.terms ? p.terms + '-day terms' : 'cash on delivery'}</div>`), el(`<div class="speech">"Magkano ang bigas at de lata mo? Mas mura ba kaysa sa supplier ko ngayon?"</div>`), meter('Chance to win them', pc * 100, 100)];
    scene({ em: '\u{1F454}', title: `Sales call: ${esc(p.name)}`, nodes, choices: [
      { label: terms === p.terms ? `Agree to ${p.terms ? p.terms + '-day terms' : 'COD'}` : 'Back to their terms', sub: 'Longer terms tie up your cash', fn: () => { terms = p.terms; pc = pitchChance(p); draw(); } },
      { label: 'Insist on cash on delivery', sub: 'Safer cash flow, lower chance', dis: !p.terms, fn: () => { terms = 0; pc = pitchChance(p) * 0.6; draw(); } },
      { label: disc ? 'Intro discount offered' : 'Offer a 3% discount on the first order', sub: 'Better chance', dis: disc, fn: () => { disc = true; pc = Math.min(0.95, pc + 0.15); draw(); } },
      { label: 'Close the deal', cls: 'primary', fn: () => { if (chance(pc)) { p.terms = terms; addClient(p); S.flags.pitched = true; if (disc) post(`Intro discount: ${p.name}`, [[6130, 1500], [1000, -1500]]); done('Deal!', `${esc(p.name)} is now your client.`, '\u{1F91D}'); } else { S.prospects = S.prospects.filter((x) => x !== p); done('Hindi pumayag', `"Pag-iisipan ko muna." ${esc(p.name)} stays with their supplier.`, '\u{1F614}'); } } },
      { label: 'Later', fn: closeS }] });
  };
  draw();
}
function clientScene(c) {
  scene({ em: '\u{1F3EA}', title: esc(c.name), sub: `${CLIENT_TYPES[c.type].label} · client since ${fshort(c.since)}`, nodes: [meter('Loyalty', c.loyal, 100), el(`<div class="note b">Terms: ${c.terms ? c.terms + ' days' : 'COD'} · total bought ${peso(Math.round(c.bought))}</div>`)],
    choices: [{ label: 'Change to COD', sub: 'Safer, but they may order less', dis: !c.terms, fn: () => { c.terms = 0; c.loyal -= 10; clientScene(c); } }, { label: 'Give 15-day terms', fn: () => { c.terms = 15; c.loyal += 5; clientScene(c); } }, { label: 'Give 30-day terms', fn: () => { c.terms = 30; c.loyal += 8; clientScene(c); } }, { label: 'Visit and treat them to merienda (₱500)', sub: 'Loyalty +10', fn: () => { post('Client visit', [[6130, 500], [1000, -500]]); c.loyal = clamp(c.loyal + 10, 0, 100); clientScene(c); } }, { label: 'Close', cls: 'primary', fn: closeS }] });
}
function collectScene(arId) {
  const a = S.ar.find((x) => x.id === arId); if (!a) return closeS();
  const c = S.clients.find((x) => x.id === a.c) || { name: 'Former client', rel: 0.5, loyal: 0 };
  const amt = Math.round(a.amt - a.paid), late = S.day - a.due;
  const got = (f, memo, disc) => { const cashIn = Math.round(amt * f); const lines = [[1000, cashIn], [1100, -amt]]; if (disc) lines.push([4000, amt - cashIn]); post(memo, lines); a.paid = a.amt; S.ar = S.ar.filter((x) => x !== a); };
  scene({ em: '\u{1F9FE}', title: `Collection visit: ${esc(c.name)}`, sub: `${peso(amt)} · ${late} days overdue`, nodes: [el(`<div class="speech">"Boss, pasensya na, mahina ang benta ngayon..."</div>`)],
    choices: [
      { label: 'Friendly reminder', sub: 'Keeps the relationship', fn: () => { if (chance(c.rel * 0.45)) { got(1, `Collection: ${c.name}`); done('Nagbayad!', `Collected ${peso(amt)}.`, '\u{1F4B5}'); } else { a.due = S.day + 7; done('Next week daw', 'They promised to pay in 7 days.', '\u{1F937}'); } } },
      { label: 'Offer 5% discount if paid in full today', sub: 'Dr Cash, Dr Sales discount, Cr AR', fn: () => { if (chance(Math.min(0.9, c.rel + 0.1))) { got(0.95, `Collection with 5% discount: ${c.name}`, true); done('Bayad na!', `Collected ${peso(Math.round(amt * 0.95))}.`, '\u{1F4B5}'); } else { a.due = S.day + 7; done('Wala talagang pera', 'Try again next week.'); } } },
      { label: 'Agree a 3-month payment plan', fn: () => { const part = Math.round(amt / 3); a.amt = a.paid + part; S.ar.push({ id: uid(), c: a.c, amt: part, due: S.day + 30, d: S.day, paid: 0 }, { id: uid(), c: a.c, amt: amt - 2 * part, due: S.day + 60, d: S.day, paid: 0 }); a.due = S.day; c.rel = Math.min(0.97, c.rel + 0.15); done('Payment plan signed', 'Three installments, monthly.'); } },
      { label: 'Send a demand letter (lawyer ₱3,000)', sub: 'Loyalty −20', fn: () => { post('Demand letter', [[6170, 3000], [1000, -3000]]); c.loyal -= 20; if (chance(0.65)) { got(1, `Collection after demand letter: ${c.name}`); done('Bayad!', `Collected ${peso(amt)}.`); } else { a.due = S.day + 30; done('No response', 'Consider writing it off if it drags on.'); } } },
      { label: 'Later', fn: closeS }] });
}
function negotiateScene(st) {
  st = st || { disc: 0, pat: 3, used: [] };
  const T = [
    { id: 'volume', l: 'Commit to bigger monthly volume', d: 0.012, p: 0 },
    { id: 'cash', l: 'Pay cash on delivery always', d: 0.008, p: 0 },
    { id: 'rival', l: '"Mas mura ang offer ng kabilang supplier"', d: 0.015, p: 1, risk: 0.35 },
    { id: 'loyal', l: '6-month exclusive supply agreement', d: 0.01, p: 0 },
    { id: 'push', l: 'Push hard: "5% or we walk"', d: 0.025, p: 2, risk: 0.5 }];
  if (st.pat <= 0) { const d = Math.min(0.04, st.disc); if (d > 0) { S.supplier.disc = d; S.supplier.discUntil = S.day + 90; } return done(d > 0 ? 'Deal!' : 'Walang deal', d > 0 ? `${(d * 100).toFixed(1)}% discount on all purchases for 90 days.` : 'The supplier walked out.', d > 0 ? '\u{1F91D}' : '\u{1F612}'); }
  scene({ em: '\u{1F69A}', title: 'Supplier negotiation', sub: `Patience ${'♥'.repeat(st.pat)}${'♡'.repeat(Math.max(0, 3 - st.pat))} · discount so far ${(st.disc * 100).toFixed(1)}%`, body: 'The supplier’s area sales manager is here for the quarterly review. Pick your arguments.',
    choices: T.filter((t) => !st.used.includes(t.id)).map((t) => ({ label: t.l, fn: () => { st.used.push(t.id); st.pat--; if (t.risk && chance(t.risk)) { st.pat = 0; st.disc = Math.max(0, st.disc - 0.01); } else st.disc += t.d; negotiateScene(st); } }))
      .concat([{ label: `Accept ${(st.disc * 100).toFixed(1)}% now`, cls: 'primary', fn: () => { st.pat = 0; negotiateScene(st); } }]) });
}

// --- board meeting (hands-on) ---
function boardScene(ev) {
  const res = quarterResults(ev.y, ev.q), Qs = boardQuestions(res);
  let correct = 0, i = 0;
  const is = res.is;
  const nodes = [fsTable([[`Q${ev.q} ${ev.y} results`, '', 'h'], ['Sales', is.sales], ['Target', res.t.rev, 'i'], ['Net income', is.net], ['Target', res.t.ni, 'i'], ['Cash today', res.cashEnd, 's']]),
    el(`<div class="note ${res.overdue || res.cases ? 'r' : 'g'}">Headcount ${res.head} · ${IND().channel === 'b2b' ? 'client loyalty' : 'reputation'} ${res.rep} · compliance issues ${res.overdue} · open labor complaints ${res.cases}</div>`)];
  const ask = () => {
    if (i >= Qs.length) return outcome();
    const q = Qs[i];
    scene({ em: '\u{1F3DB}️', title: `Board meeting: question ${i + 1} of ${Qs.length}`, sub: esc(S.board.inv), nodes: [el(`<div class="speech">"${esc(q.q)}"</div>`)], choices: q.opts.map((o) => ({ label: esc(o), fn: () => { const ok = o === q.ans; if (ok) correct++; i++; scene({ em: ok ? '\u{1F44D}' : '\u{1F928}', title: ok ? 'Tama' : 'Hmm...', body: ok ? 'The board nods.' : `The CFO corrects you: ${esc(q.ans)}.`, choices: [{ label: 'Next', cls: 'primary', fn: ask }] }); } })) });
  };
  const outcome = () => {
    const r = boardOutcome(res, correct, Qs.length);
    const fired = S.flags.lowConf >= 2;
    if (fired) { gameOver('board'); return gameOverScene(); }
    const ch = [];
    ch.push({ label: 'Request more capital from investors', sub: S.board.conf >= 55 ? 'Board confidence is high enough' : 'Needs confidence 55+', dis: S.board.conf < 55, fn: () => { const amt = Math.round(Math.max(200000, balanceSheet().TE * 0.3) / 50000) * 50000; capitalCall(amt); done('Approved!', `${peso(amt)} capital infusion received for new shares.`, '\u{1F4B0}'); } });
    ch.push({ label: 'Request approval for big purchases this quarter', sub: 'Expansions over ₱300k need board approval', dis: S.board.conf < 40, fn: () => { S.flags.capexOk = true; S.flags.capexUntil = S.day + 90; done('Approved', 'You may expand this quarter.'); } });
    const re = -bal(3100) - (balanceSheet().ni < 0 ? -balanceSheet().ni : 0);
    if (re > 50000 && cash() > 150000) ch.push({ label: `Declare dividends of ${peso(Math.round(re * 0.3 / 1000) * 1000)}`, sub: 'From retained earnings. Investors love it.', fn: () => { declareDividend(Math.round(re * 0.3 / 1000) * 1000); S.board.conf = clamp(S.board.conf + 8, 0, 100); done('Dividends declared', 'Cash paid to shareholders by ownership %.', '\u{1F389}'); } });
    ch.push({ label: 'Adjourn', cls: 'primary', fn: closeS });
    scene({ em: r.dc >= 0 ? '\u{1F600}' : '\u{1F620}', title: 'Board decision', body: `You answered ${correct} of ${Qs.length} correctly.\nConfidence ${r.dc >= 0 ? '+' : ''}${Math.round(r.dc)} → ${Math.round(S.board.conf)}%\n\nNext quarter targets:\nSales ${peso(r.next.rev)}\nNet income ${peso(r.next.ni)}${S.board.conf < 20 ? '\n\n⚠ The board warns: one more bad quarter and you are replaced.' : ''}`, choices: ch });
  };
  scene({ em: '\u{1F3DB}️', title: `Quarterly board meeting`, sub: `Q${ev.q} ${ev.y} · ${esc(S.board.inv)}`, nodes, choices: [{ label: 'Present the results', cls: 'primary', fn: ask }] });
}
function yearScene(y, browse) {
  const Y = S.years[y]; if (!Y) return closeS();
  const is = Y.is, bs = Y.bs, cf = Y.cf;
  const nodes = [
    el(`<div class="note ${Y.grade <= 'B' ? 'g' : Y.grade === 'C' ? 'y' : 'r'}" style="font-size:16px"><b>Grade ${Y.grade}</b> · ${Y.grade === 'A' ? 'Outstanding year!' : Y.grade === 'B' ? 'Solid year.' : Y.grade === 'C' ? 'Survived, with lessons.' : 'Tough year.'}</div>`),
    fsTable([['Income statement', '', 'h'], ['Sales', is.sales, 'i'], ['Gross profit', is.gross, 'i'], ['Operating expenses', -is.totalOpex, 'i'], ['Income tax', -is.tax, 'i'], ['Net income', is.net, 't']]),
    fsTable([['Balance sheet (Dec 31)', '', 'h'], ['Total assets', bs.TA, 'i'], ['Total liabilities', bs.TL, 'i'], ['Total equity', bs.TE, 's']]),
    fsTable([['Cash flows', '', 'h'], ['Operations', cf.opIn - cf.opOut, 'i'], ['Investing', cf.inv, 'i'], ['Financing', cf.fin, 'i']]),
    el(`<div class="note b">Employees ${Y.headcount} · hired ${Y.hires} · resigned ${Y.quits} · dismissed ${Y.fired} · AWOL ${Y.awol}\n${IND().channel === 'b2b' ? 'Deliveries ' + Y.kp.deliveries + ' cases' : 'Customers served ' + Y.kp.served.toLocaleString()} · penalties ${peso(Math.round(Y.penalties))}\nBoard confidence ${Y.conf}%${is.sales ? ` · net margin ${pct(is.net / is.sales)}` : ''}</div>`)];
  const ch = [{ label: browse ? 'Close' : 'Continue to the new year', cls: 'primary', fn: closeS }];
  if (!browse) nodes.push(el(`<div class="note">New year to-do: renew your business permit by Jan 20, file the annual ITR (1702-RT) and audited financial statements by April 15.</div>`));
  scene({ em: '\u{1F4D8}', title: `${y} Annual Report`, sub: esc(S.company), nodes, choices: ch });
}
function gameOverScene() {
  sfx('bad');
  const why = { board: 'The board voted to replace you as President. Tito Ramon shook your hand: "Salamat sa lahat, pero kailangan namin ng bagong direksyon."', insolvent: 'The company ran out of cash for 30 days and could not pay its obligations. The board filed for rehabilitation.' }[S.over] || 'Game over.';
  scene({ em: '\u{1F3C1}', title: 'Tapos na ang laban', body: `${why}\n\nYou ran ${esc(S.company)} for ${S.day - S.start} days.`, choices: [{ label: 'Start a new business', cls: 'primary', fn: () => { save(); showTitle(); newBusiness(); } }, { label: 'Look at the books one last time', fn: () => { $('modal').classList.add('hide'); } }] });
}

// --- mini game: rush hour ---
function rushGame() {
  const I = IND(), keys = Object.keys(I.lines).filter((k) => !I.lines[k].needs || hasAsset(I.lines[k].needs)).slice(0, 4);
  const EM = { ulam: '\u{1F35B}', silog: '\u{1F373}', merienda: '\u{1F35C}', drinks: '\u{1F964}', pandesal: '\u{1F35E}', spanish: '\u{1F950}', ensaymada: '\u{1F9C1}', loaf: '\u{1F35E}', cake: '\u{1F370}', staples: '\u{1F35A}', snacks: '\u{1F36A}', care: '\u{1F9F4}', frozen: '\u{1F9CA}', load: '\u{1F4F1}' };
  const faces = ['\u{1F468}', '\u{1F469}', '\u{1F474}', '\u{1F475}', '\u{1F466}', '\u{1F467}', '\u{1F477}', '\u{1F46E}'];
  let t = 25, served = 0, wrong = 0, cur = null, got = {};
  const newCust = () => { cur = { face: pick(faces), order: {} }; const n = irnd(1, 3); for (let i = 0; i < n; i++) { const k = pick(keys); cur.order[k] = (cur.order[k] || 0) + 1; } got = {}; };
  newCust();
  const draw = () => {
    const P = $('sheet'); P.textContent = '';
    P.appendChild(el(`<div class="head"><div class="em">\u{1F525}</div><div><h2>Served: ${served}</h2><small>${t}s left · mistakes ${wrong}</small></div></div>`));
    const R = el('<div class="rush"></div>');
    R.appendChild(el(`<div class="timer"><i style="width:${t / 25 * 100}%"></i></div>`));
    const C = el(`<div class="cust"><div class="face">${cur.face}</div><div class="order"></div></div>`);
    for (const k in cur.order) for (let i = 0; i < cur.order[k]; i++) C.querySelector('.order').appendChild(el(`<span class="${(got[k] || 0) > i ? 'ok' : ''}">${EM[k] || '\u{1F4E6}'} ${esc(I.lines[k].name.split(' ')[0])}</span>`));
    R.appendChild(C);
    const K = el('<div class="keys"></div>');
    for (const k of keys) { const b = el(`<button type="button">${EM[k] || '\u{1F4E6}'}<br>${esc(I.lines[k].name.split(' (')[0])}</button>`); b.addEventListener('click', () => tapItem(k)); K.appendChild(b); }
    R.appendChild(K);
    P.appendChild(R);
  };
  const tapItem = (k) => {
    if ((got[k] || 0) < (cur.order[k] || 0)) { got[k] = (got[k] || 0) + 1; if (Object.keys(cur.order).every((x) => (got[x] || 0) >= cur.order[x])) { sellRush(cur.order); served++; newCust(); } }
    else { wrong++; }
    draw();
  };
  const sellRush = (order) => {
    let gross = 0, cost = 0, vat = 0;
    for (const k in order) { const n = order[k]; if (I.mode !== 'service' && stockQty(k) < n) continue; cost += I.mode === 'service' ? n * lineCost(k) : takeStock(k, n); gross += n * S.price[k]; if (vatable(k)) vat += n * S.price[k] / 1.12 * 0.12; }
    if (!gross) return;
    post('Rush hour sales (owner at the counter)', [[1000, gross], [4000, -(gross - vat)], [2150, -vat]]);
    post('Cost of rush hour sales', [[5000, cost], [1200, -cost]]);
    S.rushGross = (S.rushGross || 0) + gross;
  };
  S.rushGross = 0;
  draw();
  clearInterval(UI.game);
  UI.game = setInterval(() => { t--; if (t <= 0) { clearInterval(UI.game); S.rushBonus = Math.max(-2, served * 0.25 - wrong * 0.3); done('Rush over!', `You served ${served} customers (${peso(Math.round(S.rushGross))} extra sales) with ${wrong} mistakes.\nReputation ${S.rushBonus >= 0 ? '+' : ''}${S.rushBonus.toFixed(1)}`, served >= 8 ? '\u{1F3C6}' : '\u{1F44D}'); } else draw(); }, 1000);
}
// --- mini game: count the cash drawer ---
function cashGame() {
  const bills = [1000, 500, 200, 100, 50, 20], coins = [20, 10, 5, 1];
  const pile = []; let total = 0;
  const n = irnd(14, 24);
  for (let i = 0; i < n; i++) { const b = pick(bills.concat(bills.slice(2))); pile.push(b); total += b; }
  for (let i = 0; i < irnd(4, 9); i++) { const c = pick(coins); pile.push('c' + c); total += c; }
  pile.sort(() => Math.random() - 0.5);
  const short = S.shortage && S.shortage > 0 ? Math.min(S.shortage, Math.round(total * 0.3 / 10) * 10 || 100) : 0;
  const expected = total + short;
  let typed = '', t = 45;
  const draw = () => {
    const P = $('sheet'); P.textContent = '';
    P.appendChild(el(`<div class="head"><div class="em">\u{1F4B5}</div><div><h2>Bilangin ang kaha</h2><small>${t}s · POS says the drawer should have ${peso(expected)}</small></div></div>`));
    const D = el('<div class="drawer"></div>');
    for (const x of pile) D.appendChild(typeof x === 'string' ? el(`<i class="c">${x.slice(1)}</i>`) : el(`<i class="b${x}">₱${x}</i>`));
    P.appendChild(D);
    P.appendChild(el(`<div class="display">₱${typed || '0'}</div>`));
    const pad = el('<div class="pad"></div>');
    for (const k of ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '✔']) { const b = el(`<button type="button" class="${k === '✔' ? 'primary' : ''}">${k}</button>`); b.addEventListener('click', () => { if (k === 'C') typed = ''; else if (k === '✔') return finish(); else if (typed.length < 6) typed += k; draw(); }); pad.appendChild(b); }
    P.appendChild(pad);
  };
  const finish = () => {
    clearInterval(UI.game);
    const v = +typed;
    if (v !== total) return done('Mali ang bilang', `You counted ${peso(v)}, the drawer actually has ${peso(total)}. Count slowly: bills first, then coins.`, '\u{1F635}');
    if (!short) return done('Tama! Balanse ang kaha', `${peso(total)}: exactly what the POS says. \u{1F44C}`);
    const sus = (S.suspects || []).map(empOf).filter(Boolean).filter((e) => e.status !== 'gone');
    const cnt = {}; for (const e of sus) cnt[e.id] = (cnt[e.id] || 0) + 1;
    const top = sus.sort((a, b) => cnt[b.id] - cnt[a.id])[0];
    S.shortage = 0; S.suspects = [];
    if (top) { openCase(top, 'theft', { amt: short, evidence: cnt[top.id] >= 2 }); return done('Kulang ng ' + peso(short) + '!', `Your count is right, so money is missing. The shortages keep happening on ${esc(top.name)}'s shifts. An HR case was opened: follow due process.`, '\u{1F6A8}'); }
    done('Kulang!', `Short by ${peso(short)} but no clear suspect. Consider CCTV or a POS.`, '\u{1F6A8}');
  };
  draw();
  clearInterval(UI.game);
  UI.game = setInterval(() => { t--; if (t <= 0) { clearInterval(UI.game); done('Time’s up', 'You ran out of time. Practice makes perfect.', '⏰'); } else { const h = document.querySelector('#sheet .head small'); if (h) h.textContent = `${t}s · POS says the drawer should have ${peso(expected)}`; } }, 1000);
}

// ---------- PWA: offline + updates (skipped inside sandboxed previews) ----------
function setupPWA() {
  try {
    if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/localhost/.test(location.href)) return;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {   // always check the server for a new version
      const offer = (w) => { $('updBar').classList.remove('hide'); $('btnUpd').onclick = () => { if (S) save(); w.postMessage('skipWaiting'); }; };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });   // check again whenever the app comes back to the front
    }).catch(() => {});
    // reload only when an update replaces a running version, not on the very first install
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  } catch (e) { /* not available here */ }
}
setupPWA();
// ---------- boot ----------
document.addEventListener('visibilitychange', () => { if (document.hidden && S) save(); });
showTitle();
window.__G = { get S() { return S; }, render, pump, step, nextDay, HANDLERS };
