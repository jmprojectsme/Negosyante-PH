// Negosyante PH: approvals. Your staff do the work and recommend; you, the owner, approve.
// HR: salary increase after regularization, January merit increases, quarterly bonus, manpower requests.
// Bookkeeper: payment vouchers (taxes, SSS, suppliers), price adjustments when costs move.
// Supervisor / Salesman: supply-contract recommendations, price recommendations.

const APV = () => (S.approvals = S.approvals || []);
const onDuty = (role) => active().find((e) => e.role === role && !['awol', 'leave', 'suspended'].includes(e.status) && !(e.startOn > S.day));
const fromLabel = (e, title) => `${title || roleDef(e.role).name}: ${e.name}`;
function addApproval(kind, who, title, body, data, days) {
  const a = { id: uid(), kind, from: who ? fromLabel(who) : 'Staff', who: who ? who.id : null, title, body, data: data || {}, made: S.day, exp: S.day + (days || 14) };
  APV().push(a);
  return a;
}
function approvalLog(a, what) {
  S.approvalLog = (S.approvalLog || []);
  S.approvalLog.unshift({ d: S.day, title: a.title, from: a.from, what });
  if (S.approvalLog.length > 40) S.approvalLog.length = 40;
}
function resolveApproval(id, i) {
  const a = APV().find((x) => x.id === id); if (!a) return null;
  const ch = APPROVAL_KINDS[a.kind].choices(a)[i]; if (!ch) return null;
  const msg = ch.run();
  if (msg === false) return null;   // could not do it (e.g. no cash): keep it pending
  S.approvals = APV().filter((x) => x !== a);
  approvalLog(a, ch.label);
  return msg || ch.label;
}
const roundRate = (r) => Math.round(r);
const monthlyOf = (daily) => Math.round(daily * 313 / 12);

// ---------- HR: salary increase after regularization ----------
function onRegularized(e) {
  const hr = onDuty('hr'); if (!hr || hr === e) return;
  const t = e.abs || { noshow: 0 };
  const p = t.noshow >= 3 ? 0.02 : e.skill >= 1 ? 0.08 : e.skill >= 0.85 ? 0.05 : 0.03;
  const nr = roundRate(Math.max(e.rate * (1 + p), e.rate + 10));
  addApproval('raise', hr, `Salary increase: ${e.name}`, `${e.name} (${roleDef(e.role).name}) just became a regular employee. In most companies, regularization comes with an increase.\n\nHR recommends +${Math.round(p * 100)}%: ${payLabelA(e.rate)} → ${payLabelA(nr)}.\nReason: ${e.skill >= 1 ? 'performance above standard' : e.skill >= 0.85 ? 'meets the standard' : 'still learning, small step-up'}${t.noshow >= 3 ? ', attendance needs improvement' : ''}.\nAdded cost: about ${peso(monthlyOf(nr - e.rate) * 1.1)}/month incl. SSS/PhilHealth/13th month.`,
    { emp: e.id, pct: p, rate: nr }, 21);
}
function payLabelA(d) { return `${peso(monthlyOf(d))}/month (${peso(d)}/day)`; }

// ---------- HR: merit increase every January ----------
function meritBatch(d) {
  const hr = onDuty('hr'); if (!hr) return;
  const items = [];
  for (const e of active()) {
    if (e.status !== 'regular' || d - e.hired < 300) continue;
    const ns = (e.abs || {}).noshow || 0;
    const p = ns >= 4 ? 0 : e.skill >= 1.05 ? 0.07 : e.skill >= 0.9 ? 0.05 : 0.03;
    if (p > 0) items.push({ emp: e.id, name: e.name, role: roleDef(e.role).name, from: e.rate, to: roundRate(e.rate * (1 + p)), pct: p });
  }
  if (!items.length) return;
  const add = items.reduce((s, x) => s + monthlyOf(x.to - x.from), 0);
  addApproval('merit', hr, `Annual merit increases (${items.length} staff)`, `HR reviewed everyone with at least 10 months of service. Recommended increases based on performance and attendance:\n\n${items.map((x) => `• ${x.name}, ${x.role}: +${Math.round(x.pct * 100)}% → ${peso(monthlyOf(x.to))}/month`).join('\n')}\n\nAdded payroll: about ${peso(Math.round(add * 1.1))}/month. Inflation runs about 3 to 4% a year, so skipping a year feels like a pay cut to them.`,
    { items }, 30);
}

// ---------- HR + bookkeeper: quarterly bonus ----------
function bonusProposal(q, y, net) {
  const hr = onDuty('hr'), bk = onDuty('bookkeeper'); const by = hr || bk; if (!by || net <= 0) return;
  const staff = active().filter((e) => !(e.startOn > S.day) && e.status !== 'awol');
  if (!staff.length) return;
  const monthPay = staff.reduce((s, e) => s + monthlyOf(e.rate), 0);
  const pool = Math.max(500, Math.round(Math.min(net * 0.08, monthPay * 0.5) / 500) * 500);
  addApproval('bonus', by, `Q${q} ${y} performance bonus`, `Q${q} net income was ${peso(Math.round(net))}. ${hr ? 'HR' : 'The bookkeeper'} recommends sharing about 8% of it as a bonus pool: ${peso(pool)}, split by salary (${staff.length} staff).\n\nCash now: ${peso(Math.round(cash()))}. Bonuses are optional (unlike the 13th month), but they raise morale and lower resignations. They are taxable above the ₱90,000 yearly exemption that also covers the 13th month.`,
    { pool, q, y }, 20);
}
function payBonus(pool) {
  if (cash() < pool) { toastA('Kulang ang cash para sa bonus'); return false; }
  const staff = active().filter((e) => !(e.startOn > S.day) && e.status !== 'awol');
  const tot = staff.reduce((s, e) => s + e.rate, 0) || 1;
  post(`Performance bonus (${staff.length} staff)`, [[6020, pool], [1000, -pool]]);
  for (const e of staff) { e.morale = clamp(e.morale + 4 + 8 * (pool / Math.max(1, monthlyOf(tot))) * 2, 0, 100); }
  return `${peso(pool)} bonus released through payroll.`;
}
const toastA = (m) => { if (typeof toast === 'function') toast(m); };

// ---------- HR / supervisor: manpower request ----------
function manpowerCheck(d, R) {
  const by = onDuty('hr') || onDuty('supervisor'); if (!by) return;
  if (APV().some((a) => a.kind === 'hire')) return;
  S.flags.mp = S.flags.mp || {};
  const I = IND(), L = R || S.last; if (!L || !L.open) return;
  if ((S.flags.mpChk || -99) > d - 7) return; S.flags.mpChk = d;
  let role = null, why = '';
  if (I.channel === 'walkin') {
    if (!(L.cust && L.lost > L.cust * 0.08)) return;
    const g = growthAnalysis(); if (!g) return;
    const lim = g.limits[0]; if (!lim || !I.roles[lim.k]) return;
    const opt = g.opts.find((o) => o.act && o.act.role === lim.k);
    if (opt && opt.dailyGP * 26 < opt.monthlyCost) return;   // a hire would not pay for itself
    role = lim.k; why = `${L.lost} of ${L.cust} customers left yesterday without buying. The bottleneck is ${lim.name.toLowerCase()} (about ${lim.v} customers/day).${opt ? ` One more ${I.roles[role].name.toLowerCase()} should add about ${peso(opt.dailyGP)} gross profit a day vs. ${opt.cost} in salary and benefits.` : ''}`;
  } else {
    if (!(L.cap && L.deliveries >= L.cap * 0.95 && (S.backlog || []).length)) return;
    role = 'helper'; why = `Delivery capacity is full (${L.deliveries}/${Math.round(L.cap)} cases) and ${S.backlog.length} order(s) are waiting.`;
  }
  if (!role || (S.flags.mp[role] || -99) > d - 30) return;
  if ((S.openings || []).some((o) => o.role === role && o.status === 'open') || S.posts.some((p) => p.role === role)) return;
  S.flags.mp[role] = d;
  const RD = I.roles[role];
  addApproval('hire', by, `Manpower request: 1 ${RD.name}`, `${why}\n\nRequest: open 1 position for ${RD.name}, market rate about ${peso(monthlyOf(marketWage(role)))}/month. If you approve, HR posts the job and does the first interview; you do the final interview.`,
    { role }, 10);
}

// ---------- bookkeeper: payment vouchers ----------
const payable = (x, d) => !x.paid && x.kind !== 'settle' && (x.kind !== '13th' || monthOf(d) === 12) && x.due - d <= 5;
const voucherAmt = (x) => (x.kind === '13th' ? thirteenthAmount().total : x.amt + penaltyFor(x));
function payVouchers(d) {
  const bk = onDuty('bookkeeper'); if (!bk) return;
  let pv = APV().find((a) => a.kind === 'pay');
  if (pv) pv.data.ids = pv.data.ids.filter((id) => { const x = S.due.find((y) => y.id === id); return x && !x.paid; });
  const inPv = new Set(pv ? pv.data.ids : []);
  const fresh = S.due.filter((x) => payable(x, d) && !inPv.has(x.id));
  if (fresh.length) {
    if (!pv) pv = addApproval('pay', bk, 'Payment voucher', '', { ids: [] }, 60);
    pv.data.ids.push(...fresh.map((x) => x.id));
  }
  if (pv && !pv.data.ids.length) { S.approvals = APV().filter((a) => a !== pv); return; }
  if (pv) {
    pv.title = `Payment voucher: ${pv.data.ids.length} item(s)`;
    for (const id of pv.data.ids) { const x = S.due.find((y) => y.id === id); if (x && x.due - d === 1 && !x.pvWarned) { x.pvWarned = true; inbox('Bookkeeper', `Due bukas: ${x.label}`, `Naka-prepare na po ang payment voucher, kailangan lang ng approval ninyo. Late payment means surcharge and interest.`); } }
  }
}
function voucherItems(a) { return a.data.ids.map((id) => S.due.find((y) => y.id === id)).filter((x) => x && !x.paid); }
function payItems(xs) {
  const ok = [], fail = [];
  for (const x of xs.sort((p, q) => p.due - q.due)) {
    const amt = voucherAmt(x);
    if (cash() >= amt && payDue(x.id)) { ok.push(`${x.label}: ${peso(Math.round(amt))}`); S.flags.paidGov = true; } else fail.push(x.label);
  }
  return (ok.length ? 'Paid:\n' + ok.join('\n') : 'Nothing was paid.') + (fail.length ? `\n\nNot paid (kulang ang cash): ${fail.join(', ')}` : '');
}

// ---------- bookkeeper / supervisor / salesman: price review ----------
function priceReview(d) {
  const I = IND(), by = onDuty('bookkeeper') || onDuty('supervisor') || onDuty('salesman'); if (!by) return;
  if (APV().some((a) => a.kind === 'price')) return;
  const items = [];
  for (const k in I.lines) {
    const ln = I.lines[k]; if (ln.needs && !hasAsset(ln.needs) || S.price[k] == null || !ln.cost) continue;
    const vatF = vatable(k) ? 1.12 : 1, base = 1 - ln.cost / ln.price, net = S.price[k] / vatF, cur = 1 - lineCost(k) / net;
    if (cur < base * 0.75) {
      let np = lineCost(k) / (1 - base) * vatF; np = Math.min(np, refPrice(k) * vatF * 1.12);
      np = np < 40 ? Math.round(np * 4) / 4 : Math.round(np);
      if (np > S.price[k] * 1.02) items.push({ k, name: ln.name, from: S.price[k], to: np, cur, base });
    }
  }
  if (!items.length) return;
  addApproval('price', by, `Price adjustment: ${items.length} item(s)`, `Costs went up, so margins dropped below normal:\n\n${items.map((x) => `• ${x.name}: margin ${Math.round(x.cur * 100)}% (normal ${Math.round(x.base * 100)}%). ${peso(x.from, x.from < 40)} → ${peso(x.to, x.to < 40)}`).join('\n')}\n\nRecommendation: adjust to bring margins back. Market price now: ${items.map((x) => `${x.name.split(' (')[0]} ${peso(refPrice(x.k), true)}`).join(', ')}. Pricing far above the market loses customers.`,
    { items }, 10);
}

// ---------- supervisor / bookkeeper: supply contract recommendation ----------
function recommendContract(o) {
  const by = onDuty('supervisor') || onDuty('bookkeeper'); if (!by) return;
  const ln = IND().lines[o.line], m = (o.price / (vatable(o.line) ? 1.12 : 1) - lineCost(o.line));
  const mPct = m / o.price, L = S.last, lostRate = L && L.cust ? L.lost / L.cust : 0;
  const gpMonth = Math.round(m * o.qty * 26);
  const yes = mPct >= 0.15 && lostRate < 0.1;
  const why = mPct < 0.15 ? `margin is only ${Math.round(mPct * 100)}% per piece, too thin after delivery and the ${o.terms}-day wait for payment` : lostRate >= 0.1 ? `we already lose ${Math.round(lostRate * 100)}% of walk-in customers because we are at capacity; this order would make it worse` : `${Math.round(mPct * 100)}% margin and we have room in production`;
  o.rec = yes ? 'accept' : 'decline';
  addApproval('contract', by, `Contract: ${o.name}`, `${o.qty} ${ln.name} every working day at ${peso(o.price)} each (${o.terms}-day terms, ${o.months} months).\nGross profit: about ${peso(gpMonth)}/month. Collected ${o.terms} days after delivery.\n\n${roleDef(by.role).name} recommends: ${yes ? 'ACCEPT' : 'DECLINE'}. Reason: ${why}.`,
    { offer: o.id, rec: o.rec }, Math.max(1, o.exp - S.day));
}

// ---------- the kinds: what each approval does ----------
const APPROVAL_KINDS = {
  raise: { em: '\u{1F4B0}', choices: (a) => { const e = empOf_(a.data.emp), half = e ? roundRate(e.rate + (a.data.rate - e.rate) / 2) : 0; return !e || e.status === 'gone' ? [{ label: 'Close (employee left)', run: () => 'Closed' }] : [
    { label: `Approve: ${peso(monthlyOf(a.data.rate))}/month`, sub: 'Morale +8', cls: 'primary', run: () => { e.rate = Math.max(e.rate, a.data.rate); e.morale = clamp(e.morale + 8, 0, 100); e.attMod = (e.attMod || 0) + 2; return `${e.name}'s new rate starts next payroll.`; } },
    { label: `Approve half: ${peso(monthlyOf(half))}/month`, sub: 'Morale +2', run: () => { e.rate = Math.max(e.rate, half); e.morale = clamp(e.morale + 2, 0, 100); return `${e.name} gets a smaller increase.`; } },
    { label: 'Not now', sub: 'Morale -8. Pay stays the same.', cls: 'warn', run: () => { e.morale = clamp(e.morale - 8, 0, 100); return `HR will tell ${e.name}: no increase for now.`; } }]; },
    expire: (a) => { const e = empOf_(a.data.emp); if (e && e.status !== 'gone') { e.morale = clamp(e.morale - 10, 0, 100); inbox('HR', `No answer on ${e.name}'s increase`, `${e.name} waited 3 weeks for your decision. Morale went down. HR closed the request.`); } } },
  merit: { em: '\u{1F4C8}', choices: (a) => {
    const apply = (f) => () => { let n = 0; for (const x of a.data.items) { const e = empOf_(x.emp); if (!e || e.status === 'gone') continue; if (f(x)) { e.rate = Math.max(e.rate, x.to); e.morale = clamp(e.morale + 6, 0, 100); n++; } else e.morale = clamp(e.morale - 5, 0, 100); } return `${n} increase(s) approved, effective this payroll.`; };
    return [{ label: 'Approve all', cls: 'primary', run: apply(() => true) }, { label: 'Top performers only (5% and up)', run: apply((x) => x.pct >= 0.05) }, { label: 'Freeze increases this year', sub: 'Everyone loses morale', cls: 'warn', run: apply(() => false) }]; },
    expire: (a) => { for (const x of a.data.items) { const e = empOf_(x.emp); if (e) e.morale = clamp(e.morale - 6, 0, 100); } inbox('HR', 'Merit increases: no decision', 'The staff were told there is no increase this year. Morale dropped.'); } },
  bonus: { em: '\u{1F381}', choices: (a) => [
    { label: `Approve ${peso(a.data.pool)}`, cls: 'primary', run: () => payBonus(a.data.pool) },
    { label: `Approve half: ${peso(Math.round(a.data.pool / 1000) * 500)}`, run: () => payBonus(Math.round(a.data.pool / 1000) * 500) },
    { label: 'No bonus this quarter', sub: 'Saves cash. Small morale drop.', run: () => { for (const e of active()) e.morale = clamp(e.morale - 2, 0, 100); return 'No bonus this quarter.'; } }] },
  hire: { em: '\u{1F465}', choices: (a) => [
    { label: 'Approve: open the position', sub: 'HR posts on Facebook (₱500)', cls: 'primary', run: () => { if (cash() < 500) { toastA('Kulang ang cash'); return false; } openPosition(a.data.role, 'fb', 1); return `Job posted. Applicants come in 1 to 3 days. HR screens them first.`; } },
    { label: 'Use an agency instead', sub: 'Pre-screened, costs more', run: () => { openPosition(a.data.role, 'agency', 1); return 'The agency will send pre-screened candidates.'; } },
    { label: 'Decline: no new hires for now', run: () => 'Request declined. Overtime or better scheduling for now.' }] },
  pay: { em: '\u{1F9FE}', choices: (a) => { const xs = voucherItems(a), tot = xs.reduce((s, x) => s + voucherAmt(x), 0), gov = xs.filter((x) => x.kind !== 'ap'); return [
    { label: `Approve all: ${peso(Math.round(tot))}`, sub: `Cash after: ${peso(Math.round(cash() - tot))}`, cls: 'primary', run: () => payItems(xs) },
    ...(gov.length && gov.length < xs.length ? [{ label: `Gov't & payroll only: ${peso(Math.round(gov.reduce((s, x) => s + voucherAmt(x), 0)))}`, sub: 'Hold supplier bills (they may cut your credit after 7 days late)', run: () => { const m = payItems(gov); return m + '\n\nSupplier bills will be in the next voucher.'; } }] : []),
    { label: 'Hold', sub: 'Decide later. Late payments get penalties.', run: () => false }]; } },
  price: { em: '\u{1F3F7}️', choices: (a) => [
    { label: 'Approve new prices', cls: 'primary', run: () => { for (const x of a.data.items) S.price[x.k] = x.to; return 'Price tags updated.'; } },
    { label: 'Keep current prices', sub: 'Lower margin, but customers stay happy', run: () => 'Prices unchanged.' }] },
  contract: { em: '\u{1F4DD}', choices: (a) => { const o = (S.offers || []).find((x) => x.id === a.data.offer); if (!o) return [{ label: 'Close (offer expired)', run: () => 'Closed' }]; return [
    { label: 'Sign the contract', cls: a.data.rec === 'accept' ? 'primary' : '', run: () => { o.until = S.day + o.months * 30; S.contracts = S.contracts || []; S.contracts.push(o); S.offers = S.offers.filter((x) => x !== o); return 'Contract signed. Deliveries start tomorrow.'; } },
    { label: 'Decline', cls: a.data.rec === 'decline' ? 'primary' : '', run: () => { S.offers = S.offers.filter((x) => x !== o); return 'Declined politely.'; } }]; } }
};
const empOf_ = (id) => S.emps.find((e) => e.id === id);

// ---------- daily / monthly hooks ----------
function approvalsDaily(d, R) {
  for (const a of APV().slice()) if (a.exp < d) { const K = APPROVAL_KINDS[a.kind]; if (K.expire) K.expire(a); S.approvals = APV().filter((x) => x !== a); approvalLog(a, 'expired, no decision'); }
  // stale items: contract already signed/declined in Ops, employee already left
  S.approvals = APV().filter((a) => !(a.kind === 'contract' && !(S.offers || []).some((o) => o.id === a.data.offer)) && !(a.kind === 'raise' && !(empOf_(a.data.emp) || {}).status) && !(a.kind === 'raise' && empOf_(a.data.emp).status === 'gone'));
  if (bookkeeper()) { if (S.policy.approvePay === false) autoPay(d); else payVouchers(d); }
  if (R && R.open) manpowerCheck(d, R);
}
function approvalsMonthly(d) {
  if (monthOf(d) === 1) meritBatch(d);
  if (d - S.start > 20) priceReview(d);
}

// ---------- resignations: people leave good employers too ----------
// Retail/food turnover in the PH runs about 20-40% a year. Most of it is life, not the boss.
const RESIGN_REASONS = [
  { k: 'offer', w: (e) => (e.rate < marketWage(e.role) ? 3 : 1.2) * (e.skill > 0.95 ? 1.5 : 1), counter: 0.6, line: (e, x) => `May offer po sa ibang ${pick(['kompanya', 'branch ng kalaban', 'store sa mall'])}: ${peso(x.offer)}/day. Gusto ko po sanang mag-stay, pero malaking tulong po sa pamilya.` },
  { k: 'abroad', w: (e) => (e.age >= 23 && e.age <= 45 ? 1.4 : 0.2), counter: 0, line: () => `Natanggap na po ako bilang ${pick(['caregiver sa Japan', 'baker sa Dubai', 'factory worker sa Taiwan', 'service crew sa Saudi', 'housekeeping sa Qatar'])}. Lilipad na po ako sa susunod na buwan.` },
  { k: 'school', w: (e) => (e.age < 26 ? 1.3 : 0.1), counter: 0, line: () => 'Babalik na po ako sa pag-aaral. Nakaipon na po ako para sa tuition.' },
  { k: 'province', w: () => 1, counter: 0, line: () => pick(['Uuwi na po kami sa probinsya, doon na po kami titira.', 'Ikakasal na po ako at lilipat na po kami sa Cavite.', 'Lilipat na po kami ng bahay, malayo na po dito.']) },
  { k: 'family', w: () => 0.7, counter: 0, line: () => pick(['May sakit po ang nanay ko, ako po ang mag-aalaga.', 'Wala na pong magbabantay sa mga anak ko.']) },
  { k: 'bpo', w: (e) => (e.age < 32 ? 0.8 : 0.1), counter: 0.3, line: () => 'Natanggap po ako sa call center. Mas malaki po ang sweldo at may night differential.' },
  { k: 'burnout', w: () => (S.policy.overtime ? 1.5 : 0), counter: 0.5, line: () => 'Pagod na pagod na po ako sa araw-araw na overtime.' }
];
function resignHazard(e, d) {
  const base = e.age < 25 ? 0.32 : e.age < 35 ? 0.22 : e.age < 45 ? 0.13 : 0.08;
  let m = 1;
  if (e.rate < marketWage(e.role) * 0.97) m *= 1.6;
  if (e.morale < 50) m *= 1.6; else if (e.morale > 75) m *= 0.65;
  if (d - e.hired < 365) m *= 1.25;
  if (S.policy.perks.hmo) m *= 0.85;
  m *= (e.amb || 1);
  return base * m / 365;
}
function resignCheck(e, d) {
  if (e.status === 'resigning') { if (d >= e.leaveOn) separate(e, 'resigned'); return; }
  if (!['regular', 'probi'].includes(e.status) || e.startOn > d || d - e.hired < 20) return;
  if (S.cases.some((c) => c.emp === e.id && c.stage !== 'closed')) return;
  let reason = null;
  // unhappy people leave (as before)
  if (e.morale < 40 + (e.amb || 1) * 5 && chance((45 - e.morale) * (e.amb || 1) / 2500)) reason = { k: 'unhappy', counter: 0.5, line: () => 'Salamat po sa lahat, pero hindi na po ako masaya dito.' };
  else if (chance(resignHazard(e, d))) {
    const opts = RESIGN_REASONS.map((r) => [r, r.w(e)]).filter((x) => x[1] > 0), tot = opts.reduce((s, x) => s + x[1], 0);
    let t = Math.random() * tot; for (const [r, w] of opts) { t -= w; if (t <= 0) { reason = r; break; } }
    reason = reason || opts[0][0];
  }
  if (!reason) return;
  const x = { k: reason.k, counter: reason.counter };
  if (reason.k === 'offer') x.offer = Math.round(Math.max(e.rate * rnd(1.1, 1.25), marketWage(e.role) * 1.05));
  if (reason.k === 'bpo') x.offer = Math.round(Math.max(e.rate * 1.35, 900));
  x.quote = reason.line(e, x);
  e.status = 'resigning'; e.leaveOn = d + 30; e.resign = x; e.morale = clamp(e.morale - 5, 0, 100);
  queue({ type: 'resign', emp: e.id });
}
// what HR says in the exit interview
function exitAdvice(e) {
  const x = e.resign || { k: 'unhappy', counter: 0.5 }, key = e.skill >= 0.95 || active().filter((y) => y.role === e.role).length <= 1;
  if (!x.counter) return { text: `This is a personal decision, a counter-offer won't change it. HR recommends accepting, getting a proper turnover, and ${key ? 'opening a replacement now, since they are hard to replace' : 'deciding if we need a replacement'}.`, replace: true };
  if (key) return { text: `${e.name} is a strong performer${active().filter((y) => y.role === e.role).length <= 1 ? ' and our only ' + roleDef(e.role).name.toLowerCase() : ''}. Hiring and training a replacement costs about a month of their salary. HR recommends a counter-offer.`, counter: true };
  return { text: 'Average performer and we have others in the same role. HR recommends accepting the resignation and opening a replacement if the workload needs it.', replace: true };
}
function counterRate(e) { const x = e.resign || {}; return Math.round(Math.max(e.rate * 1.1, x.offer || 0)); }
function tryCounter(e) {
  const x = e.resign || { counter: 0.5 }, nr = counterRate(e);
  if (!chance(x.counter)) return false;
  e.rate = Math.max(e.rate, nr);
  e.status = e.regular || S.day - e.hired >= LAW.probationDays ? 'regular' : 'probi';
  e.morale = clamp(Math.max(e.morale, 65) + 5, 0, 100); delete e.resign; delete e.leaveOn;
  return true;
}
function requestReplacement(e) {
  const by = onDuty('hr') || onDuty('supervisor'); if (!by || by === e) return;
  if (APV().some((a) => a.kind === 'hire' && a.data.role === e.role)) return;
  addApproval('hire', by, `Replacement: 1 ${roleDef(e.role).name}`, `${e.name} leaves on ${fshort(e.leaveOn || S.day)}. HR recommends hiring a replacement now so there is time to train them before the last day.\n\nMarket rate about ${peso(monthlyOf(marketWage(e.role)))}/month.`, { role: e.role }, 14);
}
