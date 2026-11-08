/* Negosyante PH: game data. Laws and rates as of late 2026 (sources listed in LAW.notes). */
'use strict';

const LAW = {
  // NCR Wage Order NCR-27: P755 / P718 from Jul 25 2026, P780 / P743 from Jan 20 2027
  wage: [
    { from: '2026-07-25', nonagri: 755, small: 718 },
    { from: '2027-01-20', nonagri: 780, small: 743 }
  ],
  smallRetailMax: 15,          // retail/service with 15 workers or fewer get the lower rate
  sss: { ee: 0.05, er: 0.10, mscMin: 5000, mscMax: 35000, ecLow: 10, ecHigh: 30, ecCut: 15000 },
  philhealth: { rate: 0.05, floor: 10000, ceil: 100000 },          // split 50/50
  pagibig: { rate: 0.02, cap: 10000 },                             // max P200 each side
  holidayExemptBelow: 10,      // retail/service with fewer than 10 workers: no holiday pay, no SIL (Art. 94, 95)
  silDays: 5,
  probationDays: 182,          // 6 months
  nteDays: 5,                  // reply period for Notice to Explain (DO 147-15)
  agabon: 30000,               // nominal damages: valid cause but no due process
  vatThreshold: 3000000, vatRate: 0.12, pctTax: 0.03,
  cit: { low: 0.20, high: 0.25, lowIncome: 5000000, lowAssets: 100000000, mcit: 0.02, mcitFromYear: 4 },
  // EOPT Act: micro/small taxpayers pay 10% surcharge + 6% interest; medium/large 25% + 12%
  penalties: { surchargeSmall: 0.10, interestSmall: 0.06, surchargeBig: 0.25, interestBig: 0.12, sssPerMonth: 0.02, phPerMonth: 0.03 },
  lbtRate: 0.01,               // local business tax, simplified to 1% of last year's gross
  permitDue: [1, 20],          // business permit renewal: Jan 20
  // TRAIN withholding table (2023 onwards), annual taxable compensation
  wht: [[250000, 0, 0], [400000, 0, 0.15], [800000, 22500, 0.20], [2000000, 102500, 0.25], [8000000, 402500, 0.30], [Infinity, 2202500, 0.35]],
  notes: [
    'Minimum wage: Wage Order NCR-27 (P755/P718 from Jul 25 2026; P780/P743 from Jan 20 2027).',
    'SSS 15% of MSC (10% employer, 5% employee), MSC P5,000 to P35,000, plus employer EC P10/P30.',
    'PhilHealth 5% of basic pay, floor P10,000, ceiling P100,000, split 50/50.',
    'Pag-IBIG 2% each, fund salary capped at P10,000 (max P200 each).',
    '13th month pay: 1/12 of basic pay earned in the year, paid on or before Dec 24.',
    'Holiday pay and 5-day service incentive leave: not required for retail/service establishments with fewer than 10 workers.',
    'Just-cause dismissal (AWOL, theft): two written notices and a chance to be heard (DO 147-15, 5 calendar days to reply).',
    'VAT 12% once gross sales pass P3M; below that 3% percentage tax.',
    'Corporate income tax 20% (net taxable income up to P5M and assets up to P100M), otherwise 25%.',
    'EOPT Act: micro and small taxpayers pay 10% surcharge and 6% interest on late taxes.'
  ]
};

// Proclamation 1427 (2027). Other years follow the same pattern; Eid dates are estimates.
const EID = { 2027: ['03-10', '05-17'], 2028: ['02-27', '05-05'], 2029: ['02-14', '04-24'], 2030: ['02-04', '04-13'], 2031: ['01-24', '04-02'] };
const CNY = { 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23' };
function easter(y) {   // anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
function holidaysOf(y) {
  const H = {};
  const put = (md, name, type) => { H[`${y}-${md}`] = { name, type }; };
  const fmt = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const e = easter(y), plus = (n) => new Date(e.getTime() + n * 864e5);
  put('01-01', "New Year's Day", 'R');
  put(fmt(plus(-3)), 'Maundy Thursday', 'R'); put(fmt(plus(-2)), 'Good Friday', 'R'); put(fmt(plus(-1)), 'Black Saturday', 'S');
  put('04-09', 'Araw ng Kagitingan', 'R'); put('05-01', 'Labor Day', 'R'); put('06-12', 'Independence Day', 'R');
  const aug31 = new Date(Date.UTC(y, 7, 31)); const lastMon = new Date(aug31.getTime() - ((aug31.getUTCDay() + 6) % 7) * 864e5);
  put(fmt(lastMon), 'National Heroes Day', 'R');
  put('11-30', 'Bonifacio Day', 'R'); put('12-25', 'Christmas Day', 'R'); put('12-30', 'Rizal Day', 'R');
  if (EID[y]) { put(EID[y][0], "Eid'l Fitr", 'R'); put(EID[y][1], "Eid'l Adha", 'R'); }
  if (CNY[y]) put(CNY[y], 'Chinese New Year', 'S');
  put('08-21', 'Ninoy Aquino Day', 'S'); put('11-01', "All Saints' Day", 'S'); put('11-02', "All Souls' Day", 'S');
  put('12-08', 'Immaculate Conception', 'S'); put('12-24', 'Christmas Eve', 'S'); put('12-31', 'Last Day of the Year', 'S');
  return H;
}

const ACCOUNTS = {
  1000: ['Cash', 'A'], 1100: ['Accounts Receivable', 'A'], 1110: ['Other Receivables', 'A'], 1200: ['Inventory', 'A'],
  1300: ['Input VAT', 'A'], 1310: ['Prepaid Income Tax', 'A'], 1400: ['Security Deposits', 'A'],
  1500: ['Property & Equipment', 'A'], 1510: ['Accumulated Depreciation', 'XA'],
  2000: ['Accounts Payable', 'L'], 2100: ['SSS Payable', 'L'], 2110: ['PhilHealth Payable', 'L'], 2120: ['Pag-IBIG Payable', 'L'],
  2130: ['Withholding Tax Payable', 'L'], 2140: ['Percentage Tax Payable', 'L'], 2150: ['Output VAT', 'L'], 2160: ['Income Tax Payable', 'L'],
  2170: ['13th Month Payable', 'L'], 2180: ['Other Payables', 'L'], 2200: ['Loans Payable', 'L'],
  3000: ['Share Capital', 'E'], 3100: ['Retained Earnings', 'E'], 3200: ['Dividends Declared', 'XE'],
  4000: ['Sales', 'R'], 4100: ['Other Income', 'R'],
  5000: ['Cost of Sales', 'X'],
  6000: ['Salaries & Wages', 'X'], 6010: ['SSS/PhilHealth/Pag-IBIG (Employer)', 'X'], 6020: ['13th Month & Benefits', 'X'],
  6100: ['Rent', 'X'], 6110: ['Utilities', 'X'], 6120: ['Fuel & Delivery', 'X'], 6130: ['Marketing', 'X'], 6140: ['Repairs & Maintenance', 'X'],
  6150: ['Depreciation', 'X'], 6160: ['Taxes & Licenses', 'X'], 6170: ['Professional Fees', 'X'], 6180: ['Interest Expense', 'X'],
  6190: ['Bad Debts', 'X'], 6200: ['Inventory Losses & Spoilage', 'X'], 6210: ['Recruitment & Training', 'X'],
  6220: ['Penalties & Settlements', 'X'], 6230: ['Organization Costs', 'X'], 6240: ['Miscellaneous', 'X'],
  7000: ['Income Tax Expense', 'X']
};
const OPEX = [6000, 6010, 6020, 6100, 6110, 6120, 6130, 6140, 6150, 6160, 6170, 6190, 6200, 6210, 6220, 6230, 6240];

// common back-office roles, available in every industry
const COMMON_ROLES = {
  supervisor: { name: 'Supervisor', em: '\u{1F9D1}‍\u{1F4BC}', wage: 1050, need: 6, desc: '+10% productivity, fewer thefts, handles daily ops' },
  bookkeeper: { name: 'Bookkeeper', em: '\u{1F9EE}', wage: 980, need: 0, desc: 'Files and pays taxes and contributions on time automatically' },
  hr: { name: 'HR Officer', em: '\u{1F4C1}', wage: 1000, need: 10, desc: 'Sends notices on time, flags due process, +morale' }
};

const INDUSTRIES = {
  trading: {
    name: 'Distribution / Trading', em: '\u{1F69A}', tag: 'Hard · big volume, thin margins',
    desc: 'Buy by the case from big suppliers, deliver to sari-sari stores, carinderias and minimarts. Credit terms, collections and trucks are the game.',
    mode: 'stock', channel: 'b2b', wageClass: 'nonagri', capital: 600000, invest: [400000, 900000],
    lines: {
      bigas: { name: 'Bigas 25kg', cost: 1150, price: 1290, w: 1.3, vatFree: true, u: 'sack' },
      sardinas: { name: 'Sardinas (case 100)', cost: 1650, price: 1860, w: 1, u: 'case' },
      noodles: { name: 'Instant noodles (case 72)', cost: 620, price: 710, w: 1.2, u: 'case' },
      mantika: { name: 'Mantika (12×1L)', cost: 1250, price: 1410, w: 0.8, u: 'case' },
      softdrinks: { name: 'Softdrinks (case 24)', cost: 480, price: 548, w: 1.1, u: 'case' },
      kape: { name: 'Kape 3-in-1 (case)', cost: 1380, price: 1560, w: 0.7, u: 'case' },
      asukal: { name: 'Asukal 50kg', cost: 3250, price: 3640, w: 0.4, u: 'sack' },
      sabon: { name: 'Sabon/detergent (case)', cost: 920, price: 1045, w: 0.7, u: 'case' }
    },
    roles: {
      driver: { name: 'Driver', em: '\u{1F468}‍✈️', wage: 820, desc: 'Drives one vehicle' },
      helper: { name: 'Pahinante (helper)', em: '\u{1F4AA}', wage: 0, desc: '+25% load per trip on a vehicle (max 2 per vehicle)' },
      salesman: { name: 'Salesman / Ahente', em: '\u{1F454}', wage: 800, desc: 'Services 25 clients, finds new ones, helps collect' },
      clerk: { name: 'Warehouse clerk', em: '\u{1F4E6}', wage: 0, desc: 'Picks and loads 250 cases/day, keeps counts accurate' }
    },
    owner: { salesman: 10, driver: 1, clerk: 90 },
    locations: [
      { name: 'Maliit na bodega', rent: 12000, storage: 600, slots: 2, deposit: 2 },
      { name: 'Warehouse', rent: 55000, storage: 2500, slots: 5, deposit: 2, need: { clients: 25 } },
      { name: 'Distribution center', rent: 150000, storage: 8000, slots: 12, deposit: 3, need: { clients: 70 } }
    ],
    assets: {
      moto: { name: 'Motorsiklo w/ sidecar', cost: 110000, life: 60, cap: 30, fuel: 6, vehicle: true },
      multicab: { name: 'Multicab', cost: 280000, life: 60, cap: 60, fuel: 9, vehicle: true },
      l300: { name: 'L300 FB van (2nd hand)', cost: 480000, life: 48, cap: 150, fuel: 12, vehicle: true },
      truck: { name: '6-wheeler truck', cost: 2400000, life: 120, cap: 400, fuel: 10, vehicle: true, tier: 1 },
      forklift: { name: 'Pallet jack & racks', cost: 65000, life: 60, clerkBoost: 0.4, max: 1 },
      cctv: { name: 'CCTV system', cost: 25000, life: 60, theft: 0.4, max: 1 },
      genset: { name: 'Generator', cost: 60000, life: 60, power: true, max: 1 },
      erp: { name: 'Inventory & billing system', cost: 45000, life: 36, theft: 0.5, collect: 0.08, max: 1 }
    },
    startAssets: ['moto']
  },
  food: {
    name: 'Food: Carinderia → Restaurant', em: '\u{1F372}', tag: 'Medium · daily cash, spoilage',
    desc: 'Cook every morning, sell to walk-in customers. Food spoils, lunch rush is real, and cooks are hard to keep.',
    mode: 'prep', channel: 'walkin', wageClass: 'small', capital: 250000, invest: [250000, 600000],
    base: 160, elastic: 1.7,
    lines: {
      ulam: { name: 'Ulam + kanin', cost: 47, price: 95, p: 0.62, work: { cook: 1 } },
      silog: { name: 'Silog meal', cost: 42, price: 90, p: 0.22, work: { cook: 1 } },
      merienda: { name: 'Merienda (pancit/turon)', cost: 20, price: 45, p: 0.2, work: { cook: 0.5 } },
      drinks: { name: 'Drinks', cost: 18, price: 30, p: 0.4, work: {}, keeps: 30 }
    },
    roles: {
      cook: { name: 'Cook', em: '\u{1F468}‍\u{1F373}', wage: 830, cap: 160, unit: 'dishes', desc: 'Cooks about 160 servings a day' },
      server: { name: 'Server', em: '\u{1F9D1}‍\u{1F37D}️', wage: 0, cap: 140, unit: 'customers', desc: 'Serves about 140 customers a day' },
      cashier: { name: 'Cashier', em: '\u{1F4B0}', wage: 0, cap: 320, unit: 'customers', desc: 'Handles payments; without one, servers lose 20%' }
    },
    owner: { cook: 120, server: 110, cashier: 260 },
    locations: [
      { name: 'Carinderia sa kanto', rent: 12000, traffic: 1, seats: 16, deposit: 2 },
      { name: 'Puwesto sa terminal', rent: 32000, traffic: 2.1, seats: 40, deposit: 2 },
      { name: 'Restaurant sa main road (aircon)', rent: 85000, traffic: 4.2, seats: 90, deposit: 3, priceTol: 1.25 }
    ],
    turns: 7,
    assets: {
      stove: { name: 'Commercial stove set', cost: 60000, life: 60, boost: { cook: 0.15 }, max: 1 },
      freezer: { name: 'Chest freezer', cost: 35000, life: 60, keep: 0.5, max: 2 },
      genset: { name: 'Generator', cost: 45000, life: 60, power: true, max: 1 },
      pos: { name: 'POS system', cost: 30000, life: 36, theft: 0.5, boost: { cashier: 0.3 }, max: 1 },
      cctv: { name: 'CCTV', cost: 18000, life: 60, theft: 0.4, max: 1 }
    },
    startAssets: []
  },
  bakery: {
    name: 'Bakery', em: '\u{1F956}', tag: 'Medium · production planning',
    desc: 'Bake before dawn, sell pandesal to the whole barangay. Plan production right or throw bread away.',
    mode: 'prep', channel: 'walkin', wageClass: 'small', capital: 300000, invest: [250000, 600000],
    base: 250, elastic: 1.4,
    lines: {
      pandesal: { name: 'Pandesal (10 pcs)', cost: 23, price: 45, p: 0.62, work: { baker: 1 } },
      spanish: { name: 'Spanish bread/monay', cost: 6.5, price: 12, p: 0.45, q: 2, work: { baker: 0.25 } },
      ensaymada: { name: 'Ensaymada', cost: 15, price: 28, p: 0.18, work: { baker: 0.4 } },
      loaf: { name: 'Loaf bread', cost: 44, price: 78, p: 0.14, work: { baker: 0.8 }, keeps: 2 },
      cake: { name: 'Cake roll/slice', cost: 60, price: 115, p: 0.05, work: { baker: 1 }, keeps: 2 }
    },
    roles: {
      baker: { name: 'Baker', em: '\u{1F9D1}‍\u{1F373}', wage: 840, cap: 260, unit: 'units', desc: 'Bakes about 260 units a shift' },
      clerk: { name: 'Sales clerk', em: '\u{1F9FE}', wage: 0, cap: 320, unit: 'customers', desc: 'Serves about 320 customers a day' }
    },
    owner: { baker: 200, clerk: 240 },
    ovenCap: 420,
    locations: [
      { name: 'Bakeshop sa barangay', rent: 10000, traffic: 1, ovens: 2, deposit: 2 },
      { name: 'Bakery sa main road', rent: 26000, traffic: 2, ovens: 4, deposit: 2 },
      { name: 'Bakery-café (commercial)', rent: 62000, traffic: 3.6, ovens: 7, deposit: 3, priceTol: 1.2 }
    ],
    assets: {
      oven: { name: 'Deck oven', cost: 85000, life: 84, oven: true },
      mixer: { name: 'Dough mixer', cost: 55000, life: 60, boost: { baker: 0.3 }, max: 2 },
      chiller: { name: 'Display chiller', cost: 40000, life: 60, keep: 0.5, max: 1 },
      genset: { name: 'Generator', cost: 45000, life: 60, power: true, max: 1 },
      pos: { name: 'POS system', cost: 30000, life: 36, theft: 0.5, boost: { clerk: 0.3 }, max: 1 },
      cctv: { name: 'CCTV', cost: 18000, life: 60, theft: 0.4, max: 1 }
    },
    startAssets: ['oven']
  },
  minimart: {
    name: 'Retail: Minimart', em: '\u{1F3EA}', tag: 'Easy · inventory and shrinkage',
    desc: 'Stock the shelves, beat the 7-Eleven down the street on price, and watch for shoplifters and "kulang sa kaha".',
    mode: 'stock', channel: 'walkin', wageClass: 'small', capital: 350000, invest: [250000, 700000],
    base: 200, elastic: 2.1,
    lines: {
      staples: { name: 'Staples (bigas, de lata)', cost: 48, price: 58, p: 0.42, q: 2 },
      snacks: { name: 'Snacks & drinks', cost: 25, price: 34, p: 0.62, q: 2 },
      care: { name: 'Personal care', cost: 56, price: 74, p: 0.25 },
      frozen: { name: 'Frozen & chilled', cost: 72, price: 98, p: 0.14, keeps: 10, needs: 'freezer' },
      load: { name: 'Load & yosi', cost: 46, price: 51, p: 0.22 }
    },
    roles: {
      cashier: { name: 'Cashier', em: '\u{1F4B0}', wage: 0, cap: 300, unit: 'customers', desc: 'Checks out about 300 customers a day' },
      stocker: { name: 'Stock clerk', em: '\u{1F4E6}', wage: 0, cap: 1500, unit: 'items', desc: 'Keeps 1,500 items/day on the shelf' }
    },
    owner: { cashier: 220, stocker: 900 },
    locations: [
      { name: 'Mini store', rent: 15000, traffic: 1, storage: 4000, deposit: 2 },
      { name: 'Minimart sa kanto', rent: 36000, traffic: 2.2, storage: 12000, deposit: 2 },
      { name: 'Mini-grocery sa highway', rent: 82000, traffic: 4.5, storage: 30000, deposit: 3 }
    ],
    assets: {
      freezer: { name: 'Freezer chiller', cost: 45000, life: 60, unlock: 'freezer', max: 2 },
      pos: { name: 'POS & barcode', cost: 40000, life: 36, theft: 0.5, boost: { cashier: 0.35 }, max: 1 },
      cctv: { name: 'CCTV', cost: 22000, life: 60, theft: 0.4, shoplift: 0.5, max: 1 },
      genset: { name: 'Generator', cost: 55000, life: 60, power: true, max: 1 },
      guard: { name: 'Security guard (agency, monthly)', cost: 0, monthly: 24000, shoplift: 0.7, max: 1, service: true }
    },
    startAssets: []
  },
  laundry: {
    name: 'Services: Laundry shop', em: '\u{1F9FA}', tag: 'Easy · machines and service',
    desc: 'No inventory to spoil, but machines break, brownouts stop everything, and customers want it by tomorrow.',
    mode: 'service', channel: 'walkin', wageClass: 'small', capital: 300000, invest: [250000, 600000],
    base: 42, elastic: 1.5,
    lines: {
      wdf: { name: 'Wash-dry-fold (per load)', cost: 58, price: 190, p: 0.78, work: { attendant: 1, washer: 1, dryer: 1 } },
      self: { name: 'Self-service wash', cost: 42, price: 130, p: 0.24, work: { attendant: 0.2, washer: 1, dryer: 1 } },
      press: { name: 'Pressing / dry-clean', cost: 70, price: 240, p: 0.1, work: { attendant: 1 }, needs: 'press' },
      deliver: { name: 'Pickup & delivery', cost: 22, price: 60, p: 0.35, work: { rider: 1 }, needs: 'moto' }
    },
    roles: {
      attendant: { name: 'Laundry attendant', em: '\u{1F9FA}', wage: 0, cap: 22, unit: 'loads', desc: 'Washes, folds and bags about 22 loads a day' },
      rider: { name: 'Rider', em: '\u{1F6F5}', wage: 0, cap: 24, unit: 'trips', desc: 'Pickup and delivery, needs a motorcycle' }
    },
    owner: { attendant: 16, rider: 10 },
    machineCap: 12,
    locations: [
      { name: 'Laundry sa looban', rent: 12000, traffic: 1, slots: 8, deposit: 2 },
      { name: 'Laundromat sa main road', rent: 30000, traffic: 2, slots: 14, deposit: 2 },
      { name: 'Laundry hub (malapit sa dorms)', rent: 70000, traffic: 3.6, slots: 28, deposit: 3 }
    ],
    assets: {
      washer: { name: 'Commercial washer', cost: 55000, life: 84, machine: 'washer' },
      dryer: { name: 'Commercial dryer', cost: 55000, life: 84, machine: 'dryer' },
      press: { name: 'Pressing station', cost: 25000, life: 60, unlock: 'press', max: 1 },
      moto: { name: 'Delivery motorcycle', cost: 85000, life: 60, unlock: 'moto', max: 3 },
      genset: { name: 'Generator', cost: 65000, life: 60, power: true, max: 1 },
      pos: { name: 'POS & tagging', cost: 25000, life: 36, theft: 0.5, max: 1 }
    },
    startAssets: ['washer', 'washer', 'dryer', 'dryer']
  }
};

const FUNDING = [
  { id: 'self', name: 'Sariling puhunan lang', desc: 'Your own savings only. 100% yours, no board to answer to, but less cash to start with.', share: 0, none: true, strict: 1, seats: 0 },
  { id: 'loan', name: 'Bank startup loan', desc: 'You keep 100% ownership. The bank lends at 12% a year for 3 years. Monthly amortization no matter what.', share: 0, none: true, loan: 0.12, strict: 1, seats: 0 },
  { id: 'angel', name: 'Tito Ramon (angel investor)', desc: 'Retired seaman. Patient, asks simple questions. Wants steady profit.', share: 0.3, mult: 0, strict: 0.8, seats: 1 },
  { id: 'group', name: 'Kapatid Ventures (3 investors)', desc: 'Bigger money, tougher board. Expects growth every quarter.', share: 0.45, mult: 1, strict: 1.2, seats: 2 }
];

const FIRST = ['Juan', 'Maria', 'Jose', 'Ana', 'Mark', 'Kristine', 'Rommel', 'Jenny', 'Paolo', 'Liza', 'Ramil', 'Joy', 'Arnel', 'Grace', 'Jomar', 'Michelle', 'Dante', 'Lorna', 'Rey', 'Aileen', 'Carlo', 'Shiela', 'Noel', 'Rowena', 'Jun', 'Marites', 'Edgar', 'Cherry', 'Bong', 'Princess', 'Ronald', 'Analyn', 'Jayson', 'Rhea', 'Allan', 'Divina', 'Ernesto', 'Nikki', 'Raffy', 'Leah'];
const LAST = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Dela Cruz', 'Gonzales', 'Navarro', 'Pascual', 'Soriano', 'Valdez', 'Manalo', 'Salazar', 'Tolentino', 'Domingo', 'Lopez', 'Rivera'];
const STORE_NAMES = ["Aling Nena's Store", "Mang Jose Sari-Sari", 'JM Minimart', 'Kainan ni Ate Glo', '3 Sisters Store', 'RJ Grocery', 'Tindahan ni Lola Basya', 'Bagong Pag-asa Store', 'Ka Edring Carinderia', 'Lucky 8 Mart', 'Jollyjeep ni Boyet', 'St. Jude Store', 'Mahal Kita Sari-Sari', 'Golden Grains Rice Retail', 'Kusina ni Inday', "Dodong's Mart", 'Barangay Coop Store', 'Sunrise Minimart', 'Ate Lyn Lugawan', 'Tita Baby Store', 'AMJ Trading', 'Pinoy Mart', '24/7 Express', 'Brgy. Hall Canteen', 'School Canteen ni Sir Ben'];

const JOB_CHANNELS = [
  { id: 'brgy', name: 'Word of mouth / barangay', cost: 0, days: [3, 7], n: [1, 3], q: 0 },
  { id: 'fb', name: 'Facebook job post', cost: 500, days: [1, 3], n: [3, 6], q: 0.05 },
  { id: 'jobstreet', name: 'Online job board', cost: 4000, days: [2, 4], n: [4, 7], q: 0.12 },
  { id: 'agency', name: 'Recruitment agency (pre-screened)', cost: 'month', days: [3, 5], n: [2, 3], q: 0.25, screened: true }
];

const PERKS = {
  meals: { name: 'Free lunch', per: 'day', cost: 70, morale: 6, desc: '₱70/day per worker present' },
  rice: { name: 'Rice allowance (de minimis)', per: 'month', cost: 2000, morale: 5, desc: '₱2,000/month, tax-free' },
  hmo: { name: 'HMO coverage', per: 'month', cost: 1200, morale: 6, sick: 0.6, desc: '₱1,200/month, fewer sick days' },
  leave: { name: '5 VL + 5 SL on top of SIL', per: 'year', cost: 0, morale: 5, desc: 'More paid leave, more paid absences' },
  bonus: { name: 'Quarterly performance bonus', per: 'quarter', cost: 0.25, morale: 7, desc: '25% of a month’s pay every quarter' }
};

const MARKETING = [
  { name: 'Wala', cost: 0, boost: 1 },
  { name: 'Flyers & tarpaulin', cost: 3000, boost: 1.06 },
  { name: 'Facebook ads', cost: 10000, boost: 1.13 },
  { name: 'Big campaign', cost: 30000, boost: 1.22 }
];

const LOANS = [
  { id: 'bank', name: 'Bank SME loan', rate: 0.11, months: 36, need: 'After 6 months of operation with positive equity', maxF: 0.6 },
  { id: 'bombay', name: '"5-6" lender', rate: 0.2, months: 1, daily: true, need: 'No questions asked. 20% interest in 30 days, collected daily.', maxF: 0 }
];

// ---------- applicant backgrounds ----------
const FEMALE = ['Maria', 'Ana', 'Kristine', 'Jenny', 'Liza', 'Joy', 'Grace', 'Michelle', 'Lorna', 'Aileen', 'Shiela', 'Rowena', 'Marites', 'Cherry', 'Princess', 'Analyn', 'Rhea', 'Divina', 'Nikki', 'Leah'];
const PROFILES = [
  { id: 'fresh', label: 'Fresh graduate', w: 30, age: [18, 23], exp: [0, 0], skill: [0.5, 0.78], rel: [0.82, 0.97], learn: [1.6, 2.4], amb: [1, 1.6], askF: [1, 1] },
  { id: 'nowork', label: 'No work experience', w: 12, age: [19, 35], exp: [0, 0], skill: [0.48, 0.72], rel: [0.7, 0.95], learn: [1.2, 2], amb: [0.6, 1.1], askF: [1, 1] },
  { id: 'junior', label: '1–3 years experience', w: 28, age: [21, 30], exp: [1, 3], skill: [0.72, 1.0], rel: [0.75, 0.97], learn: [1, 1.5], amb: [0.9, 1.4], askF: [1, 1.08] },
  { id: 'senior', label: 'Experienced', w: 18, age: [26, 46], exp: [4, 14], skill: [0.92, 1.25], rel: [0.78, 0.99], learn: [0.6, 1], amb: [0.6, 1.2], askF: [1.06, 1.22] },
  { id: 'shifter', label: 'Career shifter / ex-OFW', w: 7, age: [30, 45], exp: [0, 1], skill: [0.6, 0.85], rel: [0.85, 0.98], learn: [1, 1.5], amb: [0.5, 1], askF: [1, 1.1] },
  { id: 'older', label: 'Returning to work (45+)', w: 5, age: [45, 56], exp: [5, 20], skill: [0.8, 1.05], rel: [0.9, 0.995], learn: [0.4, 0.8], amb: [0.3, 0.7], askF: [1, 1.05] }
];
const EDU = {
  fresh: ['Senior High grad (TVL strand)', 'Senior High grad (ABM strand)', 'Senior High grad (HUMSS)', 'BS HRM graduate', 'BS Business Administration graduate', 'BS Office Administration graduate', 'TESDA scholar'],
  other: ['High school graduate', 'High school level', 'College level (2nd year)', 'College undergraduate', 'Senior High graduate', 'Vocational course graduate', 'College graduate (BSBA)']
};
const CERTS = { cook: 'TESDA NC II Cookery', baker: 'TESDA NC II Bread & Pastry', driver: 'Professional driver’s license (Code 1 & 2)', cashier: 'TESDA NC II Bookkeeping', bookkeeper: 'BS Accountancy, CPA board reviewee', server: 'TESDA NC II Food & Beverage Services', attendant: 'TESDA NC II Housekeeping', clerk: 'Forklift operator certificate', salesman: 'Sales seminar certificate', hr: 'BS Psychology graduate', supervisor: 'Supervisory training certificate', stocker: 'TESDA NC II Warehousing', rider: 'Non-pro license + own helmet & raincoat', helper: 'None needed' };
const PLACES = {
  food: ['karinderya sa palengke', 'canteen ng pabrika sa Valenzuela', 'fast food chain sa mall', 'hotel kitchen sa Makati', 'catering service', 'lugawan sa kanto'],
  bakery: ['bakery sa Marikina', 'pandesal stall sa Cubao', 'hotel pastry section', 'grocery bakeshop', 'home-based cake business'],
  minimart: ['convenience store (night shift)', 'grocery sa SM', 'sari-sari store ng tita', 'pharmacy', 'hardware store'],
  laundry: ['laundromat sa Sampaloc', 'hotel housekeeping', 'dry cleaner', 'kasambahay sa Quezon City'],
  trading: ['softdrinks distributor', 'rice dealer sa Divisoria', 'courier company', 'logistics warehouse', 'beverage route sales', 'trucking company'],
  any: ['BPO call center', 'construction site', 'factory sa Laguna', 'family business', 'fast food crew', 'mall promodiser']
};
const DISTANCE = [
  { t: 'Taga-dito lang sa barangay (walking distance)', late: 0.99 },
  { t: 'Isang sakay ng jeep, 20 minuto', late: 0.98 },
  { t: 'Dalawang sakay, mga 1 oras', late: 0.95 },
  { t: 'Taga-probinsya, nakikitira sa kamag-anak sa Maynila', late: 0.93 },
  { t: 'Malayo: 2 oras ang biyahe, dalawang bus', late: 0.9 }
];

// hiring differs per industry: where people come from, what you ask, what papers they need
const IND_HIRE = {
  trading: { post: 'Tanong-tanong sa mga driver at pahinante sa terminal', req: 'NBI clearance, driver\u2019s license for drivers', q: { q: 'Ayaw magbayad ng suki nating tindahan. Paano mo kokolektahin?', ans: ['"Kakausapin ko po nang maayos, mag-aalok ng hulugan, at babalikan ko sa mismong araw na pinangako."', '"Pupuntahan ko po ulit bukas."', '"Sisigawan ko po para matakot."'], by: 'att' }, mix: { senior: 1.4, older: 1.3, fresh: 0.6 } },
  food: { post: 'Karatula sa harap: "HIRING: Cook / Server"', req: 'Health certificate (food handler) from the city health office', q: { q: 'Bago humawak ng pagkain, ano ang ginagawa mo? May health certificate ka ba?', ans: ['"Hugas-kamay po, hairnet, at malinis na apron. Opo, renewed po ang health card ko."', '"Naghuhugas po ng kamay. Kukuha pa lang po ako ng health card."', '"Hmm, basta malinis naman po kamay ko."'], by: 'skill' }, mix: { fresh: 1.2, senior: 1 } },
  bakery: { post: 'Paskil sa bintana ng bakery: "WANTED: Panadero"', req: 'Health certificate (food handler)', q: { q: 'Alas-3 ng madaling-araw ang pasok dito araw-araw. Kaya mo ba?', ans: ['"Opo, sanay po ako. Maaga po akong natutulog."', '"Kakayanin ko po, susubukan ko."', '"Ang aga po pala... baka po ma-late ako minsan."'], by: 'rel' }, mix: { senior: 1.2, older: 1.4 } },
  minimart: { post: 'Paskil sa cashier: "Looking for cashier/stock clerk"', req: 'NBI clearance, barangay clearance', q: { q: 'May nakita kang batang nagbulsa ng tsokolate. Ano ang gagawin mo?', ans: ['"Lalapitan ko po nang mahinahon at kakausapin, tapos sasabihan ang supervisor."', '"Hahayaan ko na lang po, maliit lang naman."', '"Pagagalitan ko po sa harap ng lahat!"'], by: 'att' }, mix: { fresh: 1.6, nowork: 1.2, senior: 0.6 } },
  laundry: { post: 'Paskil sa labas: "Hiring: Laundry attendant, rider"', req: 'Barangay clearance', q: { q: 'Nalukot at lumiit ang damit ng customer dahil sa mainit na dryer. Ano ang gagawin mo?', ans: ['"Aaminin ko po sa customer, hihingi ng tawad, at ire-report sa inyo."', '"Ibabalik ko na lang po, baka hindi mapansin."', '"Itatago ko po."'], by: 'hon' }, mix: { nowork: 1.5, older: 1.3, shifter: 1.2 } }
};
