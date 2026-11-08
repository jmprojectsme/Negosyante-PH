/* Negosyante PH: simulation engine (state, calendar, accounting, payroll, HR, operations, taxes, board). */
'use strict';

const SAVE_KEY = 'negosyante:save';
let S = null;

// ---------- small helpers ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const chance = (p) => Math.random() < p;
const r2 = (n) => Math.round(n * 100) / 100;
const uid = () => Math.random().toString(36).slice(2, 9);
const peso = (n, dec) => (n < 0 ? '-' : '') + '₱' + Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 });
const pesoK = (n) => Math.abs(n) >= 1e6 ? (n < 0 ? '-' : '') + '₱' + (Math.abs(n) / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? (n < 0 ? '-' : '') + '₱' + (Math.abs(n) / 1e3).toFixed(1) + 'k' : peso(Math.round(n));

// ---------- calendar (day 0 = Jan 1, 2027) ----------
const EPOCH = Date.UTC(2027, 0, 1);
const dateOf = (d) => new Date(EPOCH + d * 864e5);
const ymd = (d) => dateOf(d).toISOString().slice(0, 10);
const ym = (d) => ymd(d).slice(0, 7);
const yearOf = (d) => dateOf(d).getUTCFullYear();
const monthOf = (d) => dateOf(d).getUTCMonth() + 1;
const dom = (d) => dateOf(d).getUTCDate();
const dow = (d) => dateOf(d).getUTCDay();
const dayOfStr = (s) => Math.round((Date.parse(s + 'T00:00:00Z') - EPOCH) / 864e5);
const lastDom = (d) => { const t = dateOf(d); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); };
const isMonthEnd = (d) => dom(d) === lastDom(d);
const MONTHS = ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'];
const DAYS = ['Lin', 'Lun', 'Mar', 'Miy', 'Huw', 'Biy', 'Sab'];
const fdate = (d) => `${DAYS[dow(d)]}, ${MONTHS[monthOf(d) - 1]} ${dom(d)}, ${yearOf(d)}`;
const fshort = (d) => `${MONTHS[monthOf(d) - 1]} ${dom(d)}`;
const ymLabel = (k) => `${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}`;
const holCache = {};
function holidayOn(d) { const y = yearOf(d); if (!holCache[y]) holCache[y] = holidaysOf(y); return holCache[y][ymd(d)] || null; }
const dayFromYMD = (y, m, dd) => Math.round((Date.UTC(y, m - 1, dd) - EPOCH) / 864e5);

// ---------- industry access ----------
const IND = () => INDUSTRIES[S.ind];
const allRoles = () => Object.assign({}, IND().roles, COMMON_ROLES);
const roleDef = (r) => allRoles()[r];
const active = () => S.emps.filter((e) => e.status !== 'gone');
const headcount = () => active().length;
const isRetailService = () => IND().wageClass === 'small';
function minWage(d, cls) {
  d = d == null ? S.day : d;
  const k = ymd(d);
  let w = LAW.wage[0];
  for (const x of LAW.wage.concat(S.wageOrders || [])) if (x.from <= k && x.from >= w.from) w = x;
  const small = (cls || IND().wageClass) === 'small' && headcount() <= LAW.smallRetailMax;
  return small ? w.small : w.nonagri;
}
const marketWage = (role) => Math.round(Math.max(minWage(), (roleDef(role).wage || 0) * (S.wageIndex || 1)));
const holidayCovered = () => !isRetailService() || headcount() >= LAW.holidayExemptBelow;
function taxSize() {   // EOPT classification by gross sales
  const g = trailingSales(365);
  return g < 3e6 ? 'Micro' : g < 2e7 ? 'Small' : g < 1e9 ? 'Medium' : 'Large';
}
function msmeSize() {
  const assets = totalAssets(), n = headcount();
  if (assets > 1e8 || n >= 200) return 'Large';
  if (assets > 1.5e7 || n >= 100) return 'Medium';
  if (assets > 3e6 || n >= 10) return 'Small';
  return 'Micro';
}

// ---------- accounting ----------
const acctName = (a) => (ACCOUNTS[a] || ['?'])[0];
const bal = (a) => S.gl[a] || 0;   // debit-positive
const isPL = (a) => a >= 4000;
function mon(k) {
  k = k || ym(S.day);
  if (!S.mon[k]) S.mon[k] = { pl: {}, cf: { opIn: 0, opOut: 0, inv: 0, fin: 0 }, k: { cust: 0, served: 0, lost: 0, units: 0, lostUnits: 0, sales: 0, deliveries: 0 } };
  return S.mon[k];
}
// lines: [[account, amount]] amount > 0 debit, < 0 credit
function post(memo, lines, tag, closing) {
  lines = lines.filter((l) => Math.abs(l[1]) >= 0.005).map((l) => [l[0], r2(l[1])]);
  const sum = r2(lines.reduce((a, l) => a + l[1], 0));
  if (Math.abs(sum) > 1) { console.error('Unbalanced entry', memo, lines, sum); return false; }   // centavo rounding is absorbed below
  if (Math.abs(sum) > 0) lines[lines.length - 1][1] = r2(lines[lines.length - 1][1] - sum);
  const M = mon();
  for (const [a, v] of lines) {
    S.gl[a] = r2((S.gl[a] || 0) + v);
    if (isPL(a) && !closing) { const t = ACCOUNTS[a][1]; M.pl[a] = r2((M.pl[a] || 0) + (t === 'R' ? -v : v)); }
    if (+a === 1000) {
      const k = tag || 'op';
      if (k === 'op') { if (v > 0) M.cf.opIn += v; else M.cf.opOut -= v; } else M.cf[k] += v;
    }
  }
  S.journal.unshift({ d: S.day, memo, lines });
  if (S.journal.length > 500) S.journal.length = 500;
  return true;
}
const cash = () => bal(1000);
function totalAssets() { let t = 0; for (const a in S.gl) { const ty = ACCOUNTS[a] && ACCOUNTS[a][1]; if (ty === 'A' || ty === 'XA') t += S.gl[a]; } return t; }
function sumPL(keys, accts) {   // P&L totals over a set of month keys
  const out = {};
  for (const k of keys) { const M = S.mon[k]; if (!M) continue; for (const a in M.pl) out[a] = (out[a] || 0) + M.pl[a]; }
  return accts ? accts.reduce((s, a) => s + (out[a] || 0), 0) : out;
}
function incomeStatement(keys) {
  const p = sumPL(keys);
  const g = (a) => r2(p[a] || 0);
  const sales = g(4000), cogs = g(5000), gross = sales - cogs;
  const opex = OPEX.map((a) => [a, g(a)]).filter((x) => x[1]);
  const totalOpex = opex.reduce((s, x) => s + x[1], 0);
  const opInc = gross - totalOpex, other = g(4100), interest = g(6180);
  const pretax = opInc + other - interest, tax = g(7000), net = pretax - tax;
  return { sales, cogs, gross, opex, totalOpex, opInc, other, interest, pretax, tax, net };
}
function balanceSheet() {
  const g = (a) => r2(S.gl[a] || 0);
  const ni = r2(-Object.keys(S.gl).filter((a) => isPL(+a)).reduce((s, a) => s + S.gl[a], 0));   // current year earnings (not yet closed)
  const ca = [[1000, g(1000)], [1100, g(1100)], [1110, g(1110)], [1200, g(1200)], [1300, g(1300)], [1310, g(1310)]].filter((x) => x[1]);
  const nca = [[1400, g(1400)], [1500, g(1500)], [1510, g(1510)]].filter((x) => x[1]);
  const cl = [2000, 2100, 2110, 2120, 2130, 2140, 2150, 2160, 2170, 2180].map((a) => [a, -g(a)]).filter((x) => x[1]);
  const ncl = [[2200, -g(2200)]].filter((x) => x[1]);
  const eq = [[3000, -g(3000)], [3100, -g(3100)], [3200, -g(3200)]].filter((x) => x[1]);
  const sum = (arr) => arr.reduce((s, x) => s + x[1], 0);
  const TA = sum(ca) + sum(nca), TL = sum(cl) + sum(ncl), TE = sum(eq) + ni;
  return { ca, nca, cl, ncl, eq, ni, TA: r2(TA), TL: r2(TL), TE: r2(TE), tca: sum(ca), tcl: sum(cl) };
}
function cashFlow(keys) {
  const c = { opIn: 0, opOut: 0, inv: 0, fin: 0 };
  for (const k of keys) { const M = S.mon[k]; if (!M) continue; for (const x in c) c[x] += M.cf[x]; }
  return c;
}
const monthsOfYear = (y) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
const monthsOfQuarter = (y, q) => [1, 2, 3].map((i) => `${y}-${String((q - 1) * 3 + i).padStart(2, '0')}`);
function trailingSales(days) {   // gross sales incl. VAT over the last n days
  return S.salesLog.slice(-days).reduce((a, x) => a + x, 0);
}

// ---------- state ----------
function newGame(o) {
  const I = INDUSTRIES[o.ind], F = FUNDING.find((f) => f.id === o.fund);
  const invest = F.none ? 0 : I.invest[F.mult];
  S = {
    v: 1, personal: F.none ? (F.loan ? 100000 : 150000) : 100000, company: o.company, owner: o.owner, ind: o.ind, day: 3, start: 3, speed: 1,
    gl: {}, mon: {}, journal: [], salesLog: [], dailyLog: [],
    inv: {}, market: {}, price: {}, plan: {}, autoPlan: true, demandAvg: {},
    locs: [0], assets: [], emps: [], applicants: [], posts: [], cases: [], seq: 1,
    ownerRole: Object.keys(I.owner)[0],
    policy: { perks: {}, overtime: false, openHolidays: true, mkt: 0, register: true, autoReorder: o.ind === 'minimart' },
    rep: 50, wageIndex: 1, wageOrders: [], comp: null,
    clients: [], prospects: [], backlog: [], ar: [], ap: [], po: [], supplier: { terms: false, limit: 0, disc: 0, discUntil: 0, bought: 0, late: 0 },
    due: [], vat: false, vatSince: null, vatWarned: false,
    board: { inv: F.name, invId: F.id, strict: F.strict, conf: 60, seats: F.seats, targets: null, history: [], reportSent: {}, none: !!F.none },
    holders: F.none ? [{ name: o.owner + ' (ikaw)', amt: I.capital }] : [{ name: o.owner + ' (ikaw)', amt: I.capital }, { name: F.name, amt: invest }],
    loans: [], inbox: [], queue: [], years: {}, flags: {}, stats: { hires: 0, quits: 0, fired: 0, awol: 0, cases: 0 },
    utilAcc: 0, util13: {}, lastPayroll: null, payrollLate: 0, over: false, tutorial: 0
  };
  S.stage = 1; S.unlocked = []; S.contracts = []; S.offers = []; S.openings = [];
  applyUnlocks();
  for (const k in I.lines) {
    S.market[k] = 1; S.price[k] = I.lines[k].price; S.demandAvg[k] = 0;
    S.inv[k] = I.mode === 'prep' ? [] : { q: 0, c: I.lines[k].cost };
  }
  // capital and start-up costs
  post(F.none ? 'Owner\u2019s capital' : 'Paid-in capital from incorporators', [[1000, I.capital + invest], [3000, -(I.capital + invest)]], 'fin');
  if (F.loan) { const amt = I.invest[0], i = F.loan / 12, pmt = r2(amt * i / (1 - Math.pow(1 + i, -36))); S.loans.push({ id: uid(), name: 'Startup loan (bank)', bal: amt, rate: F.loan, pmt, months: 36 }); post('Startup loan proceeds', [[1000, amt], [2200, -amt]], 'fin'); }
  post('SEC registration, BIR, mayor’s permit, barangay clearance', [[6230, 18000], [1000, -18000]]);
  const L = I.locations[0];
  post(`Security deposit: ${L.name}`, [[1400, L.rent * L.deposit], [1000, -L.rent * L.deposit]], 'inv');
  for (const a of I.startAssets) buyAsset(a, true);
  if (o.ind === 'food' || o.ind === 'bakery') post('Kitchen tools, tables, utensils', [[1500, 40000], [1000, -40000]], 'inv');
  if (o.ind === 'minimart') post('Shelves, counter, signage', [[1500, 60000], [1000, -60000]], 'inv');
  if (o.ind === 'minimart') S.assets.push({ id: uid(), key: '_fit', cost: 60000, life: 60, bought: S.day, name: 'Shelves & fixtures' });
  if (o.ind === 'food' || o.ind === 'bakery') S.assets.push({ id: uid(), key: '_fit', cost: 40000, life: 60, bought: S.day, name: 'Kitchen tools & furniture' });
  payRent(true);
  if (I.channel === 'b2b') {
    for (let i = 0; i < 5; i++) S.clients.push(makeClient('small'));
    for (let i = 0; i < 3; i++) S.clients.push(makeClient('medium'));
    for (const c of S.clients) c.loyal = 70;
  }
  // starter stock so day one is playable
  if (I.mode === 'stock') {
    const target = I.channel === 'b2b' ? { bigas: 25, sardinas: 10, noodles: 20, mantika: 8, softdrinks: 15, kape: 6, asukal: 3, sabon: 8 } : null;
    for (const k in I.lines) {
      const n = target ? target[k] : Math.round(I.base * I.lines[k].p * (I.lines[k].q || 1) * 4);
      buyStock(k, n, true);
    }
  }
  if (!F.none) {
  S.board.targets = firstTargets();
    inbox('Board', `Welcome, President ${o.owner}!`, `${F.name} invested ${peso(invest)} for ${Math.round(invest / (invest + I.capital) * 100)}% of ${o.company}. Quarterly board meetings start in April. Send the monthly report by the 10th of every month.\n\nQ1 targets: sales ${peso(S.board.targets.rev)}, net income ${peso(S.board.targets.ni)}.`);
  } else inbox('Accountant', `Welcome, ${o.owner}!`, F.loan ? `The bank released ${peso(I.invest[0])}. Amortization of ${peso(S.loans[0].pmt)} is debited on the 1st of every month for 36 months. Miss it and cash goes negative.` : 'You started with your own savings. No board, no targets: just you and the bank account. Keep cash positive.');
  inbox('DOLE', 'Minimum wage update', `Wage Order NCR-27 second tranche takes effect January 20, 2027: ₱780/day (non-agriculture) and ₱743/day (retail/service with 15 or fewer workers). Employees below the new rate get adjusted automatically on that date, and you'll see it on the payroll.`);
  inbox('Accountant', 'Your compliance calendar', 'Every month: withholding tax (10th), Pag-IBIG (15th), SSS and PhilHealth (end of the following month). Every quarter: business tax (25 days after quarter end) and income tax (60 days). Yearly: permit renewal (Jan 20), 13th month (Dec 24), annual ITR (Apr 15). Hire a bookkeeper to have these paid automatically.');
  save();
  return S;
}
// ---------- save slots: several companies on one phone ----------
const SLOT_INDEX = 'negosyante:slots', SLOT_LAST = 'negosyante:last', MAX_SLOTS = 6;
const slotKey = (id) => 'negosyante:slot:' + id;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } };
function validSave(s) { return !!(s && s.v === 1 && INDUSTRIES[s.ind] && s.gl); }
function slotList() { try { const L = JSON.parse(lsGet(SLOT_INDEX) || '[]'); return Array.isArray(L) ? L : []; } catch (e) { return []; } }
function slotMeta(s) { return { id: s.slot, company: s.company, owner: s.owner, ind: s.ind, day: s.day, cash: Math.round((s.gl && s.gl[1000]) || 0), stage: s.stage || 1, over: s.over || null, saved: Date.now() }; }
function migrateSaves() {   // v1.x single save -> slot
  const old = lsGet(SAVE_KEY); if (!old) return;
  try { const s = JSON.parse(old); if (validSave(s)) { s.slot = s.slot || uid(); if (lsSet(slotKey(s.slot), JSON.stringify(s))) { lsSet(SLOT_INDEX, JSON.stringify([slotMeta(s)].concat(slotList().filter((x) => x.id !== s.slot)))); if (!lsGet(SLOT_LAST)) lsSet(SLOT_LAST, s.slot); } } } catch (e) { /* bad old save */ }
  lsDel(SAVE_KEY);
}
function save() {
  if (!S) return false;
  S.slot = S.slot || uid();
  if (!lsSet(slotKey(S.slot), JSON.stringify(S))) return false;
  lsSet(SLOT_INDEX, JSON.stringify([slotMeta(S)].concat(slotList().filter((x) => x.id !== S.slot))));
  lsSet(SLOT_LAST, S.slot);
  return true;
}
function load(id) {
  migrateSaves();
  id = id || lsGet(SLOT_LAST) || (slotList()[0] || {}).id; if (!id) return null;
  try { const s = JSON.parse(lsGet(slotKey(id)) || 'null'); return validSave(s) ? s : null; } catch (e) { return null; }
}
function deleteSlot(id) {
  lsDel(slotKey(id)); lsSet(SLOT_INDEX, JSON.stringify(slotList().filter((x) => x.id !== id)));
  if (lsGet(SLOT_LAST) === id) { const n = slotList()[0]; if (n) lsSet(SLOT_LAST, n.id); else lsDel(SLOT_LAST); }
}
function inbox(from, title, body, act) { S.inbox.unshift({ id: uid(), d: S.day, from, title, body, read: false, act: act || null }); if (S.inbox.length > 120) S.inbox.length = 120; }
function queue(ev) { ev.id = ev.id || uid(); S.queue.push(ev); }

// ---------- assets & locations ----------
function assetCount(key) { return S.assets.filter((a) => a.key === key).length; }
function hasAsset(key) { return S.assets.some((a) => a.key === key); }
function assetFlag(f) { return S.assets.reduce((m, a) => { const d = IND().assets[a.key]; return d && d[f] ? Math.max(m, d[f]) : m; }, 0); }
function buyAsset(key, free) {
  const A = IND().assets[key];
  if (A.service) { S.assets.push({ id: uid(), key, cost: 0, life: 1, bought: S.day, name: A.name }); return true; }
  post(`Bought ${A.name}`, [[1500, A.cost], [1000, -A.cost]], 'inv');
  S.assets.push({ id: uid(), key, cost: A.cost, life: A.life, bought: S.day, name: A.name, broken: 0 });
  return true;
}
function canBuyAsset(key) {
  const A = IND().assets[key];
  if (A.max && assetCount(key) >= A.max * (A.max > 1 ? 1 : 1)) return 'Max na';
  const tier = Math.max(...S.locs);
  if (A.tier && tier < A.tier) return 'Needs a bigger location';
  if (A.vehicle) { const slots = S.locs.reduce((s, t) => s + (IND().locations[t].slots || 0), 0); if (vehicles().length >= slots) return 'No parking/slot left'; }
  if (A.machine) { const slots = S.locs.reduce((s, t) => s + (IND().locations[t].slots || 0), 0); if (assetCount('washer') + assetCount('dryer') >= slots) return 'No space for more machines'; }
  if (A.oven) { const slots = S.locs.reduce((s, t) => s + (IND().locations[t].ovens || 0), 0); if (assetCount('oven') >= slots) return 'No space for another oven'; }
  if (!A.service && cash() < A.cost) return 'Kulang ang cash';
  if (A.cost >= 300000 && S.board.conf < 45 && !capexApproved()) return 'Needs board approval (confidence 45+)';
  return '';
}
const capexApproved = () => S.board.none || !!(S.flags.capexOk && S.day <= (S.flags.capexUntil || 0));
function sellAsset(id) {
  const a = S.assets.find((x) => x.id === id); if (!a) return;
  S.assets = S.assets.filter((x) => x !== a);
  if (!a.cost) return;
  const months = Math.min(a.life, Math.floor((S.day - a.bought) / 30)), dep = a.cost / a.life * months, book = a.cost - dep;
  const price = Math.round(book * 0.8);
  post(`Sold ${a.name}`, [[1000, price], [1510, dep], [6240, book - price], [1500, -a.cost]], 'inv');
}
const vehicles = () => S.assets.filter((a) => IND().assets[a.key] && IND().assets[a.key].vehicle && !a.broken);
function payRent(first) {
  let total = 0;
  for (const t of S.locs) total += IND().locations[t].rent;
  post(first ? 'Rent: first month' : `Rent for ${ymLabel(ym(S.day))}`, [[6100, total], [1000, -total]]);
}
function locationOptions() {
  const I = IND(), cur = S.locs[0];
  return I.locations.map((L, i) => {
    let block = '';
    if (i <= cur) block = i === cur ? 'Current' : 'Smaller';
    else if ((S.stage || 1) < i + 2) block = `Unlocks at stage ${i + 2}: ${STAGES[i + 1].name}. You are stage ${S.stage || 1}: tap the yellow stage badge at the top to see the goals.`;
    else if (L.need && L.need.clients && S.clients.length < L.need.clients) block = `Needs ${L.need.clients} clients`;
    const cost = L.rent * L.deposit + (I.channel === 'b2b' ? 50000 : 80000) * i;
    return { i, L, cost, block };
  });
}
function moveLocation(i) {
  const I = IND(), old = I.locations[S.locs[0]], L = I.locations[i];
  const fit = (I.channel === 'b2b' ? 50000 : 80000) * i;
  // old deposit comes back, new deposit and fit-out go out
  post(`Moved to ${L.name}: deposit refund`, [[1000, old.rent * old.deposit], [1400, -old.rent * old.deposit]], 'inv');
  post(`New location deposit: ${L.name}`, [[1400, L.rent * L.deposit], [1000, -L.rent * L.deposit]], 'inv');
  post('Renovation and fit-out', [[1500, fit], [1000, -fit]], 'inv');
  S.assets.push({ id: uid(), key: '_fit', cost: fit, life: 60, bought: S.day, name: 'Fit-out ' + L.name });
  S.locs[0] = i;
}
function branchCost() { const L = IND().locations[0]; return L.rent * L.deposit + 120000; }
function openBranch() {
  const L = IND().locations[0];
  post('New branch: deposit', [[1400, L.rent * L.deposit], [1000, -L.rent * L.deposit]], 'inv');
  post('New branch: fit-out and equipment', [[1500, 120000], [1000, -120000]], 'inv');
  S.assets.push({ id: uid(), key: '_fit', cost: 120000, life: 60, bought: S.day, name: `Branch ${S.locs.length + 1} fit-out` });
  S.locs.push(0);
}

// ---------- inventory ----------
const lineCost = (k) => IND().lines[k].cost * S.market[k] * (S.day < S.supplier.discUntil ? 1 - S.supplier.disc : 1);
const refPrice = (k) => Math.round(IND().lines[k].price * S.market[k]);
const vatable = (k) => S.vat && !IND().lines[k].vatFree;
function stockQty(k) { const x = S.inv[k]; return Array.isArray(x) ? x.reduce((s, l) => s + l.q, 0) : x.q; }
function stockValue() { let v = 0; for (const k in S.inv) { const x = S.inv[k]; v += Array.isArray(x) ? x.reduce((s, l) => s + l.q * l.c, 0) : x.q * x.c; } return v; }
function storageCap() { return S.locs.reduce((s, t) => s + (IND().locations[t].storage || 0), 0); }
function storageUsed() { let n = 0; for (const k in S.inv) n += stockQty(k) * (k === 'asukal' ? 2 : 1); return n; }
// buy for cash (or on supplier terms for trading)
function buyStock(k, n, now, onTerms) {
  if (n <= 0) return false;
  const unit = lineCost(k), gross = Math.round(unit * n);
  const input = S.vat && !IND().lines[k].vatFree && IND().mode !== 'prep' ? Math.round(gross / 1.12 * 0.12) : 0;   // VAT-registered suppliers
  const net = gross - input;
  const credit = onTerms ? 2000 : 1000;
  const lines = [[1200, net], [credit, -gross]]; if (input) lines.push([1300, input]);
  if (IND().channel === 'b2b' && !now) {   // supplier delivers tomorrow
    S.po.push({ k, n, unitNet: net / n, arrive: S.day + 1 });
    post(`PO: ${n} ${IND().lines[k].name}`, lines.map((l) => l[0] === 1200 ? [1200, l[1]] : l));
    S.inv[k].pending = (S.inv[k].pending || 0) + n;
    // inventory booked now (in transit), quantity arrives tomorrow
    S.inv[k].transit = (S.inv[k].transit || 0) + n;
  } else {
    post(`Bought ${n} ${IND().lines[k].name}`, lines);
    addStock(k, n, net / n);
  }
  if (onTerms) S.ap.push({ id: uid(), amt: gross, due: S.day + 30, memo: `${n} ${IND().lines[k].name}` });
  S.supplier.bought += gross;
  return true;
}
function addStock(k, n, unit) {
  const x = S.inv[k];
  if (Array.isArray(x)) x.push({ q: n, c: unit, age: 0 });
  else { x.c = (x.q * x.c + n * unit) / (x.q + n || 1); x.q += n; }
}
function takeStock(k, n) {   // returns cost of goods taken
  const x = S.inv[k]; let cost = 0;
  if (Array.isArray(x)) {
    x.sort((a, b) => b.age - a.age);
    for (const l of x) { if (n <= 0) break; const t = Math.min(n, l.q); l.q -= t; n -= t; cost += t * l.c; }
    S.inv[k] = x.filter((l) => l.q > 0.0001);
  } else { const t = Math.min(n, x.q); x.q -= t; cost = t * x.c; }
  return cost;
}

// ---------- staff ----------
function makeApplicant(role, q, forceProfile) {
  q = q || 0;
  // pick a background: fresh grads and people without experience are common
  let P = PROFILES.find((x) => x.id === forceProfile);
  const mix = (IND_HIRE[S.ind] || {}).mix || {}, wt = (x) => x.w * (mix[x.id] || 1) * (x.id === 'senior' ? 1 + q * 3 : 1);
  if (!P) { let r = Math.random() * PROFILES.reduce((s, x) => s + wt(x), 0); for (const x of PROFILES) { r -= wt(x); if (r <= 0) { P = x; break; } } P = P || PROFILES[0]; }
  const first = pick(FIRST), female = FEMALE.includes(first);
  const age = irnd(P.age[0], P.age[1]), exp = Math.min(irnd(P.exp[0], P.exp[1]), Math.max(0, age - 18));
  const skill = clamp(rnd(P.skill[0], P.skill[1]) + q * 0.5, 0.45, 1.35);
  const dist = pick(DISTANCE);
  const rel = clamp(rnd(P.rel[0], P.rel[1]) * dist.late / 0.96 + q * 0.1, 0.6, 0.995);
  const hon = clamp(rnd(0, 1) + q * 0.6, 0, 1), att = clamp(rnd(0.15, 1) + q * 0.3, 0, 1);
  const learn = rnd(P.learn[0], P.learn[1]), amb = rnd(P.amb[0], P.amb[1]);
  // work history: job hoppers have many short jobs
  const places = (PLACES[S.ind] || []).concat(PLACES.any), hist = [];
  if (exp > 0) {
    const hopper = rel < 0.85 && exp >= 2, n = hopper ? Math.min(4, exp + 1) : exp > 6 ? 2 : 1;
    let left = exp;
    for (let i = 0; i < n; i++) {
      const yrs = i === n - 1 ? left : Math.max(0.5, Math.round(left / (n - i) * rnd(0.6, 1.2) * 2) / 2);
      left = Math.max(0, left - yrs);
      hist.push({ place: pick(places), yrs: hopper ? Math.max(0.3, Math.round(yrs * 0.4 * 10) / 10) : yrs });
    }
  }
  const ojt = P.id === 'fresh' ? pick(places) : null;
  const edu = P.id === 'fresh' ? pick(EDU.fresh) : pick(EDU.other);
  const cert = (P.id !== 'nowork' && chance(0.25 + q + (P.id === 'senior' ? 0.3 : 0))) ? CERTS[role] : null;
  const leftWhy = exp === 0 ? null : pick(rel > 0.92 ? ['endo', 'closed', 'family', 'growth'] : rel > 0.85 ? ['far', 'pay', 'growth', 'endo'] : ['fired', 'conflict', 'awol', 'pay']);
  const mw = minWage();
  const ask = Math.max(mw, Math.round(marketWage(role) * rnd(P.askF[0], P.askF[1]) * (0.94 + (skill - 0.8) * 0.15) / 5) * 5);
  const floor = Math.max(mw, Math.round(ask * rnd(P.id === 'fresh' || P.id === 'nowork' ? 0.97 : 0.9, 1) / 5) * 5);   // lowest pay they'd accept
  return { id: uid(), name: `${first} ${pick(LAST)}`, female, role, skill, rel, hon, att, learn, amb, exp, ask, floor, age, prof: P.id, profLabel: P.label, edu, cert, hist, ojt, dist: dist.t, leftWhy, docs: chance(0.7),
    seen: { skill: false }, expires: S.day + irnd(4, 9), seed: Math.random() };
}
const hrOfficer = () => active().find((e) => e.role === 'hr' && e.status !== 'awol' && !(e.startOn > S.day));
// the HR officer interviews first: notes and a recommendation; the owner does the final interview
function hrScreen(a) {
  const h = hrOfficer(), sharp = clamp((h ? h.skill : 1), 0.6, 1.3);
  const noisy = (v) => clamp(v + rnd(-0.12, 0.12) / sharp, 0, 1.4);
  const sk = noisy(a.skill), rl = noisy(a.rel), hn = noisy(a.hon), at = noisy(a.att);
  const score = (sk - 0.5) * 0.9 + (rl - 0.75) * 2 + hn * 0.25 + at * 0.2;
  const notes = [];
  notes.push(sk > 1 ? 'Strong practical test.' : sk > 0.8 ? 'Practical test OK, needs some training.' : 'Weak practical test; will need a lot of training.');
  notes.push(rl > 0.92 ? 'References: very reliable.' : rl > 0.85 ? 'References: some absences before.' : 'References: history of absences.');
  if (hn < 0.3) notes.push('Gave an evasive answer about handling cash.');
  else if (hn > 0.7) notes.push('Honest answers on the cash scenario.');
  if (at > 0.7) notes.push('Good attitude, eager.'); else if (at < 0.3) notes.push('Seemed uninterested.');
  if (a.amb > 1.3) notes.push('Mentioned plans to go abroad.');
  a.hr = { score, notes, rec: score > 0.75 ? 'Highly recommended' : score > 0.55 ? 'Recommended' : 'For consideration', by: h ? h.name : 'HR' };
  a.seen.skill = true;
}
function postJob(role, chId) {
  const ch = JOB_CHANNELS.find((c) => c.id === chId);
  const cost = ch.cost === 'month' ? marketWage(role) * 26 * 0.5 : ch.cost;
  if (cost) post(`Job post: ${roleDef(role).name} (${ch.name})`, [[6210, cost], [1000, -cost]]);
  const n = irnd(ch.n[0], ch.n[1]);
  for (let i = 0; i < n; i++) S.posts.push({ role, ch: chId, at: S.day + irnd(ch.days[0], ch.days[1]) });
}
function hire(appId, rate, opts) {
  const a = S.applicants.find((x) => x.id === appId); if (!a) return null;
  S.applicants = S.applicants.filter((x) => x !== a);
  const e = { id: uid(), name: a.name, female: a.female, age: a.age, role: a.role, rate, skill: a.skill, rel: a.rel, hon: a.hon, att: a.att, learn: a.learn || 1, amb: a.amb || 1, prof: a.profLabel, startOn: S.day + (a.docs === false ? irnd(2, 4) : 1), noShow: a.rel < 0.78 && chance(0.35), morale: 62, hired: S.day, status: 'probi',
    regular: false, streak: 0, sil: 0, silYear: yearOf(S.day), p: { days: 0, hol: 0, holW: 0, spec: 0, ot: 0, sil: 0 }, m: { basic: 0 }, ytd: { basic: 0, acc13: 0 }, absences: 0, warnings: 0, perf: 0, registered: S.policy.register, gave: 0 };
  S.emps.push(e); S.stats.hires++;
  e.opening = noteHire(e.role);
  // pre-employment medical and ID costs
  post(`Pre-employment medical: ${e.name}`, [[6210, 800], [1000, -800]]);
  return e;
}
function empCap(e) {
  const R = roleDef(e.role); const base = R.cap || 1;
  let boost = 1;
  for (const a of S.assets) { const A = IND().assets[a.key]; if (A && A.boost && A.boost[e.role]) boost += A.boost[e.role]; }
  const sup = active().some((x) => x.role === 'supervisor' && x.today) || S.ownerRole === 'manage' ? 1.1 : 1;
  return base * e.skill * (0.8 + 0.4 * e.morale / 100) * boost * sup;
}
function ownerCap(role) {
  const c = IND().owner[role];
  if (!c) return 0;
  // a small team means the owner does a bit of everything
  const solo = S.ownerRole === role ? 1 : headcount() < 3 && S.ownerRole !== 'manage' ? 0.4 : 0;
  if (!solo) return 0;
  let boost = 1;
  for (const a of S.assets) { const A = IND().assets[a.key]; if (A && A.boost && A.boost[role]) boost += A.boost[role]; }
  return c * boost * solo;
}
function rateIsMWE(e) { return e.rate <= minWage() + 0.01; }

// ---------- clients (trading) ----------
const CLIENT_TYPES = {
  small: { size: 6, freq: 5, terms: [0, 0, 7], label: 'Sari-sari store' },
  medium: { size: 16, freq: 4, terms: [0, 7, 15], label: 'Carinderia / mini store' },
  large: { size: 36, freq: 4, terms: [15, 30], label: 'Minimart / grocery' },
  chain: { size: 90, freq: 3, terms: [30], label: 'Chain / institutional' }
};
function makeClient(type) {
  const T = CLIENT_TYPES[type], used = new Set(S.clients.map((c) => c.name));
  let name = pick(STORE_NAMES); for (let i = 0; i < 20 && used.has(name); i++) name = pick(STORE_NAMES) + ' ' + irnd(2, 9);
  const prefs = {}; for (const k in IND().lines) prefs[k] = IND().lines[k].w * rnd(0.5, 1.5);
  return { id: uid(), name, type, terms: pick(T.terms), rel: clamp(rnd(0.75, 0.99) - (type === 'small' ? 0.05 : 0), 0.55, 0.99), sens: rnd(2, 5), loyal: 55, prefs, since: S.day, bought: 0, overdue: 0, visited: 0 };
}
function clientCapacity() {
  const sm = active().filter((e) => e.role === 'salesman' && e.today !== false).length;
  return sm * 25 + (S.ownerRole === 'salesman' ? IND().owner.salesman : 4);
}

// ---------- the day ----------
function isOpen(d) {
  if (dow(d) === 0) return false;
  const h = holidayOn(d);
  if (h && !S.policy.openHolidays) return false;
  if (h && h.type === 'R' && ['12-25', '01-01'].includes(ymd(d).slice(5))) return false;   // everyone closes Christmas and New Year
  return !(S.closedUntil && d <= S.closedUntil);
}
// returns a summary of the day for the UI
function simDay() {
  const d = S.day, I = IND(), M = mon(), hol = holidayOn(d), open = isOpen(d);
  const R = { d, open, hol, sales: 0, cogs: 0, cust: 0, served: 0, lost: 0, waste: 0, notes: [], deliveries: 0, collected: 0 };
  if (dom(d) === 1) monthStart(d);
  if (dom(d) === LAW.permitDue[1] && monthOf(d) === 1) permitCheck(d);
  wageOrderCheck(d);
  arrivals(d); fixAssets();
  for (const x of (S.reimb || [])) if (!x.done && x.on <= d) { x.done = true; post(x.memo, [[1000, x.amt], [1110, -x.amt]]); inbox('SSS', 'Reimbursement received', `${x.memo}: ${peso(x.amt)}`); }
  S.reimb = (S.reimb || []).filter((x) => !x.done);
  attendance(d, open, hol, R);
  if (open) {
    if (I.channel === 'b2b') { dayB2B(d, R); if (S.policy.autoReorder) autoPO(); } else dayWalkin(d, R);
  }
  if (S.ar.length) collections(d, R);
  if (I.mode === 'prep') ageLots(R);
  dailyCosts(d, open, R);
  hrDaily(d, open, R);
  events(d, open, R);
  // payroll on the 15th and the last day of the month
  if (dom(d) === 15 || isMonthEnd(d)) payroll(d, isMonthEnd(d));
  if (isMonthEnd(d)) monthEnd(d);
  dueReminders(d);
  approvalsDaily(d, R);
  S.salesLog.push(R.sales); if (S.salesLog.length > 400) S.salesLog.shift();
  S.dailyLog.push({ d, sales: R.sales, gp: R.sales - R.cogs, cust: R.cust, served: R.served, cash: cash() }); if (S.dailyLog.length > 120) S.dailyLog.shift();
  if (cash() < 0) { S.negDays = (S.negDays || 0) + 1; if (S.negDays === 1) inbox('Accountant', 'Negative cash!', `Your bank account is overdrawn. Collect receivables, sell assets, take a loan, ${S.board.none ? 'or put in personal savings (Board tab \u2192 Owner)' : 'or ask the board for capital'}. After 30 days in the negative the business closes.`); }
  else S.negDays = 0;
  if (S.negDays >= 30) gameOver('insolvent');
  S.last = R;
  if (dow(d) === 1 || dom(d) === 1) checkStage();
  S.day++;
  if (dom(S.day) === 1 && monthOf(S.day) === 1) yearEnd(S.day - 1);
  boardCheck(S.day);
  return R;
}
// skip closed days in one go; returns all summaries
function nextDay() {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const r = simDay(); out.push(r);
    if (S.over || S.queue.length || r.open || isOpen(S.day) === false && false) break;
    if (isOpen(S.day)) break;
  }
  save();
  return out;
}

function arrivals(d) {
  // job applicants
  const due = S.posts.filter((p) => p.at <= d); S.posts = S.posts.filter((p) => p.at > d);
  for (const p of due) {
    const ch = JOB_CHANNELS.find((c) => c.id === p.ch);
    const a = makeApplicant(p.role, ch.q); if (ch.screened) { a.seen.skill = true; a.seen.rel = true; }
    if (hrOfficer()) { hrScreen(a); if (a.hr.score < 0.38) { S.flags.screenedOut = (S.flags.screenedOut || 0) + 1; continue; } }
    S.applicants.push(a);
  }
  if (S.flags.screenedOut) { inbox('HR', `Screened out ${S.flags.screenedOut} applicant(s)`, 'They did not pass the initial interview (unreliable references or weak practical test). The rest are in Tao \u2192 Hiring with my notes, ready for your final interview.'); S.flags.screenedOut = 0; }
  S.applicants = S.applicants.filter((a) => a.expires >= d);
  // purchase orders
  for (const po of S.po.filter((x) => x.arrive <= d)) {
    const x = S.inv[po.k]; x.transit -= po.n; x.pending -= po.n;
    // value already in 1200; just merge the quantity at its cost
    const c = po.unitNet; x.c = (x.q * x.c + po.n * c) / (x.q + po.n || 1); x.q += po.n;
  }
  S.po = S.po.filter((x) => x.arrive > d);
}

function attendance(d, open, hol, R) {
  const sickF = S.policy.perks.hmo ? PERKS.hmo.sick : 1;
  for (const e of active()) {
    e.today = false;
    if (['awol', 'leave', 'suspended'].includes(e.status)) continue;
    if (!open) continue;
    if (e.startOn && d < e.startOn) continue;
    if (e.noShow && d === e.startOn) { e.noShow = false; e.status = 'gone'; e.left = d; e.why = 'no-show on day one'; S.stats.quits++; inbox('HR', `Hindi sumipot si ${e.name}`, 'They accepted the offer but never came on the first day and do not answer calls. It happens. Post the job again.'); continue; }
    // realistic absence rates: reliable ~1-2%, average ~4%, unreliable ~10%; morale and HMO lower them
    e.abs = e.abs || { sick: 0, noshow: 0, sil: 0 }; e.mAbs = e.mAbs || { sick: 0, noshow: 0 };
    const pAbsent = (1 - e.rel) * 0.4 * (1.4 - 0.8 * e.morale / 100) * (S.policy.perks.hmo ? 0.75 : 1);
    if (!chance(pAbsent)) { e.today = true; e.streak = 0; e.p.days++; if (hol) { if (hol.type === 'R') e.p.holW++; else e.p.spec++; } continue; }
    // absent: most call in sick; some just don't show up
    if (Math.random() < 0.72) {
      e.abs.sick++; e.mAbs.sick++;
      if (e.sil > 0) { e.sil--; e.p.sil++; e.abs.sil++; R.notes.push(`${e.name} on sick leave (SIL)`); }
      else { e.absences++; R.notes.push(`${e.name} called in sick (no pay)`); }
    } else {
      e.streak++; e.absences++; e.abs.noshow++; e.mAbs.noshow++;
      if (e.rel < 0.8 && e.streak === 1 && chance(0.2)) e.streak = 3;   // some unreliable people just disappear
      if (e.streak >= 3) {
        e.status = 'awol'; S.stats.awol++;
        const reason = pick([{ k: 'hospital', p: 0.25 }, { k: 'province', p: 0.3 }, { k: 'newjob', p: 0.35 }, { k: 'none', p: 0.1 }]);
        openCase(e, 'awol', { reason: reason.k });
        const cs = S.cases[S.cases.length - 1];
        if (hrOfficer() && cs && cs.emp === e.id && cs.stage === 'open') { cs.hrDraft = true; cs.log.push(`${fshort(d)}: HR Officer ${hrOfficer().name} checked the attendance logs, called the employee (no answer) and prepared a Notice to Explain for your approval`); }
      } else R.notes.push(`${e.name} did not show up (no call)`);
    }
  }
  // unworked regular holiday: paid if covered (counted in payroll)
  if (hol && hol.type === 'R' && holidayCovered()) for (const e of active()) if (!e.today && ['probi', 'regular'].includes(e.status)) e.p.hol++;
}
function capacityFor(role) {
  let c = 0;
  for (const e of active()) if (e.today && e.role === role) c += empCap(e);
  c += ownerCap(role);
  // nobody assigned: the people who are there cover a little
  if (c === 0 && IND().roles[role] && IND().roles[role].cap) c = (IND().roles[role].cap * 0.35) * (active().some((e) => e.today) ? 1 : 0) + (IND().owner[role] || 0) * 0.3;
  if (S.policy.overtime) c *= 1.25;
  if (S.brownoutToday && !assetFlag('power')) c *= 0.6;
  return c;
}

// demand factors shared by walk-in industries
function seasonFactor(d) {
  const m = monthOf(d), dd = dom(d);
  let f = 1;
  if (m === 12) f *= 1.25; if (m === 11) f *= 1.06; if (m === 6 && S.ind !== 'food') f *= 1.08;
  if (dd === 15 || dd === 30 || dd === 14 || dd === 29 || dd === 16 || dd === 1) f *= 1.15;   // sweldo
  const h = holidayOn(d); if (h) f *= S.ind === 'food' ? 0.8 : 0.9;
  if (dow(d) === 6) f *= S.ind === 'laundry' ? 1.3 : 1.05;
  if (S.competitorUntil && d < S.competitorUntil) f *= 0.85;
  if (S.viralUntil && d < S.viralUntil) f *= S.viral;
  if (S.weatherToday === 'ulan') f *= S.ind === 'laundry' ? 1.15 : 0.85;
  return f;
}
function dayWalkin(d, R) {
  const I = IND(), M = mon(), L = S.locs.map((t) => I.locations[t]);
  const traffic = L.reduce((s, l) => s + l.traffic, 0), tol = Math.max(...L.map((l) => l.priceTol || 1));
  // price attractiveness
  let pfAll = 0, pw = 0; const pf = {};
  for (const k in I.lines) { const ln = I.lines[k]; if (ln.needs && !hasAsset(ln.needs) && !(ln.needs === 'freezer' && hasAsset('freezer'))) { pf[k] = 0; continue; } pf[k] = Math.pow(refPrice(k) * tol / S.price[k], I.elastic); pfAll += pf[k] * ln.p; pw += ln.p; }
  pfAll = pw ? pfAll / pw : 1;
  const mkt = MARKETING[S.policy.mkt].boost;
  let C = I.base * traffic * (0.55 + S.rep / 110) * mkt * seasonFactor(d) * Math.pow(clamp(pfAll, 0.3, 2), 0.6) * rnd(0.88, 1.12);
  C = Math.round(C);
  // customer-facing capacity
  let custCap = Infinity;
  if (S.ind === 'food') {
    const srv = capacityFor('server'), cas = capacityFor('cashier');
    custCap = Math.min(cas > 0 ? srv : srv * 0.8, L.reduce((s, l) => s + l.seats, 0) * I.turns / 0.6, cas > 0 ? cas : Infinity);   // about 40% take out (pa-balot), no seat needed
  } else if (S.ind === 'bakery') custCap = capacityFor('clerk');
  else if (S.ind === 'minimart') custCap = capacityFor('cashier');
  else if (S.ind === 'laundry') custCap = Infinity;
  const served = Math.min(C, Math.floor(custCap)); const lostC = C - served;
  // morning production (prep industries) limited by cooks/bakers and ovens
  if (I.mode === 'prep') prepare(d, served);
  // demand per line
  const dem = {};
  for (const k in I.lines) { const ln = I.lines[k]; dem[k] = served * ln.p * (ln.q || 1) * clamp(pf[k] / Math.max(0.3, pfAll), 0.2, 2.5) * trendMult(k); }
  const cq = contractQty();
  if (I.mode === 'service') for (const k in cq) if (dem[k] != null) dem[k] += cq[k];
  // service capacity (laundry) / shelf capacity (minimart)
  const ratio = {};
  if (I.mode === 'service') {
    const need = {};
    for (const k in dem) for (const r in (I.lines[k].work || {})) need[r] = (need[r] || 0) + dem[k] * I.lines[k].work[r];
    const caps = { washer: assetCount('washer') * I.machineCap * (S.brownoutToday && !assetFlag('power') ? 0.5 : 1), dryer: assetCount('dryer') * I.machineCap * (S.brownoutToday && !assetFlag('power') ? 0.5 : 1) };
    for (const r in need) { const cap = r in caps ? caps[r] : capacityFor(r); ratio[r] = need[r] > 0 ? Math.min(1, cap / need[r]) : 1; }
  }
  let shelf = Infinity;
  if (S.ind === 'minimart') { const tot = Object.values(dem).reduce((a, b) => a + b, 0); shelf = tot > 0 ? Math.min(1, capacityFor('stocker') / tot) : 1; }
  let sales = 0, cogs = 0, units = 0, lostU = 0, vatOut = 0;
  // committed supply contracts are served first
  const rrOf = (k) => { const ws = Object.keys(I.lines[k].work || {}); return ws.length ? Math.min(...ws.map((r) => ratio[r] == null ? 1 : ratio[r])) : 1; };
  const ct = deliverContracts(d, (k, n) => {
    if (I.mode === 'service') { const m = Math.round(n * rrOf(k)); return { n: m, cost: m * lineCost(k) }; }
    const m = Math.min(n, Math.floor(stockQty(k))); return { n: m, cost: takeStock(k, m) };
  });
  if (ct.cogs > 0) post('Cost of contract deliveries', [[5000, ct.cogs], [I.mode === 'service' ? 1000 : 1200, -ct.cogs]]);
  R.contractSales = ct.sales; M.k.sales += ct.sales;
  if (I.mode === 'service') for (const k in cq) if (dem[k] != null) dem[k] = Math.max(0, dem[k] - cq[k]);
  for (const k in I.lines) {
    let want = dem[k];
    if (I.mode === 'service') { const ws = Object.keys(I.lines[k].work || {}); const rr = ws.length ? Math.min(...ws.map((r) => ratio[r])) : 1; want *= rr; }
    if (shelf < 1) want *= shelf;
    want = Math.round(want);
    if (pf[k] === 0) want = 0;
    let sold = want;
    if (I.mode !== 'service') sold = Math.min(want, Math.floor(stockQty(k)));
    const lost = Math.max(0, Math.round(dem[k]) - sold);
    lostU += lost; units += sold;
    if (!sold) { S.demandAvg[k] = S.demandAvg[k] * 0.8 + dem[k] * 0.2; continue; }
    const gross = sold * S.price[k];
    const c = I.mode === 'service' ? sold * lineCost(k) : takeStock(k, sold);
    sales += gross; cogs += c;
    if (vatable(k)) vatOut += gross / 1.12 * 0.12;
    S.demandAvg[k] = S.demandAvg[k] * 0.8 + dem[k] * 0.2;
    R['s_' + k] = sold;
  }
  // shoplifting / shrinkage (minimart)
  if (S.ind === 'minimart') {
    let rate = 0.012; if (hasAsset('cctv')) rate *= 0.5; if (hasAsset('guard')) rate *= 0.3;
    let shr = 0; for (const k in I.lines) { const n = Math.floor(stockQty(k) * rate * 0.05 + (R['s_' + k] || 0) * rate); if (n > 0) shr += takeStock(k, n); }
    if (shr > 0) { post('Shoplifting and shrinkage', [[6200, shr], [1200, -shr]]); R.waste += shr; }
  }
  if (sales > 0) {
    const lines = [[1000, sales], [4000, -(sales - vatOut)]]; if (vatOut) lines.push([2150, -vatOut]);
    post(`Daily sales (${served} customers)`, lines);
    if (I.mode === 'service') post('Supplies and utilities used (cost of services)', [[5000, cogs], [1000, -cogs]]);
    else post('Cost of goods sold', [[5000, cogs], [1200, -cogs]]);
  }
  R.sales = sales + ct.sales; R.cogs = cogs + ct.cogs; R.cust = C; R.served = served; R.lost = lostC;
  M.k.cust += C; M.k.served += served; M.k.lost += lostC; M.k.units += units; M.k.lostUnits += lostU; M.k.sales += sales;
  // reputation: service level, stockouts, price fairness, quality
  const fill = units + lostU > 0 ? units / (units + lostU) : 1, svc = C ? served / C : 1;
  const quality = avgSkill() ;
  const repTarget = clamp(55 + (fill - 0.92) * 150 + (svc - 0.92) * 150 + (pfAll - 1) * 40 + (quality - 0.95) * 60, 5, 100);
  S.rep = clamp(S.rep + (repTarget - S.rep) * 0.04 + (S.rushBonus || 0), 5, 100);
  S.rushBonus = 0;
  if (lostC > C * 0.15) R.notes.push(`${lostC} customers left: kulang ang tao`);
  if (lostU > units * 0.15 && I.mode !== 'service') R.notes.push('Many items ran out today');
  // auto reorder (minimart) and default planning
  if (S.ind === 'minimart' && S.policy.autoReorder) autoReorder();
}
function avgSkill() { const a = active().filter((e) => e.today && IND().roles[e.role]); return a.length ? a.reduce((s, e) => s + e.skill, 0) / a.length : 0.95; }
function forecast(k) { const ln = IND().lines[k]; return Math.max(5, Math.round(S.demandAvg[k] || IND().base * ln.p * (ln.q || 1))); }
function prepare(d, served) {
  const I = IND();
  // what we want to make
  const want = {};
  for (const k in I.lines) {
    const ln = I.lines[k]; if (ln.keeps >= 30) continue;   // drinks are bought, not cooked
    const have = stockQty(k);
    const target = (S.autoPlan ? Math.round(forecast(k) * 1.05 * trendMult(k)) : (S.plan[k] || 0)) + (contractQty()[k] || 0);
    want[k] = Math.max(0, target - have);
  }
  // capacity of cooks/bakers (+ ovens)
  const prodRole = S.ind === 'food' ? 'cook' : 'baker';
  let cap = capacityFor(prodRole); if (S.ind === 'bakery') cap = Math.min(cap, assetCount('oven') * I.ovenCap * (S.brownoutToday && !assetFlag('power') ? 0.4 : 1));
  let work = 0; for (const k in want) work += want[k] * ((I.lines[k].work || {})[prodRole] || 0);
  const f = work > cap ? cap / work : 1;
  let cost = 0;
  for (const k in want) {
    const n = Math.floor(want[k] * f); if (n <= 0) continue;
    const unit = lineCost(k); addStock(k, n, unit); cost += n * unit;
  }
  // drinks: restock to forecast
  for (const k in I.lines) if (I.lines[k].keeps >= 30) { const need = Math.max(0, Math.round(forecast(k) * 2) - stockQty(k)); if (need) { const u = lineCost(k); addStock(k, need, u); cost += need * u; } }
  if (cost > 0) post(S.ind === 'food' ? 'Palengke: ingredients for today' : 'Flour, sugar, yeast, eggs for today’s bake', [[1200, cost], [1000, -cost]]);
  S.prodShort = f < 0.98 ? 1 - f : 0;
}
function ageLots(R) {
  const I = IND(); let waste = 0;
  const keep = assetFlag('keep');
  for (const k in S.inv) {
    const lots = S.inv[k]; if (!Array.isArray(lots)) continue;
    const life = I.lines[k].keeps || 1;
    for (const l of lots) {
      l.age++;
      if (l.age >= life) {
        const spoil = life === 1 && l.age === 1 ? l.q * (1 - keep) : l.q;   // freezer/chiller saves part of today's leftovers for tomorrow
        waste += spoil * l.c; l.q -= spoil;
      }
    }
    S.inv[k] = lots.filter((l) => l.q > 0.01);
  }
  waste = Math.round(waste);
  if (waste > 0) { post('Spoiled / unsold food', [[6200, waste], [1200, -waste]]); R.waste += waste; }
}
function autoReorder() {
  const I = IND();
  for (const k in I.lines) {
    const ln = I.lines[k]; if (ln.needs && !hasAsset(ln.needs)) continue;
    const want = Math.round(forecast(k) * 6) - stockQty(k);
    const room = storageCap() - storageUsed();
    const n = Math.min(want, room);
    if (n > forecast(k) && cash() > lineCost(k) * n + 20000) buyStock(k, n, true);
  }
}

// trading day: orders in, deliveries out
function dayB2B(d, R) {
  const I = IND(), M = mon();
  const cap = clientCapacity(), over = S.clients.length > cap;
  for (const c of S.clients) {
    const T = CLIENT_TYPES[c.type];
    if (over) c.loyal -= 0.25;   // nobody visits them
    if (!chance(1 / T.freq * seasonFactor(d) ** 0.5)) continue;
    let pf = 0, pw = 0; for (const k in I.lines) { c.prefs[k] = c.prefs[k] || I.lines[k].w * rnd(0.5, 1.5); pf += c.prefs[k] * Math.pow(refPrice(k) / S.price[k], c.sens); pw += c.prefs[k]; }
    pf /= pw;
    pw = 0; for (const k in I.lines) pw += c.prefs[k] * trendMult(k);
    const size = T.size * rnd(0.6, 1.4) * clamp(pf, 0.2, 1.8) * (0.6 + c.loyal / 125);
    const lines = {}; let tot = 0;
    for (let i = 0; i < Math.max(1, Math.round(size)); i++) {
      let r = Math.random() * pw, kk = null;
      for (const k in I.lines) { r -= c.prefs[k] * trendMult(k); if (r <= 0) { kk = k; break; } }
      kk = kk || Object.keys(I.lines)[0]; lines[kk] = (lines[kk] || 0) + 1; tot++;
    }
    if (pf < 0.85 && chance(0.3)) { c.loyal -= 2; R.notes.push(`${c.name}: "Mas mura sa iba."`); }
    S.backlog.push({ id: uid(), c: c.id, lines, d, tot });
    for (const k in lines) S.demandAvg[k] = (S.demandAvg[k] || 0) + lines[k];
    M.k.cust++;
  }
  for (const k in I.lines) S.demandAvg[k] = (S.demandAvg[k] || 0) * 0.85;   // smoothed daily demand (x6.7)
  // delivery capacity
  let drivers = active().filter((e) => e.role === 'driver' && e.today).length;
  if (S.ownerRole === 'driver' || (drivers === 0 && S.ownerRole !== 'manage')) drivers++;   // the owner drives when nobody else can
  const helpers = active().filter((e) => e.role === 'helper' && e.today).length;
  const vs = vehicles().sort((a, b) => I.assets[b.key].cap - I.assets[a.key].cap).slice(0, drivers);
  let vcap = 0, fuel = 0, hLeft = helpers;
  const vinfo = vs.map((v) => { const h = Math.min(2, hLeft); hLeft -= h; const c = I.assets[v.key].cap * (1 + 0.25 * h) * (S.weatherToday === 'bagyo' ? 0.4 : 1); vcap += c; return { c, f: I.assets[v.key].fuel }; });
  const clerks = active().filter((e) => e.role === 'clerk' && e.today).reduce((s, e) => s + 250 * e.skill, 0) * (1 + assetFlag('clerkBoost'));
  const pickCap = clerks + (S.ownerRole === 'clerk' ? I.owner.clerk : 40) + drivers * 15;
  let capLeft = Math.floor(Math.min(vcap, pickCap));
  const capTotal = capLeft;
  let sales = 0, cogs = 0, cases = 0, vatOut = 0, short = 0;
  S.backlog.sort((a, b) => a.d - b.d);
  for (const o of S.backlog) {
    if (capLeft <= 0) break;
    const c = S.clients.find((x) => x.id === o.c); if (!c) { o.done = true; continue; }
    let amt = 0, cst = 0, n = 0, vat = 0;
    for (const k in o.lines) {
      const can = Math.min(o.lines[k], Math.floor(stockQty(k)), capLeft);
      if (can <= 0) { if (Math.floor(stockQty(k)) < o.lines[k]) short++; continue; }
      cst += takeStock(k, can); amt += can * S.price[k]; if (vatable(k)) vat += can * S.price[k] / 1.12 * 0.12;
      o.lines[k] -= can; capLeft -= can; n += can;
      if (o.lines[k] <= 0) delete o.lines[k];
    }
    if (!Object.keys(o.lines).length) o.done = true;
    if (n) {
      sales += amt; cogs += cst; cases += n; vatOut += vat;
      c.bought += amt; c.loyal = clamp(c.loyal + (o.done ? 1.2 : 0.3) - (d - o.d) * 1.5, 0, 100);
      if (c.terms === 0) post(`Delivery to ${c.name} (COD)`, [[1000, amt], [4000, -(amt - vat)], [2150, -vat]]);
      else { post(`Delivery to ${c.name} (${c.terms} days)`, [[1100, amt], [4000, -(amt - vat)], [2150, -vat]]); S.ar.push({ id: uid(), c: c.id, amt, due: d + c.terms, d, paid: 0 }); }
      post('Cost of goods delivered', [[5000, cst], [1200, -cst]]);
    }
  }
  // old orders get cancelled
  for (const o of S.backlog) if (!o.done && d - o.d >= 2) { o.done = true; const c = S.clients.find((x) => x.id === o.c); if (c) { c.loyal -= 8; R.notes.push(`${c.name} cancelled a late order`); } M.k.lost++; }
  S.backlog = S.backlog.filter((o) => !o.done);
  if (cases) {
    const avgFuel = vinfo.length ? vinfo.reduce((s, v) => s + v.f * v.c, 0) / Math.max(1, vcap) : 8;
    fuel = Math.round(cases * avgFuel * fuelIdx());
    post('Fuel, toll and parking', [[6120, fuel], [1000, -fuel]]);
  }
  if (short) R.notes.push('Kulang ang stock for some orders');
  if (capLeft <= 0 && S.backlog.length) R.notes.push('Delivery capacity full: may naiwang orders');
  // churn and new clients
  for (const c of S.clients) if (c.loyal < 20 && chance(0.15)) { c.gone = true; inbox('Sales', `${c.name} stopped ordering`, 'Late deliveries, price or neglect. Win them back with better service.'); }
  S.clients = S.clients.filter((c) => !c.gone);
  const sm = active().filter((e) => e.role === 'salesman' && e.today).length + (S.ownerRole === 'salesman' ? 0.6 : 0.15);
  if (chance(0.16 * sm * MARKETING[S.policy.mkt].boost)) S.prospects.push(prospect());
  S.prospects = S.prospects.filter((p) => p.exp >= d);
  // reputation = average loyalty
  S.rep = S.clients.length ? S.clients.reduce((s, c) => s + c.loyal, 0) / S.clients.length : 40;
  R.sales = sales; R.cogs = cogs; R.deliveries = cases; R.cap = capTotal; R.cust = M.k.cust;
  M.k.sales += sales; M.k.deliveries += cases; M.k.units += cases;
}
function autoPO() {
  // warehouse clerk keeps about 4 days of demand in stock
  if (!active().some((e) => e.role === 'clerk') && S.ownerRole !== 'clerk') return;
  for (const k in IND().lines) {
    const daily = (S.demandAvg[k] || 0) * 0.15, want = Math.round(daily * 4 - stockQty(k) - (S.inv[k].transit || 0));
    const room = storageCap() - storageUsed() - S.po.reduce((s, p) => s + p.n, 0);
    const n = Math.min(want, room);
    if (n >= 3 && cash() > lineCost(k) * n + 30000) buyStock(k, n, false, S.supplier.terms && apOpen() + lineCost(k) * n < S.supplier.limit);
  }
}
const apOpen = () => S.ap.reduce((s, a) => s + a.amt, 0);
function prospect() {
  const tier = S.locs[0], r = Math.random();
  const type = tier >= 1 && r < 0.15 ? 'chain' : r < 0.35 ? 'large' : r < 0.7 ? 'medium' : 'small';
  const c = makeClient(type); c.exp = S.day + irnd(10, 20); c.loyal = 50;
  return c;
}
function pitchChance(p) {
  let pf = 0, pw = 0; for (const k in IND().lines) { pf += p.prefs[k] * Math.pow(refPrice(k) / S.price[k], p.sens); pw += p.prefs[k]; }
  pf /= pw;
  const termsOk = CLIENT_TYPES[p.type].terms.includes(p.terms) ? 1 : 0.7;
  const fleet = vehicles().reduce((s, v) => s + IND().assets[v.key].cap, 0);
  const big = p.type === 'chain' && fleet < 150 ? 0.3 : 1;
  return clamp((0.35 + (pf - 1) * 1.5 + (S.rep - 50) / 200) * termsOk * big, 0.05, 0.9);
}
function addClient(p) { S.prospects = S.prospects.filter((x) => x.id !== p.id); delete p.exp; p.since = S.day; p.loyal = 60; S.clients.push(p); }
function collections(d, R) {
  const collectors = active().filter((e) => e.role === 'salesman' && e.today).length + (S.ownerRole === 'salesman' ? 1 : 0);
  const boost = 1 + Math.min(0.3, collectors * 0.06) + assetFlag('collect');
  for (const a of S.ar) {
    if (a.due > d) continue;
    const c = S.clients.find((x) => x.id === a.c) || (S.contracts || []).find((x) => x.id === a.c) || { rel: 0.5, name: 'Former client', loyal: 0 };
    const late = d - a.due;
    if (chance(clamp(c.rel * boost * (late === 0 ? 0.85 : 0.25), 0, 0.97))) {
      const amt = a.amt - a.paid;
      post(`Collection: ${c.name}`, [[1000, amt], [1100, -amt]]); a.paid = a.amt; R.collected += amt;
    } else if (late === 45 && !a.flagged) { a.flagged = true; queue({ type: 'collect', ar: a.id }); }
    else if (late >= 120 && !a.written && chance(0.05)) { a.written = true; queue({ type: 'writeoff', ar: a.id }); }
    if (c.overdue !== undefined) c.overdue = late;
  }
  S.ar = S.ar.filter((a) => a.paid < a.amt - 0.5 && !a.closed);
}

// ---------- daily costs, utilities ----------
function dailyCosts(d, open, R) {
  const I = IND();
  if (open) {
    const base = { trading: 300, food: 360, bakery: 480, minimart: 450, laundry: 150 }[S.ind] * S.locs.reduce((s, t) => s + [1, 1.9, 3.8][t], 0);
    S.utilAcc += base * (S.brownoutToday ? 0.7 : 1) + (S.brownoutToday && assetFlag('power') ? 900 : 0);
  }
  // free lunch perk
  if (S.policy.perks.meals) { const n = active().filter((e) => e.today).length; const c = n * PERKS.meals.cost; if (c) post('Free lunch for staff', [[6020, c], [1000, -c]]); }
  // 5-6 lender collects daily
  for (const L of S.loans) if (L.daily && L.bal > 0 && dow(d) !== 0) {
    const pay = Math.min(L.bal, L.inst);
    post('5-6 daily collection', [[2200, pay], [1000, -pay]], 'fin');
    L.bal = r2(L.bal - pay);
  }
}
const fuelIdx = () => S.fuelIdx || 1;

// ---------- payroll ----------
function contrib(monthly) {
  const msc = clamp(Math.round(monthly / 500) * 500, LAW.sss.mscMin, LAW.sss.mscMax);
  const sssEE = msc * LAW.sss.ee, sssER = msc * LAW.sss.er + (msc < LAW.sss.ecCut ? LAW.sss.ecLow : LAW.sss.ecHigh);
  const ph = clamp(monthly, LAW.philhealth.floor, LAW.philhealth.ceil) * LAW.philhealth.rate / 2;
  const hd = Math.min(monthly, LAW.pagibig.cap) * LAW.pagibig.rate;
  return { sssEE, sssER, phEE: ph, phER: ph, hdEE: hd, hdER: hd };
}
function wht(annual) { for (let i = 1; i < LAW.wht.length; i++) { const [top, base, rate] = LAW.wht[i]; if (annual <= top) return base + (annual - LAW.wht[i - 1][0]) * rate; } return 0; }
function payroll(d, monthEnd) {
  const rows = []; let G = 0, NET = 0, ER = 0;
  const sums = { sss: 0, ph: 0, hd: 0, wht: 0, adv: 0 };
  for (const e of S.emps) {
    if (e.status === 'gone' && !e.p.days && !e.p.hol && !e.p.sil) continue;
    const daily = e.rate, hourly = daily / 8;
    const basic = e.p.days * daily, hol = e.p.hol * daily, holW = e.p.holW * daily, spec = e.p.spec * daily * 0.3, sil = e.p.sil * daily;
    const ot = S.policy.overtime ? e.p.days * 2 * hourly * 1.25 : 0;
    const gross = r2(basic + hol + holW + spec + sil + ot);
    e.m.basic += basic + hol + sil; if (e.status !== 'gone') e.ytd.basic += basic + hol + sil;
    let c = { sssEE: 0, sssER: 0, phEE: 0, phER: 0, hdEE: 0, hdER: 0 }, tax = 0;
    if (monthEnd && e.registered && e.m.basic > 0) c = contrib(e.m.basic);
    const ee = c.sssEE + c.phEE + c.hdEE;
    if (!rateIsMWE(e)) tax = Math.max(0, r2(wht((gross - ee) * 24) / 24));
    let net = r2(gross - ee - tax);
    if (e.adv > 0 && net > 0) { const ded = r2(Math.min(e.adv, net * 0.25)); net = r2(net - ded); e.adv = r2(e.adv - ded); sums.adv += ded; }
    if (gross <= 0 && !ee) { e.p = { days: 0, hol: 0, holW: 0, spec: 0, ot: 0, sil: 0 }; continue; }
    rows.push({ name: e.name, role: e.role, days: e.p.days, gross, ee, tax, net, er: c.sssER + c.phER + c.hdER });
    G += gross; NET += net; ER += c.sssER + c.phER + c.hdER;
    sums.sss += c.sssEE + c.sssER; sums.ph += c.phEE + c.phER; sums.hd += c.hdEE + c.hdER; sums.wht += tax;
    e.p = { days: 0, hol: 0, holW: 0, spec: 0, ot: 0, sil: 0 };
    if (monthEnd) e.m.basic = 0;
  }
  if (!rows.length) return;
  G = r2(G); NET = r2(NET); ER = r2(ER);
  const late = cash() < NET;
  post(`Payroll ${fshort(d)} (${rows.length} employees)`, [[6000, G], [6010, ER], [2100, -sums.sss], [2110, -sums.ph], [2120, -sums.hd], [2130, -sums.wht], [1110, -r2(sums.adv)], [1000, -NET]]);
  S.lastPayroll = { d, rows, G, NET, ER, sums };
  if (late) {   // could not fund payroll in full: morale crash and DOLE risk
    S.payrollLate++;
    for (const e of active()) e.morale = clamp(e.morale - 25, 0, 100);
    inbox('HR', 'Payroll bounced', 'Cash was not enough for payroll. Employees were paid late from an overdraft. Expect resignations, and a DOLE complaint is now likely.');
    S.flags.complaintRisk = (S.flags.complaintRisk || 0) + 0.4;
  }
  if (monthEnd) {
    const k = ym(d);
    if (sums.sss) addDue('sss', `SSS contributions (${ymLabel(k)})`, 2100, sums.sss, dayFromYMD(yearOf(d), monthOf(d) + 1, 1) + lastDom(d + 1) - 1);
    if (sums.ph) addDue('ph', `PhilHealth premiums (${ymLabel(k)})`, 2110, sums.ph, dayFromYMD(yearOf(d), monthOf(d) + 1, 1) + lastDom(d + 1) - 1);
    if (sums.hd) addDue('hd', `Pag-IBIG contributions (${ymLabel(k)})`, 2120, sums.hd, d + 15);
  }
}

// ---------- compliance: dues and penalties ----------
function addDue(kind, label, acct, amt, due, extra) {
  amt = r2(amt); if (amt <= 0.5) return;
  const ex = S.due.find((x) => x.kind === kind && x.label === label && !x.paid);
  if (ex) { ex.amt = r2(ex.amt + amt); return; }
  S.due.push(Object.assign({ id: uid(), kind, label, acct, amt, due, made: S.day, paid: false }, extra || {}));
}
function penaltyFor(x, d) {
  d = d == null ? S.day : d;
  const late = d - x.due; if (late <= 0) return 0;
  const months = Math.ceil(late / 30), small = ['Micro', 'Small'].includes(taxSize());
  if (['sss'].includes(x.kind)) return r2(x.amt * LAW.penalties.sssPerMonth * months);
  if (['ph'].includes(x.kind)) return r2(x.amt * LAW.penalties.phPerMonth * months);
  if (['hd'].includes(x.kind)) return r2(x.amt * 0.001 * late);
  if (['wht', 'pct', 'vat', 'itq', 'ita', 'vatAssess'].includes(x.kind)) {
    const s = small ? LAW.penalties.surchargeSmall : LAW.penalties.surchargeBig, i = small ? LAW.penalties.interestSmall : LAW.penalties.interestBig;
    return r2(x.amt * s + x.amt * i * late / 365 + (late > 0 ? 1000 : 0));
  }
  if (x.kind === 'permit') return r2(x.amt * 0.25 + x.amt * 0.02 * months);
  if (x.kind === '13th') return 0;
  return 0;
}
function payDue(id) {
  const x = S.due.find((y) => y.id === id); if (!x || x.paid) return false;
  const pen = penaltyFor(x), tot = x.amt + pen;
  if (x.kind === '13th') return pay13(x);
  const lines = [];
  if (x.split) for (const sp of x.split) lines.push([sp[0], sp[1]]);
  else if (x.acct) lines.push([x.acct, x.amt]); else lines.push([x.exp || 6160, x.amt]);
  if (pen) lines.push([6220, pen]);
  lines.push([1000, -tot]);
  post(`Paid: ${x.label}${pen ? ' (with penalty)' : ''}`, lines);
  x.paid = true; x.paidOn = S.day; x.pen = pen;
  if (x.kind === '13th') S.flags['paid13_' + yearOf(S.day)] = true;
  if (x.kind === 'final') { const e = S.emps.find((y) => y.id === x.emp); if (e) e.finalPaid = true; }
  if (x.kind === 'ap') S.ap = S.ap.filter((a) => a.id !== x.apId);
  if (pen && x.due < S.day) { S.flags.latePay = (S.flags.latePay || 0) + 1; if (x.kind !== 'ap') S.board.conf = clamp(S.board.conf - 1, 0, 100); }
  return true;
}
// 13th month: 1/12 of the year's basic pay, including the rest of December
function thirteenthAmount() {
  let total = 0, accrued = 0;
  const left = Math.max(0, dayFromYMD(yearOf(S.day), 12, 31) - S.day) * 6 / 7;
  for (const e of active()) { total += (e.ytd.basic + e.rate * left) / 12; accrued += e.ytd.acc13 || 0; }
  return { total: r2(total), accrued: r2(accrued) };
}
function pay13(x) {
  const t = thirteenthAmount();
  if (cash() < t.total) return false;
  post(`13th month pay (${yearOf(S.day)})`, [[2170, t.accrued], [6020, r2(t.total - t.accrued)], [1000, -t.total]]);
  for (const e of active()) { const left = Math.max(0, dayFromYMD(yearOf(S.day), 12, 31) - S.day) * 6 / 7; e.ytd.acc13 = r2((e.ytd.basic + e.rate * left) / 12); e.morale = clamp(e.morale + 8, 0, 100); }
  x.paid = true; x.paidOn = S.day; x.amt = t.total; x.pen = 0;
  S.flags['paid13_' + yearOf(S.day)] = true;
  return true;
}
const bookkeeper = () => active().some((e) => e.role === 'bookkeeper' && e.status !== 'awol');
function autoPay(d) {
  const paid = [];
  for (const x of S.due) if (!x.paid && x.due - d <= 2 && x.kind !== 'final' && x.kind !== 'settle' && x.kind !== '13th' && cash() > x.amt + 5000) { const pen = penaltyFor(x); payDue(x.id); paid.push(`${x.label}: ${peso(Math.round(x.amt + pen))}`); S.flags.paidGov = true; }
  for (const x of S.due) if (!x.paid && x.due - d <= 2 && x.kind !== 'final' && x.kind !== 'settle' && cash() <= x.amt + 5000 && !x.warned) { x.warned = true; inbox('Bookkeeper', `Hindi ko mabayaran: ${x.label}`, `Kulang ang cash para sa ${peso(Math.round(x.amt))}. Due ${fshort(x.due)}. Please add cash or collect receivables.`); }
  if (paid.length) inbox('Bookkeeper', 'Filed and paid', paid.join('\n') + '\n\nReceipts are in Books \u2192 Compliance \u2192 Recently paid.');
}
function dueReminders(d) {
  if (!bookkeeper()) for (const x of S.due) if (!x.paid && x.due === d + 3) inbox('Accountant', `Due in 3 days: ${x.label}`, `${peso(x.amt)} due on ${fshort(x.due)}. Pay it in Books → Compliance.`);
  // supplier bills
  for (const a of S.ap) if (!S.due.some((x) => x.apId === a.id)) addDue('ap', `Supplier bill: ${a.memo}`, 2000, a.amt, a.due, { apId: a.id });
  // overdue supplier: they cut credit
  for (const x of S.due) if (x.kind === 'ap' && !x.paid && d - x.due === 7) { S.supplier.terms = false; S.supplier.late++; inbox('Supplier', 'Credit line suspended', 'Hindi pa bayad ang bill. Cash basis muna tayo hanggang makabayad.'); }
  S.due = S.due.filter((x) => !x.paid || S.day - x.paidOn < 40);
}

// ---------- month, quarter, year ----------
function monthStart(d) {
  if (d !== S.start) payRent();
  const mk = MARKETING[S.policy.mkt]; if (mk.cost) post(`Marketing: ${mk.name}`, [[6130, mk.cost], [1000, -mk.cost]]);
  const n = active().filter((e) => e.status !== 'awol').length;
  if (S.policy.perks.rice && n) post('Rice allowance (de minimis)', [[6020, n * PERKS.rice.cost], [1000, -n * PERKS.rice.cost]]);
  if (S.policy.perks.hmo && n) post('HMO premiums', [[6020, n * PERKS.hmo.cost], [1000, -n * PERKS.hmo.cost]]);
  for (const a of S.assets) { const A = IND().assets[a.key]; if (A && A.monthly) post(`${A.name}`, [[6240, A.monthly], [1000, -A.monthly]]); }
  // bank loan amortization
  for (const L of S.loans) if (!L.daily && L.bal > 0) {
    const int = r2(L.bal * L.rate / 12), prin = Math.min(L.bal, r2(L.pmt - int));
    post(`Loan amortization (${L.name})`, [[2200, prin], [6180, int], [1000, -(prin + int)]], 'fin');
    L.bal = r2(L.bal - prin);
  }
  S.loans = S.loans.filter((L) => L.bal > 0.5);
  // board wants the monthly report
  const prev = ym(d - 1);
  if (d > S.start + 5 && !S.board.none) {
    if (bookkeeper()) { const is = incomeStatement([prev]), pv = S.mon[ym(d - 35)] ? incomeStatement([ym(d - 35)]) : null; const top = is.opex.slice().sort((x, y) => y[1] - x[1])[0];
      inbox('Bookkeeper', `Monthly report ready: ${ymLabel(prev)}`, `Prepared for your review.\n\nSales ${peso(Math.round(is.sales))}${pv ? ` (${is.sales >= pv.sales ? '+' : ''}${pv.sales ? Math.round((is.sales / pv.sales - 1) * 100) : 0}% vs last month)` : ''}\nGross margin ${is.sales ? (is.gross / is.sales * 100).toFixed(1) : 0}%\nNet income ${peso(Math.round(is.net))}\nBiggest expense: ${top ? acctName(top[0]) + ' ' + peso(Math.round(top[1])) : '-'}\nCash ${peso(Math.round(cash()))}\n\nTap Send to forward it to the board.`, { kind: 'report', k: prev, prepared: true }); }
    else inbox('Board', `Monthly report for ${ymLabel(prev)}`, 'Please send the monthly financial report by the 10th. (A bookkeeper would prepare it for you.)', { kind: 'report', k: prev });
  }
  monthlyMarket(d);
  approvalsMonthly(d);
  S.offers = (S.offers || []).filter((o) => o.exp >= d);
  if (S.stage >= 2 && IND().channel === 'walkin' && chance(0.7)) { const o = contractOffer(); if (o) { S.offers.push(o); recommendContract(o); inbox('Sales', `Supply contract offer: ${o.name}`, `${o.qty} ${IND().lines[o.line].name} every working day at ${peso(o.price)} each, ${o.terms}-day terms, for ${o.months} months. Decide in Ops \u2192 Contracts before ${fshort(o.exp)}.`); } }
  // market prices drift (inflation about 4% a year, plus noise)
  for (const k in S.market) S.market[k] = clamp(S.market[k] * (1 + rnd(-0.008, 0.012)), 0.7, 2.5);
  if (monthOf(d) === 7 && yearOf(d) >= 2028) {   // a new wage order every July after 2027
    const inc = irnd(30, 55); const last = LAW.wage.concat(S.wageOrders).slice(-1)[0];
    S.wageOrders.push({ from: `${yearOf(d)}-07-${String(irnd(10, 25)).padStart(2, '0')}`, nonagri: last.nonagri + inc, small: last.small + inc });
    inbox('DOLE', 'New wage order', `The NCR wage board approved a ₱${inc} daily increase, effective later this month. Minimum-wage employees will be adjusted on that date.`);
    S.wageIndex *= 1.05;
  }
}
function wageOrderCheck(d) {
  const k = ymd(d);
  for (const w of LAW.wage.concat(S.wageOrders || [])) if (w.from === k) {
    const mw = minWage(d); let n = 0;
    for (const e of active()) if (e.rate < mw) { e.rate = mw; n++; }
    if (n) inbox('HR', 'Wage order applied', `${n} employee(s) adjusted to the new minimum wage of ${peso(mw)}/day today.`);
  }
  // crossing 15 workers raises the minimum wage tier for retail/service
  if (isRetailService()) { const mw = minWage(d); for (const e of active()) if (e.rate < mw) { e.rate = mw; if (!S.flags.tier15) { S.flags.tier15 = true; inbox('HR', 'You now have more than 15 workers', `The lower minimum wage for small retail/service no longer applies. Everyone was adjusted to at least ${peso(mw)}/day.`); } } }
}
function monthEnd(d) {
  const k = ym(d), M = mon(k);
  // depreciation
  let dep = 0;
  for (const a of S.assets) if (a.cost && (d - a.bought) / 30 < a.life) dep += a.cost / a.life;
  dep = Math.round(dep); if (dep) post('Depreciation', [[6150, dep], [1510, -dep]]);
  // utilities bill
  const u = Math.round(S.utilAcc); S.utilAcc = 0; if (u) post(`Meralco and Maynilad: ${ymLabel(k)}`, [[6110, u], [1000, -u]]);
  // 13th month accrual (1/12 of basic earned this month)
  let acc = 0; for (const e of active()) { const a = e.lastMonth13 = r2((e.ytd.basic - (e.ytd.acc13 || 0) * 12) / 12); if (a > 0) { e.ytd.acc13 = r2((e.ytd.acc13 || 0) + a); acc += a; } }
  acc = r2(acc); if (acc) post('13th month pay accrual', [[6020, acc], [2170, -acc]]);
  S.emps = S.emps.filter((e) => e.status !== 'gone' || d - e.left < 60);
  // withholding tax due on the 10th
  if (bal(2130) < -0.5) addDue('wht', `Withholding tax on compensation, BIR 1601-C (${ymLabel(k)})`, 2130, -bal(2130), d + 10);
  // business tax: percentage tax accrues monthly when not VAT-registered
  const sales = M.pl[4000] || 0;
  if (!S.vat && sales > 0) post(`Percentage tax 3% (${ymLabel(k)})`, [[6160, Math.round(sales * LAW.pctTax)], [2140, -Math.round(sales * LAW.pctTax)]]);
  // quarter end
  if ([3, 6, 9, 12].includes(monthOf(d))) quarterEnd(d);
  // VAT threshold check
  const t12 = trailingSales(312);
  if (!S.vat && t12 > LAW.vatThreshold && !S.vatWarned) { S.vatWarned = true; S.vatSince = d; queue({ type: 'vat' }); }
  // supplier relationship: terms after 3 months of steady buying
  if (IND().channel === 'b2b' && !S.supplier.terms && !S.flags.termsOffered && S.supplier.bought > 400000 && d - S.start > 85 && !S.supplier.late) { S.flags.termsOffered = true; queue({ type: 'terms' }); }
  // 13th month reminder
  if (monthOf(d) === 11) inbox('HR', '13th month pay', `Due on or before December 24. Current accrual: ${peso(-bal(2170))}. You can pay it in Books → Compliance once December starts.`);
  if (monthOf(d) === 11) addDue('13th', `13th month pay (${yearOf(d)})`, 2170, -bal(2170), dayFromYMD(yearOf(d), 12, 24));
  // HR reviews attendance every month and reports problems to the owner
  for (const e of active()) {
    const m = e.mAbs || { sick: 0, noshow: 0 };
    if (['awol', 'leave', 'suspended'].includes(e.status) || S.cases.some((c) => c.emp === e.id && c.stage !== 'closed')) { e.mAbs = { sick: 0, noshow: 0 }; continue; }
    if (m.noshow >= 2 || m.sick + m.noshow >= 4) {
      if (hrOfficer()) queue({ type: 'hrreport', emp: e.id, sick: m.sick, noshow: m.noshow, k: ym(d), warnings: e.warnings });
      else inbox('Supervisor', `Attendance problem: ${e.name}`, `${ymLabel(ym(d))}: ${m.sick} sick day(s), ${m.noshow} no-call no-show(s). With an HR Officer you would get a full report and a recommended action.`);
    }
    e.mAbs = { sick: 0, noshow: 0 };
  }
  // employees: monthly morale drift from perks, regularization reminders
  for (const e of active()) {
    const days = d - e.hired;
    if (e.status === 'probi' && days >= 150 && !e.evalAsked) { e.evalAsked = true; queue({ type: 'regularize', emp: e.id }); }
    if (e.status === 'probi' && days >= LAW.probationDays) { e.status = 'regular'; onRegularized(e); inbox('HR', `${e.name} is now a regular employee`, 'Probation ended without a decision, so the law makes them regular automatically.'); }
  }
}
function quarterEnd(d) {
  const y = yearOf(d), q = Math.ceil(monthOf(d) / 3), keys = monthsOfQuarter(y, q);
  const dueBiz = d + 25;
  if (S.vat) {
    const out = -bal(2150), inp = bal(1300), net = r2(out - inp);
    if (net > 0) { post(`VAT for Q${q} ${y}: close input VAT`, [[2150, inp], [1300, -inp]]); addDue('vat', `Quarterly VAT, BIR 2550Q (Q${q} ${y})`, 2150, net, dueBiz); }
  }
  if (bal(2140) < -0.5) addDue('pct', `Percentage tax, BIR 2551Q (Q${q} ${y})`, 2140, -bal(2140), dueBiz);
  // income tax: cumulative year-to-date, minus earlier quarters
  const ytdKeys = monthsOfYear(y).slice(0, q * 3);
  const is = incomeStatement(ytdKeys);
  const taxable = is.pretax;
  const rate = taxable <= LAW.cit.lowIncome * q / 4 && totalAssets() <= LAW.cit.lowAssets ? LAW.cit.low : LAW.cit.high;
  const already = S.flags['itPaid_' + y] || 0;
  if (q < 4) {
    const tax = r2(Math.max(0, taxable * rate) - already);
    if (tax > 0) { post(`Income tax Q${q} ${y}`, [[7000, tax], [2160, -tax]]); S.flags['itPaid_' + y] = already + tax; addDue('itq', `Quarterly income tax, BIR 1702Q (Q${q} ${y})`, 2160, tax, d + 60); }
  }
  { const qn = incomeStatement(keys).net; bonusProposal(q, y, qn); }
  S.flags['q_' + y + '_' + q] = true;
}
function yearEnd(d) {
  const y = yearOf(d), keys = monthsOfYear(y);
  // annual income tax (with MCIT from the 4th year)
  const isPre = incomeStatement(keys), assets = totalAssets();
  const rate = isPre.pretax <= LAW.cit.lowIncome && assets <= LAW.cit.lowAssets ? LAW.cit.low : LAW.cit.high;
  let tax = Math.max(0, isPre.pretax * rate);
  const yearNo = y - 2027 + 1, mcit = isPre.gross * LAW.cit.mcit;
  if (yearNo >= LAW.cit.mcitFromYear && mcit > tax) tax = mcit;
  const already = S.flags['itPaid_' + y] || 0, rest = r2(tax - already);
  const save = S.day; S.day = d;
  if (rest > 0) { post(`Income tax ${y}: annual true-up`, [[7000, rest], [2160, -rest]]); addDue('ita', `Annual income tax, BIR 1702-RT (${y})`, 2160, rest, dayFromYMD(y + 1, 4, 15)); }
  else if (rest < 0) post(`Income tax ${y}: excess quarterly payments`, [[1310, -rest], [7000, rest]]);
  S.day = save;
  // leftover 13th month accrual after the December payout goes back to expense
  if (S.flags['paid13_' + y]) {
    const pend = S.due.filter((x) => x.kind === 'final' && !x.paid).reduce((s, x) => s + ((x.split || []).find((sp) => sp[0] === 2170) || [0, 0])[1], 0);
    const left = r2(-bal(2170) - pend);
    S.day = d; if (Math.abs(left) > 0.5) post('13th month accrual true-up', [[2170, left], [6020, -left]]); S.day = save;
  }
  // snapshot statements before closing
  const is = incomeStatement(keys), bs = balanceSheet(), cf = cashFlow(keys);
  const kp = { cust: 0, served: 0, lost: 0, deliveries: 0 }; for (const k of keys) { const M = S.mon[k]; if (M) for (const x in kp) kp[x] += M.k[x] || 0; }
  const prev = S.years[y - 1];
  const yr = { y, is, bs, cf, kp, headcount: headcount(), hires: S.stats.hires, quits: S.stats.quits, fired: S.stats.fired, awol: S.stats.awol, rep: Math.round(S.rep), conf: Math.round(S.board.conf), penalties: is.opex.find((x) => x[0] === 6220) ? is.opex.find((x) => x[0] === 6220)[1] : 0 };
  yr.grade = gradeYear(yr, prev);
  S.years[y] = yr;
  // closing entries: P&L and dividends into retained earnings
  const lines = []; let ni = 0;
  for (const a in S.gl) if (isPL(+a) && Math.abs(S.gl[a]) > 0.004) { lines.push([+a, -S.gl[a]]); ni -= S.gl[a]; }
  const div = bal(3200); if (div) lines.push([3200, -div]);
  lines.push([3100, -(ni - div)]);
  S.day = d; post(`Closing entries ${y}`, lines, 'op', true); S.day = save;
  S.stats = { hires: 0, quits: 0, fired: 0, awol: 0, cases: 0 };
  // new year: SIL, leave conversion, permits
  for (const e of active()) {
    if (holidayCovered() && d - e.hired >= 365) {
      if (e.sil > 0) { const c = e.sil * e.rate; post(`SIL conversion to cash: ${e.name}`, [[6020, c], [1000, -c]]); }
      e.sil = LAW.silDays + (S.policy.perks.leave ? 10 : 0);
    }
    e.ytd = { basic: 0, acc13: 0 };
  }
  const gross = is.sales;
  addDue('permit', `Business permit renewal & local business tax (${y + 1})`, null, Math.round(gross * LAW.lbtRate + 8000 + 3000 * S.locs.length), dayFromYMD(y + 1, 1, 20), { exp: 6160 });
  if (gross > 3e6 || totalAssets() > 6e5) addDue('audit', `External audit of ${y} financial statements (CPA)`, null, Math.round(clamp(gross * 0.004, 30000, 250000)), dayFromYMD(y + 1, 4, 10), { exp: 6170 });
  queue({ type: 'yearend', y });
}
function gradeYear(yr, prev) {
  let pts = 50;
  const eq = Math.max(1, yr.bs.TE), roe = yr.is.net / eq;
  pts += clamp(roe * 120, -30, 30);
  if (prev) pts += clamp((yr.is.sales / Math.max(1, prev.is.sales) - 1) * 60, -15, 20);
  pts -= Math.min(15, yr.penalties / 2000);
  pts -= yr.awol * 2 + yr.quits;
  pts += (yr.conf - 50) / 5;
  return pts >= 85 ? 'A' : pts >= 70 ? 'B' : pts >= 55 ? 'C' : pts >= 40 ? 'D' : 'F';
}
function permitCheck(d) {
  const p = S.due.find((x) => x.kind === 'permit' && !x.paid);
  if (p) inbox('City Hall', 'Business permit deadline today', `Renew today to avoid the 25% surcharge: ${peso(p.amt)}.`);
}

// ---------- HR: daily morale, quits, theft, events ----------
function hrDaily(d, open, R) {
  const mw = minWage();
  let util = 0;
  for (const e of active()) {
    if (e.status === 'awol') { e.awolDays = (e.awolDays || 0) + 1; continue; }
    if (e.status === 'leave' && d >= e.backOn) { e.status = e.wasRegular ? 'regular' : 'probi'; inbox('HR', `${e.name} is back from leave`, ''); }
    if (e.status === 'suspended' && d >= e.backOn) { e.status = e.wasRegular ? 'regular' : 'probi'; }
    // morale target
    const pay = (e.rate / Math.max(mw, marketWage(e.role)) - 1) * 120;
    let perks = 0; for (const p in S.policy.perks) if (S.policy.perks[p]) perks += PERKS[p].morale;
    const ot = S.policy.overtime ? -8 : 0, late = -S.payrollLate * 6;
    const mgr = S.ownerRole === 'manage' ? 4 : 0, hr = active().some((x) => x.role === 'hr') ? 5 : 0;
    const target = clamp(55 + pay + perks + ot + late + mgr + hr + (e.attMod || 0) + ((e.att == null ? 0.5 : e.att) - 0.5) * 20, 5, 100);
    e.morale = clamp(e.morale + (target - e.morale) * 0.04 + rnd(-0.6, 0.6), 0, 100);
    if (e.today) e.skill = Math.min(1.4, e.skill + 0.0012 * (e.learn || 1));
    // resignation: life events, better offers, and unhappy staff
    resignCheck(e, d);
    // theft by cash handlers
    if (open && e.today && ['cashier', 'server', 'clerk', 'driver', 'salesman', 'attendant', 'stocker'].includes(e.role) && e.hon < 0.3 && e.morale < 60 && chance(0.01)) {
      const amt = irnd(5, 40) * 100;
      post('Cash shortage (unexplained)', [[6200, amt], [1000, -amt]]);
      S.shortage = (S.shortage || 0) + amt; S.suspects = S.suspects || []; S.suspects.push(e.id);
      const caught = assetFlag('theft') + (active().some((x) => x.role === 'supervisor' && x.today) ? 0.2 : 0);
      if (chance(caught)) { openCase(e, 'theft', { amt, evidence: true }); S.shortage = 0; S.suspects = []; }
    }
  }
  S.payrollLate = Math.max(0, S.payrollLate - 0.02);
  // HR case timers
  for (const c of S.cases) caseTick(c, d);
}
function separate(e, why) {
  e.status = 'gone'; e.left = S.day; e.why = why;
  if (why === 'resigned') S.stats.quits++; else if (why === 'dismissed' || why === 'illegal') S.stats.fired++;
  // final pay: unpaid wages are in the next payroll; 13th month share and unused SIL here
  const share = r2(e.ytd.acc13 || 0) + r2((e.ytd.basic - (e.ytd.acc13 || 0) * 12) / 12);
  const sil = (e.sil || 0) * e.rate;
  const amt = r2(Math.max(0, share) + sil);
  if (amt > 0) {
    if (share > (e.ytd.acc13 || 0)) post(`13th month share accrual: ${e.name}`, [[6020, r2(share - (e.ytd.acc13 || 0))], [2170, -r2(share - (e.ytd.acc13 || 0))]]);
    if (sil) post(`Unused SIL conversion: ${e.name}`, [[6020, sil], [2180, -sil]]);
    addDue('final', `Final pay: ${e.name}`, null, amt, S.day + 30, { emp: e.id, split: [[2170, Math.max(0, share)], [2180, sil]] });
    e.ytd = { basic: 0, acc13: 0 };
  }
  if (S.ownerRole === e.role && false) S.ownerRole = 'manage';
}
// HR cases: awol, theft. Stages: open -> nte -> (reply|noreply) -> hearing -> decided
function openCase(e, type, info) {
  if (S.cases.some((c) => c.emp === e.id && c.stage !== 'closed')) return;
  const c = Object.assign({ id: uid(), emp: e.id, type, stage: 'open', opened: S.day, log: [] }, info || {});
  c.log.push(`${fshort(S.day)}: ${type === 'awol' ? `${e.name} absent without leave for 3 days` : type === 'absent' ? `Habitual absences: ${e.name} (${info.sick || 0} sick, ${info.noshow || 0} no-call no-show this month, ${e.warnings} earlier warning(s))` : `Cash shortage of ${peso(info.amt)} traced to ${e.name}`}`);
  S.cases.push(c); S.stats.cases++;
  queue({ type: 'case', case: c.id });
}
function caseTick(c, d) {
  const e = S.emps.find((x) => x.id === c.emp); if (!e || c.stage === 'closed') return;
  if (c.type === 'awol' && c.stage !== 'closed' && e.status === 'awol') {
    // some come back on their own
    const back = { hospital: 0.05, province: 0.04, newjob: 0.005, none: 0.02 }[c.reason];
    if (!c.returned && chance(back)) { c.returned = true; e.status = e.wasRegular || e.regular ? 'regular' : (d - e.hired >= LAW.probationDays ? 'regular' : 'probi'); c.log.push(`${fshort(d)}: ${e.name} reported back to work`); inbox('HR', `${e.name} came back`, `${caseReasonText(c)} The case is still open: you can hold a conference or close it with a warning.`); }
  }
  if (c.stage === 'nte' && d - c.nteOn >= LAW.nteDays) {
    const replies = { hospital: 0.85, province: 0.6, newjob: 0.2, none: 0.3 }[c.reason] || 0.6;
    if (c.type === 'theft' || chance(replies) || c.returned) { c.stage = 'reply'; c.log.push(`${fshort(d)}: Written explanation received`); c.reply = caseReply(c, e); }
    else { c.stage = 'noreply'; c.log.push(`${fshort(d)}: No reply within ${LAW.nteDays} days`); }
    queue({ type: 'case', case: c.id });
  }
  // complaints filed after unfair dismissal
  if (c.stage === 'closed' && c.risk && !c.filed && d - c.closedOn > 7 && chance(c.risk / 20)) { c.filed = true; startComplaint(e, c); }
}
function caseReasonText(c) {
  return { hospital: 'May sakit pala: na-confine sa ospital (may medical certificate).', province: 'Umuwi sa probinsya: emergency sa pamilya, walang load para mag-text.', newjob: 'Nag-apply pala sa ibang trabaho at doon na pumasok.', none: 'Walang malinaw na dahilan.' }[c.reason] || '';
}
function caseReply(c, e) {
  if (c.type === 'absent') return e.rel > 0.85 ? 'Explains the absences were real emergencies (sick child, flooding) and attaches a medical certificate. Promises it will not happen again.' : 'Says the commute is hard and sometimes oversleeps. No documents attached.';
  if (c.type === 'theft') return e.hon < 0.3 ? 'Denies taking the money; says others also handle the cash drawer.' : 'Says the shortage was a counting mistake and offers to pay it back.';
  return caseReasonText(c);
}
function caseAction(id, act) {
  const c = S.cases.find((x) => x.id === id), e = c && S.emps.find((x) => x.id === c.emp); if (!c || !e) return '';
  if (act === 'nte') {
    c.stage = 'nte'; c.nteOn = S.day; c.log.push(`${fshort(S.day)}: Notice to Explain sent to last known address (${LAW.nteDays} days to reply)`);
    post('Registered mail / courier for notice', [[6240, 150], [1000, -150]]);
    return `Notice to Explain sent. ${e.name} has ${LAW.nteDays} calendar days to answer in writing.`;
  }
  if (act === 'firenow') {   // no due process
    c.stage = 'closed'; c.closedOn = S.day; c.outcome = 'Dismissed without notice (no due process)';
    c.risk = c.type === 'theft' ? (c.evidence ? 0.5 : 0.8) : (c.reason === 'hospital' ? 0.9 : c.reason === 'province' ? 0.6 : 0.35);
    c.badProcess = true; c.validCause = c.type === 'theft' ? !!c.evidence : c.reason === 'newjob' || c.reason === 'none';
    separate(e, 'dismissed'); c.log.push(`${fshort(S.day)}: Dismissed by text message`);
    return `${e.name} was told by text that they're fired. No notice, no hearing: this is risky.`;
  }
  if (act === 'warn') {
    c.stage = 'closed'; c.closedOn = S.day; c.outcome = 'Written warning'; e.warnings++;
    if (e.status === 'awol') e.status = d2reg(e);
    e.morale = clamp(e.morale - 5, 0, 100);
    c.log.push(`${fshort(S.day)}: Closed with a written warning`); return 'Case closed with a written warning.';
  }
  if (act === 'suspend') {
    c.stage = 'closed'; c.closedOn = S.day; c.outcome = '7-day suspension'; e.wasRegular = e.status === 'regular' || S.day - e.hired >= LAW.probationDays;
    e.status = 'suspended'; e.backOn = S.day + 7; e.warnings++;
    c.log.push(`${fshort(S.day)}: Notice of Decision: 7-day suspension without pay`); return 'Suspended for 7 days without pay.';
  }
  if (act === 'dismiss') {
    const heard = ['reply', 'noreply', 'heard'].includes(c.stage);
    c.stage = 'closed'; c.closedOn = S.day; c.outcome = 'Dismissed after due process';
    c.validCause = c.type === 'theft' ? !!c.evidence || e.hon < 0.3 : c.type === 'absent' ? e.warnings >= 2 && e.rel <= 0.85 : ['newjob', 'none'].includes(c.reason) || (c.reason === 'province' && !c.returned);
    c.badProcess = !heard;
    c.risk = c.validCause ? (c.badProcess ? 0.5 : 0.05) : 0.7;
    separate(e, 'dismissed'); c.log.push(`${fshort(S.day)}: Notice of Decision: dismissal served`);
    return `${e.name} was dismissed. Notice of Decision served${c.validCause ? '' : '. Note: the reason they gave may count as a valid excuse.'}`;
  }
  if (act === 'accept') {   // they resign instead
    c.stage = 'closed'; c.closedOn = S.day; c.outcome = 'Resigned'; separate(e, 'resigned');
    c.log.push(`${fshort(S.day)}: Accepted resignation letter`); return `${e.name} resigned. Release the final pay and a certificate of employment.`;
  }
  return '';
}
const d2reg = (e) => (S.day - e.hired >= LAW.probationDays || e.regular ? 'regular' : 'probi');
function startComplaint(e, c) {
  const days = S.day - c.closedOn;
  let ask;
  if (!c.validCause) {   // illegal dismissal: backwages + separation pay in lieu of reinstatement + 10% attorney's fees
    const years = Math.max(1, Math.round((c.closedOn - e.hired) / 365));
    ask = Math.round((e.rate * 26 * (days / 30 + 3) + e.rate * 26 * years) * 1.1);
  } else ask = LAW.agabon;   // valid cause, no due process: nominal damages
  S.flags.complaintRisk = (S.flags.complaintRisk || 0) + 0.3;
  queue({ type: 'sena', emp: e.id, case: c.id, ask, valid: c.validCause });
  inbox('DOLE', `SEnA request: ${e.name}`, `${e.name} filed a Request for Assistance (Single Entry Approach) for ${c.validCause ? 'lack of due process' : 'illegal dismissal'}. A 30-day conciliation conference is set.`);
}

// ---------- random events ----------
function events(d, open, R) {
  S.brownoutToday = false; S.weatherToday = '';
  const m = monthOf(d), typhoonSeason = m >= 6 && m <= 11;
  if (chance(typhoonSeason ? 0.012 : 0.002) && !S.flags['bagyo_' + ym(d)]) {
    S.flags['bagyo_' + ym(d)] = true;
    const sig = pick([1, 2, 2, 3]);
    if (sig >= 2) { S.closedUntil = d + sig - 1; queue({ type: 'info', title: `Bagyo: Signal No. ${sig}`, body: `PAGASA raised Signal No. ${sig}. You close for ${sig - 1} day(s). ${hasFloodRisk() ? 'Flooding damaged some stock.' : ''}` }); if (hasFloodRisk()) floodLoss(); }
    else S.weatherToday = 'ulan';
  } else if (typhoonSeason && chance(0.25)) S.weatherToday = 'ulan';
  if (chance(0.025)) { S.brownoutToday = true; R.notes.push(assetFlag('power') ? 'Brownout: generator kept you running' : 'Brownout for 4 hours: lost capacity'); }
  if (!open) return;
  if (S.queue.length) return;   // one decision at a time
  const I = IND(), r = Math.random();
  if (r < 0.004 && !(S.competitorUntil > d)) { S.competitorUntil = d + 120; queue({ type: 'info', title: 'May bagong kakumpitensya', body: I.channel === 'b2b' ? 'A big distributor started offering lower prices to stores in your area. Expect fewer orders for a few months.' : 'A new competitor opened nearby. Fewer walk-ins for a few months unless your service and prices are better.' }); return; }
  if (r < 0.007 && I.channel === 'walkin') { const good = S.rep > 55 ? chance(0.7) : chance(0.3); S.viral = good ? 1.25 : 0.8; S.viralUntil = d + 21; queue({ type: 'info', title: good ? 'Viral sa Facebook!' : 'Bad review went viral', body: good ? 'Someone posted your store and it blew up. Expect more customers for 3 weeks.' : 'An angry customer posted about bad service. Fewer customers for 3 weeks. Better service will fix it.' }); return; }
  if (r < 0.010) { queue({ type: 'solicit', amt: pick([500, 1000, 2000, 3000]) }); return; }
  if (r < 0.013 && active().length) { const e = pick(active().filter((x) => x.status === 'regular' || x.status === 'probi') || []); if (e) queue({ type: 'advance', emp: e.id, amt: pick([2000, 3000, 5000]) }); return; }
  if (r < 0.015) { queue({ type: 'padrino' }); return; }
  if (r < 0.018) { robbery(); return; }
  if (r < 0.021 && S.assets.some((a) => !IND().assets[a.key] || !IND().assets[a.key].service)) { breakdown(); return; }
  if (r < 0.024 && (S.ind === 'food' || S.ind === 'bakery')) { queue({ type: 'inspect' }); return; }
  if (r < 0.028 && I.channel === 'walkin' && S.ind !== 'laundry') { queue({ type: 'bigorder', qty: irnd(60, 200) }); return; }
  if (r < 0.031 && I.channel === 'b2b' && S.ar.length) { const a = pick(S.ar); queue({ type: 'bounce', ar: a.id }); return; }
  if (r < 0.034) { const w = active().filter((e) => e.female && e.status !== 'leave' && e.age <= 40 && !(e.lastLeave > d - 400)); if (w.length && chance(0.12)) { const e = pick(w); e.lastLeave = d; queue({ type: 'maternity', emp: e.id }); return; } }
  if (r < 0.036 + 0.004 * headcount() / 10 + (S.flags.complaintRisk || 0) * 0.02 && headcount() >= 2) { queue({ type: 'dole' }); S.flags.complaintRisk = Math.max(0, (S.flags.complaintRisk || 0) - 0.2); return; }
  if (r < 0.06 && I.channel === 'walkin' && S.ind !== 'laundry' && dow(d) !== 0 && (dom(d) === 15 || dom(d) === 30 || chance(0.25))) { queue({ type: 'rush' }); return; }
  if (r < 0.07 && (S.shortage || chance(0.25))) { queue({ type: 'cashcount' }); return; }
  if (r < 0.075 && I.channel === 'b2b') { queue({ type: 'negotiate' }); return; }
  if (S.vat === false && S.vatWarned && d - S.vatSince > 60 && chance(0.01)) { queue({ type: 'birAudit' }); }
}
function hasFloodRisk() { return S.ind !== 'laundry' && chance(0.5); }
function floodLoss() {
  let loss = 0; for (const k in S.inv) { const q = Math.floor(stockQty(k) * rnd(0.05, 0.15)); if (q > 0) loss += takeStock(k, q); }
  loss = Math.round(loss); if (loss) post('Flood damage to inventory', [[6200, loss], [1200, -loss]]);
}
function robbery() {
  const amt = Math.round(Math.min(Math.max(0, cash()) * 0.05, rnd(3000, 25000)) * (hasAsset('cctv') ? 0.5 : 1));
  if (amt < 500) return;
  post('Hold-up: cash stolen (police report filed)', [[6240, amt], [1000, -amt]]);
  queue({ type: 'info', title: 'Na-holdap!', body: `Armed robbers took ${peso(amt)} from the cash drawer. Nobody was hurt. A police blotter was filed.${hasAsset('cctv') ? ' CCTV footage helped, the loss was smaller.' : ' A CCTV would help.'}` });
}
function breakdown() {
  const a = pick(S.assets.filter((x) => x.cost > 0 && IND().assets[x.key])); if (!a) return;
  const cost = Math.round(a.cost * rnd(0.03, 0.08) / 100) * 100;
  post(`Repair: ${a.name}`, [[6140, cost], [1000, -cost]]);
  a.broken = 0;
  if (IND().assets[a.key].vehicle || IND().assets[a.key].machine) { a.broken = 1; a.fixOn = S.day + irnd(1, 3); }
  queue({ type: 'info', title: `Sira ang ${a.name}`, body: `Repair cost: ${peso(cost)}. ${a.broken ? 'Out of service for a few days.' : 'Fixed the same day.'}` });
}
function fixAssets() { for (const a of S.assets) if (a.broken && S.day >= a.fixOn) a.broken = 0; }

// ---------- board ----------
function planRevenuePerQuarter() {
  const I = IND();
  if (I.channel === 'b2b') return 1100000;
  const ticket = Object.values(I.lines).reduce((s, l) => s + l.p * (l.q || 1) * l.price, 0);
  return Math.round(I.base * ticket * 26 * 3 * 0.75 / 10000) * 10000;
}
function firstTargets() {
  const rev = Math.round(planRevenuePerQuarter() * S.board.strict / 10000) * 10000;
  return { rev, ni: Math.round(rev * 0.03 / 1000) * 1000, q: 1, y: 2027 };
}
function boardCheck(d) {
  if (S.board.none) return;
  // quarterly meeting on the first weekday after the 10th of Jan/Apr/Jul/Oct (Q4 of 2026 does not exist)
  const m = monthOf(d);
  if ([1, 4, 7, 10].includes(m) && dom(d) >= 10 && dow(d) !== 0 && !S.flags['bm_' + ym(d)] && d > S.start + 60) {
    S.flags['bm_' + ym(d)] = true;
    queue({ type: 'board', y: m === 1 ? yearOf(d) - 1 : yearOf(d), q: m === 1 ? 4 : (m - 1) / 3 });
  }
  // the board notices a missing monthly report
  if (dom(d) === 11) { const k = ym(d - 15); if (d - S.start > 30 && !S.board.reportSent[k] && !S.flags['nr_' + k]) { S.flags['nr_' + k] = true; S.board.conf = clamp(S.board.conf - 3, 0, 100); inbox('Board', `Where is the ${ymLabel(k)} report?`, 'We have not received the monthly report. Please send it.'); } }
}
function sendReport(k, prepared) {
  if (S.board.reportSent[k]) return 0;
  const late = dom(S.day) > 10 && ym(S.day) !== k;
  S.board.reportSent[k] = true;
  const is = incomeStatement([k]);
  let dc = (late ? -2 : 2) + (prepared ? 1 : 0);
  if (is.net < 0) dc -= 1; else dc += 1;
  S.board.conf = clamp(S.board.conf + dc, 0, 100);
  const msg = is.net < 0 ? `Lugi tayo ng ${peso(-is.net)} this month. Ano ang plano?` : `Kumita tayo ng ${peso(is.net)}. Keep it up.`;
  inbox('Board', `Re: ${ymLabel(k)} report`, msg + (late ? ' Next time, please send it on time.' : ''));
  return dc;
}
function quarterResults(y, q) {
  const keys = monthsOfQuarter(y, q), is = incomeStatement(keys), cf = cashFlow(keys);
  const t = S.board.targets || { rev: 0, ni: 0 };
  const overdue = S.due.filter((x) => !x.paid && x.due < S.day).length + (S.flags.latePay || 0);
  const cases = S.cases.filter((c) => c.filed && !c.settled).length;
  return { y, q, is, cf, t, overdue, cases, cashEnd: cash(), head: headcount(), rep: Math.round(S.rep) };
}
// questions are built from real numbers so the player has to know their own books
function boardQuestions(res) {
  const Q = [], is = res.is;
  const gm = is.sales ? is.gross / is.sales : 0;
  const opts3 = (v, f) => { const a = [v, v * rnd(1.25, 1.6), v * rnd(0.45, 0.75)].map(f); return a.sort(() => Math.random() - 0.5); };
  Q.push({ q: 'Magkano ang gross margin natin ngayong quarter?', opts: opts3(gm * 100, (x) => x.toFixed(1) + '%'), ans: (gm * 100).toFixed(1) + '%', kind: 'num' });
  Q.push({ q: 'Ano ang net income natin this quarter?', opts: opts3(Math.abs(is.net) || 1000, (x) => peso((is.net < 0 ? -1 : 1) * Math.round(x))), ans: peso((is.net < 0 ? -1 : 1) * Math.round(Math.abs(is.net) || 1000)), kind: 'num' });
  if (IND().channel === 'b2b' && -bal(1100) !== 0) {
    const ar = bal(1100), q3 = sumPL(monthsOfQuarter(res.y, res.q), [4000]);
    const days = q3 ? Math.round(ar / (q3 / 90)) : 0;
    Q.push({ q: `Receivables are ${peso(Math.round(ar))}. Ilang araw bago tayo makakolekta (DSO)?`, opts: opts3(Math.max(1, days), (x) => Math.round(x) + ' days'), ans: Math.max(1, days) + ' days', kind: 'num' });
  }
  const waste = (is.opex.find((x) => x[0] === 6200) || [0, 0])[1];
  if (waste > is.sales * 0.02) Q.push({ q: `Bakit ang laki ng spoilage/losses (${peso(Math.round(waste))})?`, opts: ['Overproduction and shrinkage: we will tighten planning and controls', 'That is normal, no need to worry', 'The accountant made an error'], ans: 'Overproduction and shrinkage: we will tighten planning and controls', kind: 'talk' });
  if (res.overdue) Q.push({ q: 'May late filings or payments tayo sa gobyerno. Bakit?', opts: ['Cash timing; we will hire a bookkeeper and set a calendar', 'BIR is too strict anyway', 'No penalties were paid'], ans: 'Cash timing; we will hire a bookkeeper and set a calendar', kind: 'talk' });
  if (S.stats.awol + S.stats.quits >= 2) Q.push({ q: 'Ang daming umaalis na tao. Ano ang nangyayari?', opts: ['Pay and morale: we are reviewing wages and benefits', 'Mga tamad lang sila', 'Wala namang umalis'], ans: 'Pay and morale: we are reviewing wages and benefits', kind: 'talk' });
  if (res.cashEnd < 50000) Q.push({ q: 'Mababa ang cash. Paano tayo magpa-payroll next month?', opts: ['Collect receivables, cut stock, and request a small capital infusion', 'Bahala na', 'We have plenty of cash'], ans: 'Collect receivables, cut stock, and request a small capital infusion', kind: 'talk' });
  return Q.sort(() => Math.random() - 0.5).slice(0, 3);
}
function boardOutcome(res, correct, total) {
  const t = res.t, is = res.is;
  let dc = 0;
  dc += clamp((is.sales / Math.max(1, t.rev) - 1) * 40, -15, 12);
  dc += is.net >= t.ni ? 6 : is.net >= 0 ? 0 : -8;
  dc -= Math.min(10, res.overdue * 3) + res.cases * 4;
  dc += (correct - (total - correct)) * 3;
  dc /= S.board.strict;
  S.board.conf = clamp(S.board.conf + dc, 0, 100);
  const next = { rev: Math.round(Math.max(is.sales * (1.04 + 0.04 * S.board.strict), t.rev * 0.9) / 10000) * 10000 };
  next.ni = Math.round(next.rev * (0.04 + 0.01 * S.board.strict) / 1000) * 1000;
  S.board.history.push({ y: res.y, q: res.q, sales: is.sales, net: is.net, t, dc: Math.round(dc), conf: Math.round(S.board.conf) });
  S.board.targets = next;
  if (S.board.conf < 20) { S.flags.lowConf = (S.flags.lowConf || 0) + 1; }
  else S.flags.lowConf = 0;
  return { dc, next };
}
function capitalCall(amt) {
  // investors put in more money for more shares
  post('Additional paid-in capital from investors', [[1000, amt], [3000, -amt]], 'fin');
  S.holders[1].amt += amt;
}
function declareDividend(amt) {
  post('Cash dividends declared and paid', [[3200, amt], [1000, -amt]], 'fin');
}
const ownership = () => { const t = S.holders.reduce((s, h) => s + h.amt, 0); return S.holders.map((h) => ({ name: h.name, pct: h.amt / t })); };
function gameOver(why) { S.over = why; save(); }

// ---------- loans ----------
function takeLoan(id, amt) {
  const L = LOANS.find((x) => x.id === id);
  if (L.daily) {
    const total = amt * (1 + L.rate), inst = r2(total / 26);
    S.loans.push({ id: uid(), name: L.name, bal: total, inst, daily: true, intShare: L.rate / (1 + L.rate) });
    post(`5-6 loan received (repay ${peso(total)})`, [[1000, amt], [6180, total - amt], [2200, -total]], 'fin');
  } else {
    const i = L.rate / 12, n = L.months, pmt = r2(amt * i / (1 - Math.pow(1 + i, -n)));
    S.loans.push({ id: uid(), name: L.name, bal: amt, rate: L.rate, pmt, months: n });
    post(`${L.name} proceeds`, [[1000, amt], [2200, -amt]], 'fin');
  }
}
function loanLimit(id) {
  const L = LOANS.find((x) => x.id === id);
  if (L.daily) return 50000;
  const eq = balanceSheet().TE;
  if (S.day - S.start < 180 || eq <= 0) return 0;
  return Math.max(0, Math.round(eq * L.maxF / 10000) * 10000 - S.loans.filter((x) => !x.daily).reduce((s, x) => s + x.bal, 0));
}
