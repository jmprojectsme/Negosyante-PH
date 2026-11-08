// Negosyante PH: industry-specific mechanics.
// Energy & Lighting: imported stock priced in dollars (FX), and rooftop solar projects billed in stages.

// ---------- dollar rate (imported goods) ----------
function fxMonthly(d) {
  const I = IND(); if (!I.fx) return;
  const old = S.fx || 58.6;
  let nw = old * (1 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.025);
  nw = r2(clamp(nw, 52, 66));
  const f = nw / old;
  for (const k in I.lines) if (I.lines[k].imported && S.market[k] != null) S.market[k] = clamp(S.market[k] * f, 0.6, 3);
  S.fx = nw; S.fxLog = (S.fxLog || []).concat({ d, fx: nw }).slice(-24);
  if (Math.abs(f - 1) >= 0.012) inbox('Market', `${f > 1 ? '\u{1F4C9} Humina ang piso' : '\u{1F4C8} Lumakas ang piso'}: ₱${nw.toFixed(2)} per US$`,
    `Was ₱${old.toFixed(2)}. Your imported stock now costs about ${Math.abs(Math.round((f - 1) * 100))}% ${f > 1 ? 'more' : 'less'} to replace. Stock already in the warehouse keeps its old cost, so ${f > 1 ? 'buying before a weak-peso month saves money' : 'this is a good time to restock'}. Check your prices in Ops → Prices.`);
}

// ---------- rooftop solar projects (stage billing) ----------
const PROJECT_WHO = ['Resort sa Batangas', 'Factory sa Laguna (rooftop)', 'Mall parking shed', 'Private school sa Cavite', 'Cold storage warehouse', 'Subdivision: 10 houses (package deal)', 'Hospital sa Bulacan', 'Church and parish hall', 'Rice mill sa Nueva Ecija', 'Office building sa Pasig'];
function projectOffer() {
  const big = (S.stage || 1) >= 4 ? 1.8 : (S.stage || 1) >= 3 ? 1.3 : 1;
  const kw = Math.round(pick([5, 8, 10, 12, 15, 20, 30, 45]) * big);
  const need = { solar: Math.ceil(kw * 1000 / 550), inverter: Math.ceil(kw / 6) };
  if (chance(0.5)) need.battery = Math.ceil(kw / 6);
  const mat = Object.keys(need).reduce((s, k) => s + need[k] * S.price[k], 0);
  const install = kw * 9000, subcon = kw * 6000;
  const price = Math.round((mat + install) * rnd(0.94, 1.04) / 1000) * 1000;
  return { id: uid(), name: pick(PROJECT_WHO), kw, need, price, subcon, days: Math.round(10 + kw / 4), dp: 0.3, prog: 0.6, ret: 0.1, exp: S.day + 10 };
}
function projectCostEstimate(p) {
  const I = IND(); let c = p.subcon;
  for (const k in p.need) c += p.need[k] * (S.inv[k] && stockQty(k) > 0 ? S.inv[k].c : lineCost(k));
  return Math.round(c);
}
function acceptProject(p) {
  const dp = Math.round(p.price * p.dp);
  S.projects = S.projects || [];
  p.start = S.day; p.done = S.day + p.days; p.status = 'ongoing'; p.rel = 0.9; p.dpAmt = dp;
  S.projects.push(p);
  post(`Downpayment 30%: ${p.name} (${p.kw} kWp solar)`, [[1000, dp], [2190, -dp]]);
  return dp;
}
function completeProject(p, d) {
  const I = IND(); let cogs = 0;
  for (const k in p.need) {
    const short = p.need[k] - Math.floor(stockQty(k));
    if (short > 0) { buyStock(k, short, true); p.rush = true; }
    cogs += takeStock(k, p.need[k]);
  }
  post(`Materials installed: ${p.name}`, [[5000, r2(cogs)], [1200, -r2(cogs)]]);
  post(`Installation subcontractor: ${p.name}`, [[5000, p.subcon], [1000, -p.subcon]]);
  const gross = p.price, vat = S.vat ? r2(gross / 1.12 * 0.12) : 0, rest = r2(gross - p.dpAmt);
  const lines = [[2190, p.dpAmt], [1100, rest], [4000, -r2(gross - vat)]]; if (vat) lines.push([2150, -vat]);
  post(`Project billing: ${p.name} (${p.kw} kWp)`, lines);
  mon(ym(d)).k.sales += gross;
  const prog = Math.round(gross * p.prog), ret = r2(rest - prog);
  S.ar.push({ id: uid(), c: p.id, amt: prog, due: d + 15, d, paid: 0 });
  if (ret > 0) S.ar.push({ id: uid(), c: p.id, amt: ret, due: d + 60, d, paid: 0 });
  p.status = 'done'; p.finished = d; p.cost = Math.round(cogs + p.subcon);
  S.rep = clamp(S.rep + 2, 5, 100);
  inbox('Sales', `☀️ Project done: ${p.name}`, `${p.kw} kWp system installed and turned on.${p.rush ? ' Some materials were missing from stock and had to be bought at once.' : ''}\n\nBilling: 30% downpayment received at signing. Progress billing ${peso(prog)} (60%) due in 15 days. Retention ${peso(ret)} (10%) due after the 60-day warranty check.\nProject cost ${peso(p.cost)} vs contract ${peso(gross)}.`);
}
function projectsDaily(d) {
  for (const p of S.projects || []) if (p.status === 'ongoing' && d >= p.done) completeProject(p, d);
  S.projects = (S.projects || []).filter((p) => p.status === 'ongoing' || S.ar.some((a) => a.c === p.id) || d - p.finished < 90);
}
function projectsMonthly(d) {
  if (!IND().projects || (S.stage || 1) < 2) return;
  if ((S.projects || []).filter((p) => p.status === 'ongoing').length >= 3) return;
  if (chance(0.45)) queue({ type: 'project', p: projectOffer() });
}
function industryDaily(d) { if (IND().projects) projectsDaily(d); }
function industryMonthly(d) { fxMonthly(d); projectsMonthly(d); }
