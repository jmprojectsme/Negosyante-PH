/* Negosyante PH: stages, market news & trends, new products, supply contracts, job openings, growth advisor. */
'use strict';

// ---------- stages: the long-term purpose ----------
// targets scale with the industry's normal monthly sales
const STAGES = [
  { n: 1, name: 'Bagong bukas', em: '\u{1F331}', desc: 'Just opened. Learn the ropes.' },
  { n: 2, name: 'Kilala sa barangay', em: '\u{1F3E0}', desc: 'Neighbors know you.', need: { sales: 0.8, rep: 50, staff: 2 }, unlock: 'New products (R&D) and supply contracts' },
  { n: 3, name: 'Suki ng bayan', em: '⭐', desc: 'A steady, profitable business.', need: { sales: 1.3, profit: 2, staff: 4 }, unlock: 'Bigger location (tier 2) and branches' },
  { n: 4, name: 'Lumalaking negosyo', em: '\u{1F4C8}', desc: 'Growing beyond one store.', need: { sales: 2.4, staff: 8, sites: 2 }, unlock: 'Top-tier location and bigger bank loans' },
  { n: 5, name: 'Kilalang brand', em: '\u{1F3C6}', desc: 'A name people trust.', need: { sales: 4.5, staff: 15, rep: 70 }, unlock: 'The final challenge' },
  { n: 6, name: 'Negosyante ng Taon', em: '\u{1F451}', desc: 'You built a real company.', need: { sales: 7, netWorth: 8000000 }, unlock: 'You won! Keep growing as long as you like.' }
];
const monthlyBase = () => planRevenuePerQuarter() / 3;
function lastFullMonth() { const k = ym(dayFromYMD(yearOf(S.day), monthOf(S.day), 1) - 1); return S.mon[k] && k >= ym(S.start) ? k : null; }
function stageProgress(st) {
  const N = st.need || {}, out = [];
  const k = lastFullMonth(), is = k ? incomeStatement([k]) : { sales: 0, net: 0 };
  if (N.sales) out.push({ label: `Monthly sales ${pesoK(N.sales * monthlyBase())}`, v: is.sales, max: N.sales * monthlyBase(), fmt: pesoK });
  if (N.rep) out.push({ label: `${IND().channel === 'b2b' ? 'Client loyalty' : 'Reputation'} ${N.rep}`, v: S.rep, max: N.rep, fmt: (x) => Math.round(x) });
  if (N.staff) out.push({ label: `${N.staff} employees`, v: headcount(), max: N.staff, fmt: (x) => x });
  if (N.profit) { const ks = Object.keys(S.mon).filter((x) => x < ym(S.day)).sort().slice(-N.profit); const ok = ks.length >= N.profit && ks.every((x) => incomeStatement([x]).net > 0); out.push({ label: `Profit ${N.profit} months in a row`, v: ok ? N.profit : ks.filter((x) => incomeStatement([x]).net > 0).length, max: N.profit, fmt: (x) => x }); }
  if (N.sites) { const sites = IND().channel === 'b2b' ? (S.locs[0] >= 1 ? 2 : 1) + (vehicles().length >= 3 ? 1 : 0) : S.locs.length + (S.locs[0] >= 1 ? 1 : 0); out.push({ label: IND().channel === 'b2b' ? 'Warehouse or 3 vehicles' : '2 branches or a bigger location', v: Math.min(sites, N.sites), max: N.sites, fmt: (x) => x }); }
  if (N.netWorth) out.push({ label: `Company equity ${pesoK(N.netWorth)}`, v: balanceSheet().TE, max: N.netWorth, fmt: pesoK });
  return out;
}
function checkStage() {
  S.stage = S.stage || 1;
  const nx = STAGES[S.stage]; if (!nx) return;
  if (stageProgress(nx).every((p) => p.v >= p.max)) {
    S.stage++; S.rep = clamp(S.rep + 3, 0, 100); S.board.conf = clamp(S.board.conf + 6, 0, 100);
    queue({ type: 'stage', n: S.stage });
  }
}

// ---------- new products (R&D) ----------
const EXTRA_LINES = {
  bakery: { ube: { name: 'Ube cheese pandesal (10 pcs)', cost: 34, price: 75, p: 0.2, work: { baker: 1.2 }, rd: 30000, trendy: true }, cheesecake: { name: 'Whole cake (for occasions)', cost: 320, price: 650, p: 0.025, work: { baker: 4 }, keeps: 3, rd: 45000 } },
  food: { lechon: { name: 'Lechon kawali meal', cost: 62, price: 135, p: 0.18, work: { cook: 1.3 }, rd: 25000 }, halo: { name: 'Halo-halo', cost: 28, price: 80, p: 0.15, work: { cook: 0.5 }, rd: 15000, summer: true } },
  minimart: { coffee: { name: 'Brewed coffee & siopao', cost: 22, price: 55, p: 0.14, rd: 35000 }, rx: { name: 'OTC medicines', cost: 60, price: 75, p: 0.1, rd: 20000 } },
  laundry: { shoes: { name: 'Shoe cleaning', cost: 45, price: 250, p: 0.05, work: { attendant: 1.5 }, rd: 18000 }, comforter: { name: 'Comforter & curtains', cost: 90, price: 350, p: 0.08, work: { attendant: 1, washer: 2, dryer: 2 }, rd: 12000 } },
  trading: { gatas: { name: 'Powdered milk (case)', cost: 2400, price: 2720, w: 0.5, u: 'case', rd: 20000 }, frozen: { name: 'Frozen hotdog & tocino (case)', cost: 1800, price: 2060, w: 0.4, u: 'case', rd: 60000 } }
};
const BASE_LINES = {};
function applyUnlocks() {
  // the industry data is shared, so put back the base list and add this game's unlocked products
  for (const ind in INDUSTRIES) {
    if (!BASE_LINES[ind]) BASE_LINES[ind] = Object.assign({}, INDUSTRIES[ind].lines);
    INDUSTRIES[ind].lines = Object.assign({}, BASE_LINES[ind]);
  }
  S.unlocked = S.unlocked || [];
  for (const k of S.unlocked) if (EXTRA_LINES[S.ind] && EXTRA_LINES[S.ind][k]) IND().lines[k] = EXTRA_LINES[S.ind][k];
}
function developProduct(k) {
  const L = EXTRA_LINES[S.ind][k];
  post(`Product development: ${L.name}`, [[6210, L.rd], [1000, -L.rd]]);
  S.unlocked.push(k); applyUnlocks();
  S.market[k] = S.market[k] || 1; S.price[k] = L.price; S.demandAvg[k] = 0;
  S.inv[k] = IND().mode === 'prep' ? [] : { q: 0, c: L.cost };
  if (L.trendy) S.trend = { k, mult: 1.6, until: S.day + 45, why: 'bagong labas' };
}

// ---------- market news and trends ----------
const MARKET_NEWS = {
  bakery: [['Tumaas ang presyo ng harina (wheat import costs)', ['pandesal', 'spanish', 'ensaymada', 'loaf', 'ube'], 1.12], ['Bumaba ang presyo ng asukal', ['ensaymada', 'cake', 'cheesecake', 'spanish'], 0.93], ['Mahal ang itlog dahil sa bird flu', ['ensaymada', 'cake', 'cheesecake', 'loaf'], 1.1], ['LPG price hike', ['pandesal', 'loaf', 'spanish'], 1.05]],
  food: [['Mahal ang baboy dahil sa ASF', ['ulam', 'lechon', 'silog'], 1.14], ['Bumaba ang presyo ng gulay', ['ulam', 'merienda'], 0.94], ['Rice price cap ends: tumaas ang bigas', ['ulam', 'silog', 'lechon'], 1.08], ['LPG price hike', ['ulam', 'silog', 'merienda', 'lechon'], 1.05]],
  minimart: [['Supplier promo: mas mura ang snacks', ['snacks'], 0.92], ['Tumaas ang presyo ng bigas at de lata', ['staples'], 1.08], ['Excise tax: mas mahal ang sigarilyo', ['load'], 1.06], ['Shampoo and soap price increase', ['care'], 1.07]],
  laundry: [['Meralco rate hike', ['wdf', 'self', 'comforter'], 1.08], ['Detergent wholesale sale', ['wdf', 'self', 'press'], 0.93], ['Maynilad water rate adjustment', ['wdf', 'self', 'comforter'], 1.05]],
  trading: [['Rice import tariff cut', ['bigas'], 0.92], ['Sugar shortage: SRA allows imports', ['asukal'], 1.15], ['Canned goods price increase (DTI approved)', ['sardinas', 'gatas'], 1.06], ['Oil price hike', ['mantika'], 1.1], ['Softdrinks price adjustment', ['softdrinks'], 1.05]]
};
const TRENDS = {
  bakery: [['pandesal', 'Back-to-school: pandesal for baon'], ['spanish', 'Nag-viral ang Spanish bread sa TikTok'], ['loaf', 'Sandwich trend sa mga opisina'], ['ube', 'Ube everything is trending']],
  food: [['silog', 'Silog craze sa mga call center agents'], ['merienda', 'Pancit for birthdays this month'], ['halo', 'Summer heat: halo-halo season'], ['lechon', 'Lechon kawali trend sa FB']],
  minimart: [['snacks', 'New viral chips everyone wants'], ['frozen', 'Mga nanay nag-iimbak ng frozen food'], ['coffee', 'Coffee to-go habit']],
  laundry: [['wdf', 'Rainy season: walang matuyuan ng labada'], ['deliver', 'Busy workers want pickup and delivery'], ['comforter', 'Holiday cleaning: comforters and curtains']],
  trading: [['noodles', 'Typhoon season stock-up'], ['softdrinks', 'Fiesta season orders'], ['bigas', 'Panic buying before price hike']]
};
function monthlyMarket(d) {
  const news = MARKET_NEWS[S.ind] || [];
  if (chance(0.45) && news.length) {
    const [txt, ks, f] = pick(news);
    for (const k of ks) if (S.market[k] != null) S.market[k] = clamp(S.market[k] * f, 0.6, 3);
    inbox('Market', `${f > 1 ? '\u{1F4C8}' : '\u{1F4C9}'} ${txt}`, `Costs ${f > 1 ? 'up' : 'down'} about ${Math.round(Math.abs(f - 1) * 100)}% for: ${ks.filter((k) => IND().lines[k]).map((k) => IND().lines[k].name).join(', ')}.\n\nCheck your margins in Ops → Prices. Competitors usually adjust their prices too, so the market price moves with it.`);
    S.marketLog = (S.marketLog || []).concat({ d, txt, f }).slice(-12);
  }
  const tr = (TRENDS[S.ind] || []).filter(([k]) => IND().lines[k] && !(IND().lines[k].needs && !hasAsset(IND().lines[k].needs)));
  if (!(S.trend && S.trend.until > d) && chance(0.35) && tr.length) {
    const [k, why] = pick(tr);
    S.trend = { k, mult: rnd(1.35, 1.7), until: d + irnd(20, 40), why };
    inbox('Market', `\u{1F525} Uso ngayon: ${IND().lines[k].name}`, `${why}. Demand for ${IND().lines[k].name} is up about ${Math.round((S.trend.mult - 1) * 100)}% until ${fshort(S.trend.until)}. Make or stock more, and you can charge a bit more too.`);
  }
}
const trendMult = (k) => (S.trend && S.trend.k === k && S.day < S.trend.until ? S.trend.mult : 1) * (IND().lines[k] && IND().lines[k].summer ? ([3, 4, 5].includes(monthOf(S.day)) ? 1.5 : 0.6) : 1);

// ---------- supply contracts (walk-in industries) ----------
const CONTRACT_OFFERS = {
  bakery: { line: 'pandesal', who: ['5 sari-sari stores sa Purok 3', 'Elementary school canteen', 'Hospital cafeteria', 'Call center pantry', 'Barangay feeding program'], qty: [20, 80], disc: [0.78, 0.88] },
  food: { line: 'ulam', who: ['BPO office: packed lunch', 'Construction site crew', 'Factory canteen', 'Church event every Sunday? No: weekday office meals', 'Barangay hall staff'], qty: [25, 90], disc: [0.8, 0.9] },
  laundry: { line: 'wdf', who: ['Boarding house (12 rooms)', 'Small hotel linens', 'Massage spa towels', 'Dormitory for nursing students'], qty: [6, 20], disc: [0.75, 0.88] },
  minimart: { line: 'staples', who: ['Carinderia bulk order', 'Company pantry supplies', 'Barangay relief goods'], qty: [30, 90], disc: [0.88, 0.95] }
};
function contractOffer() {
  const O = CONTRACT_OFFERS[S.ind]; if (!O || !IND().lines[O.line]) return null;
  const qty = Math.round(irnd(O.qty[0], O.qty[1]) * (1 + (S.stage || 1) * 0.15));
  const price = Math.round(S.price[O.line] * rnd(O.disc[0], O.disc[1]));
  return { id: uid(), name: pick(O.who), line: O.line, qty, price, terms: pick([7, 15, 30]), months: pick([3, 6]), rel: rnd(0.8, 0.98), exp: S.day + 7 };
}
function contractQty() { const q = {}; for (const c of S.contracts || []) if (c.until > S.day) q[c.line] = (q[c.line] || 0) + c.qty; return q; }
// called from the day: deliver what we can, invoice on terms
function deliverContracts(d, take) {
  let sales = 0, cogs = 0;
  for (const c of S.contracts || []) {
    if (c.until <= d) continue;
    const got = take(c.line, c.qty);   // returns { n, cost }
    const amt = got.n * c.price;
    if (got.n) {
      const vat = vatable(c.line) ? amt / 1.12 * 0.12 : 0;
      post(`Contract delivery: ${c.name}`, [[1100, amt], [4000, -(amt - vat)], [2150, -vat]]);
      S.ar.push({ id: uid(), c: c.id, amt, due: d + c.terms, d, paid: 0 });
      sales += amt; cogs += got.cost;
    }
    if (got.n < c.qty) { c.short = (c.short || 0) + 1; if (c.short === 3) inbox('Sales', `Warning from ${c.name}`, 'Three short deliveries. One more and we cancel the contract.'); if (c.short >= 4) { c.until = d; inbox('Sales', `${c.name} cancelled the contract`, 'Too many incomplete deliveries. Make sure you have the capacity before signing.'); S.rep = clamp(S.rep - 4, 0, 100); } }
  }
  S.contracts = (S.contracts || []).filter((c) => c.until > d || S.ar.some((a) => a.c === c.id));
  return { sales, cogs };
}

// ---------- job openings ----------
function openingFor(role) { return (S.openings || []).find((o) => o.role === role && o.status === 'open'); }
function openPosition(role, chId, slots) {
  S.openings = S.openings || [];
  let o = openingFor(role);
  if (!o) { o = { id: uid(), role, slots: slots || 1, filled: 0, status: 'open', opened: S.day }; S.openings.push(o); }
  else o.slots = Math.max(o.slots, (o.filled || 0) + (slots || 1));
  postJob(role, chId);
  return o;
}
function closePosition(id, why) {
  const o = (S.openings || []).find((x) => x.id === id); if (!o) return;
  o.status = 'closed'; o.closedOn = S.day; o.why = why || 'closed';
  const rejected = S.applicants.filter((a) => a.role === o.role).length;
  S.applicants = S.applicants.filter((a) => a.role !== o.role);
  S.posts = S.posts.filter((p) => p.role !== o.role);
  return rejected;
}
function noteHire(role) {
  const o = openingFor(role); if (!o) return null;
  o.filled = (o.filled || 0) + 1;
  if (o.filled >= o.slots) { const n = closePosition(o.id, 'filled'); return { filled: true, rejected: n }; }
  return { filled: false };
}

// ---------- growth advisor: what limits sales and what each fix is worth ----------
function growthAnalysis() {
  const I = IND(); if (I.channel !== 'walkin') return null;
  const L = S.locs.map((t) => I.locations[t]);
  const unlocked = Object.keys(I.lines).filter((k) => !(I.lines[k].needs && !hasAsset(I.lines[k].needs)));
  const perCust = {}, ticket = unlocked.reduce((s, k) => s + I.lines[k].p * (I.lines[k].q || 1) * S.price[k], 0);
  const margin = unlocked.reduce((s, k) => s + I.lines[k].p * (I.lines[k].q || 1) * (S.price[k] - lineCost(k)), 0);
  for (const k of unlocked) for (const r in (I.lines[k].work || {})) perCust[r] = (perCust[r] || 0) + I.lines[k].p * (I.lines[k].q || 1) * I.lines[k].work[r];
  const units = unlocked.reduce((s, k) => s + I.lines[k].p * (I.lines[k].q || 1), 0);
  const roleCap = (r) => active().filter((e) => e.role === r && !['awol', 'leave', 'suspended'].includes(e.status)).reduce((s, e) => s + (I.roles[r].cap || 0) * e.skill * (0.8 + 0.4 * e.morale / 100), 0) + (I.owner[r] ? (S.ownerRole === r ? I.owner[r] : headcount() < 3 && S.ownerRole !== 'manage' ? I.owner[r] * 0.4 : 0) : 0);
  const caps = {};
  const custRole = { food: 'server', bakery: 'clerk', minimart: 'cashier' }[S.ind];
  if (custRole) caps[custRole] = roleCap(custRole) * (S.ind === 'food' && roleCap('cashier') === 0 ? 0.8 : 1);
  for (const r in perCust) if (I.roles[r]) caps[r] = roleCap(r) / perCust[r];
  if (S.ind === 'food') caps.seats = L.reduce((s, l) => s + l.seats, 0) * I.turns / 0.6;
  if (S.ind === 'bakery') caps.oven = assetCount('oven') * I.ovenCap / units;
  if (S.ind === 'laundry') { caps.washer = assetCount('washer') * I.machineCap / (perCust.washer || 1); caps.dryer = assetCount('dryer') * I.machineCap / (perCust.dryer || 1); }
  if (S.ind === 'minimart') caps.stocker = roleCap('stocker') / units;
  const traffic = L.reduce((s, l) => s + l.traffic, 0);
  const demand = Math.round(I.base * traffic * (0.55 + S.rep / 110) * MARKETING[S.policy.mkt].boost);
  const capNow = Math.min(...Object.values(caps));
  const served = Math.min(demand, capNow);
  const names = { seats: 'Seats', oven: 'Oven space', washer: 'Washers', dryer: 'Dryers' };
  const limits = Object.entries(caps).map(([k, v]) => ({ k, name: names[k] || (I.roles[k] || {}).name || k, v: Math.round(v) })).sort((a, b) => a.v - b.v);
  // options
  const opts = [];
  const tryCaps = (patch) => { const c = Object.assign({}, caps, patch(caps)); return Math.min(...Object.values(c)); };
  const gain = (newCap, newDemand) => Math.max(0, Math.min(newDemand || demand, newCap) - served);
  for (const r in caps) if (I.roles[r]) {
    const add = (I.roles[r].cap || 0) * 0.85 / (r === custRole ? 1 : perCust[r] || 1);
    const g = gain(tryCaps((c) => ({ [r]: c[r] + add })));
    const cost = marketWage(r) * 26 * 1.13;
    opts.push({ what: `Hire 1 more ${I.roles[r].name}`, g, cost: `${pesoK(cost)}/month`, monthlyCost: cost, act: { tab: 'people', sub: 'hire', role: r } });
  }
  const eq = { bakery: ['oven', 'mixer'], food: ['stove'], laundry: ['washer', 'dryer'], minimart: ['pos'] }[S.ind] || [];
  for (const a of eq) {
    const A = I.assets[a]; if (!A || canBuyAsset(a) === 'Max na') continue;
    let patch;
    if (a === 'oven') patch = (c) => ({ oven: c.oven + I.ovenCap / units });
    else if (a === 'washer' || a === 'dryer') patch = (c) => ({ [a]: c[a] + I.machineCap / (perCust[a] || 1) });
    else if (A.boost) patch = (c) => { const p = {}; for (const r in A.boost) if (c[r] != null) p[r] = c[r] * (1 + A.boost[r]); return p; };
    else continue;
    const g = gain(tryCaps(patch));
    opts.push({ what: `Buy ${A.name}`, g, cost: pesoK(A.cost), oneTime: A.cost, act: { tab: 'ops', sub: 'equip' }, why: canBuyAsset(a) });
  }
  // more customers: marketing, a better place, a branch
  if (S.policy.mkt < MARKETING.length - 1) { const m = MARKETING[S.policy.mkt + 1]; const nd = Math.round(demand * m.boost / MARKETING[S.policy.mkt].boost); opts.push({ what: `Marketing: ${m.name}`, g: gain(capNow, nd), cost: `${pesoK(m.cost)}/month`, monthlyCost: m.cost - MARKETING[S.policy.mkt].cost, act: { tab: 'ops', sub: 'mkt' } }); }
  const nextLoc = I.locations[S.locs[0] + 1];
  if (nextLoc) { const nd = Math.round(demand * (traffic - L[0].traffic + nextLoc.traffic) / traffic); const ncap = S.ind === 'food' ? tryCaps((c) => ({ seats: c.seats + (nextLoc.seats - L[0].seats) * I.turns / 0.6 })) : capNow; opts.push({ what: `Move to ${nextLoc.name}`, g: gain(ncap, nd), demandUp: nd - demand, cost: `rent ${pesoK(nextLoc.rent)}/mo`, monthlyCost: nextLoc.rent - L[0].rent, act: { tab: 'ops', sub: 'site' }, why: locationOptions()[S.locs[0] + 1].block }); }
  return { demand, served: Math.round(served), capNow: Math.round(capNow), limits, ticket, margin, opts: opts.map((o) => Object.assign(o, { daily: Math.round(o.g * ticket), dailyGP: Math.round(o.g * margin) })).sort((a, b) => (b.dailyGP * 26 - (b.monthlyCost || 0)) - (a.dailyGP * 26 - (a.monthlyCost || 0))) };
}
