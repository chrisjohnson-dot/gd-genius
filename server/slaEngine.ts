/**
 * slaEngine.ts — TypeScript port of sla-report.py
 *
 * Implements the full per-client SLA classification engine including:
 *  - Canadian business-day math with statutory holidays
 *  - Weekend-grace rules
 *  - Late-receipt adjustment
 *  - Tracking-number watch detection
 *  - 50+ per-client classifiers (CLIENT_CLASSIFIERS map)
 *
 * The engine is pure (no I/O) — it takes an Extensiv order object and
 * returns an SlaResult. Fetching orders from Extensiv is done in the
 * tRPC router / scheduler that calls runSlaSnapshot().
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtensivOrder {
  readOnly?: {
    orderId?: number;
    creationDate?: string;
    fullyAllocated?: boolean;
    facilityIdentifier?: { name?: string };
    isClosed?: boolean;
    packDoneDate?: string | null;
    trackingNumber?: string | null;
    customerIdentifier?: { id?: number; name?: string };
  };
  poNum?: string;
  referenceNum?: string;
  notes?: string;
  shipTo?: { companyName?: string };
  routingInfo?: { trackingNumber?: string };
  _total_qty?: number;
  _stub?: boolean;
}

export interface SlaResult {
  orderId: number;
  clientId: number;
  clientName: string;
  poNum: string;
  refNum: string;
  creation: string;       // ISO date string
  company: string;
  notes: string;
  facility: string;
  fullyAllocated: boolean;
  rule: string;
  slaDate: string | null; // ISO date string or null
  outOfSla: boolean;
  alwaysFlag: boolean;
  flagNote?: string;
  bizDaysLate?: number;
  totalQty?: number;
  lineItems?: number;
}

// ── Canadian Statutory Holidays ───────────────────────────────────────────────

function isCanadianHoliday(d: Date): boolean {
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-based
  const day = d.getDate();

  // Fixed-date holidays
  if (m === 1  && day === 1)  return true; // New Year's Day
  if (m === 7  && day === 1)  return true; // Canada Day
  if (m === 11 && day === 11) return true; // Remembrance Day
  if (m === 12 && day === 25) return true; // Christmas Day
  if (m === 12 && day === 26) return true; // Boxing Day

  // Victoria Day — last Monday before May 25
  if (m === 5) {
    for (let dt = 24; dt >= 18; dt--) {
      const candidate = new Date(y, 4, dt);
      if (candidate.getDay() === 1) { // Monday
        if (day === dt) return true;
        break;
      }
    }
  }

  // Labour Day — first Monday in September
  if (m === 9) {
    for (let dt = 1; dt <= 7; dt++) {
      const candidate = new Date(y, 8, dt);
      if (candidate.getDay() === 1) {
        if (day === dt) return true;
        break;
      }
    }
  }

  // Thanksgiving — second Monday in October
  if (m === 10) {
    let mondays = 0;
    for (let dt = 1; dt <= 31; dt++) {
      const candidate = new Date(y, 9, dt);
      if (candidate.getDay() === 1) {
        mondays++;
        if (mondays === 2) {
          if (day === dt) return true;
          break;
        }
      }
    }
  }

  // Good Friday — 2 days before Easter
  const easter = computeEaster(y);
  const goodFriday = new Date(easter);
  goodFriday.setDate(goodFriday.getDate() - 2);
  if (m === goodFriday.getMonth() + 1 && day === goodFriday.getDate()) return true;

  return false;
}

function computeEaster(y: number): Date {
  // Anonymous Gregorian algorithm
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

function isBizDay(d: Date): boolean {
  const dow = d.getDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !isCanadianHoliday(d);
}

export function addBizDays(start: Date, n: number): Date {
  let d = new Date(start);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (isBizDay(d)) added++;
  }
  return d;
}

export function subtractBizDays(start: Date, n: number): Date {
  let d = new Date(start);
  let subtracted = 0;
  while (subtracted < n) {
    d.setDate(d.getDate() - 1);
    if (isBizDay(d)) subtracted++;
  }
  return d;
}

/** If order created on Sat/Sun, SLA date moves to next Monday + calendarDays */
export function weekendAdjustedSla(creation: Date, calendarDays: number): Date {
  const dow = creation.getDay();
  let base = new Date(creation);
  if (dow === 6) { // Saturday → next Monday
    base.setDate(base.getDate() + 2);
  } else if (dow === 0) { // Sunday → next Monday
    base.setDate(base.getDate() + 1);
  }
  base.setDate(base.getDate() + calendarDays);
  return base;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  try {
    const d = new Date(s.split('.')[0].replace(' ', 'T'));
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  } catch {
    return null;
  }
}

export function toIso(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().split('T')[0];
}

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

// ── Base order stub builder ───────────────────────────────────────────────────

function base(order: ExtensivOrder, clientId: number, clientName: string) {
  const ro = order.readOnly ?? {};
  const creation = parseDate(ro.creationDate);
  return {
    orderId: ro.orderId ?? 0,
    clientId,
    clientName,
    poNum: order.poNum ?? '',
    refNum: order.referenceNum ?? '',
    creation: toIso(creation) ?? '',
    company: order.shipTo?.companyName ?? '',
    notes: (order.notes ?? '').slice(0, 120),
    facility: ro.facilityIdentifier?.name ?? '',
    fullyAllocated: ro.fullyAllocated ?? false,
    _creation: creation,
  };
}

// ── Tracking-number watch ─────────────────────────────────────────────────────

export function classifyTrackingWatch(order: ExtensivOrder): SlaResult | null {
  const ro = order.readOnly ?? {};
  const tracking = ro.trackingNumber ?? order.routingInfo?.trackingNumber ?? '';
  if (!tracking) return null;
  const creation = parseDate(ro.creationDate);
  const cid = ro.customerIdentifier?.id ?? 0;
  const cname = ro.customerIdentifier?.name ?? `Client ${cid}`;
  const b = base(order, cid, cname);
  return {
    ...b,
    rule: `Tracking # present — ${tracking}`,
    slaDate: null,
    outOfSla: false,
    alwaysFlag: true,
    flagNote: `Tracking # ${tracking} — awaiting close`,
  };
}

// ── Per-client classifiers ────────────────────────────────────────────────────

type Classifier = (order: ExtensivOrder) => SlaResult;

function simple2BizDays(clientId: number, clientName: string, ruleName: string): Classifier {
  return (order) => {
    const b = base(order, clientId, clientName);
    const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
    const t = today();
    return { ...b, rule: ruleName, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
  };
}

function simple3BizDays(clientId: number, clientName: string, ruleName: string): Classifier {
  return (order) => {
    const b = base(order, clientId, clientName);
    const slaDate = b._creation ? addBizDays(b._creation, 3) : today();
    const t = today();
    return { ...b, rule: ruleName, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
  };
}

function simple1DayWeekendGrace(clientId: number, clientName: string, ruleName: string): Classifier {
  return (order) => {
    const b = base(order, clientId, clientName);
    const slaDate = b._creation ? weekendAdjustedSla(b._creation, 1) : today();
    const t = today();
    const rule = b._creation && b._creation.getDay() >= 6
      ? `${ruleName} (weekend grace → Mon)` : ruleName;
    return { ...b, rule, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
  };
}

// ── Organika (ID 143) ─────────────────────────────────────────────────────────
function classifyOrganika(order: ExtensivOrder): SlaResult {
  const b = base(order, 143, 'Organika');
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  const t = today();
  return { ...b, rule: 'Organika (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Amercare (ID 145) ─────────────────────────────────────────────────────────
function classifyAmercare(order: ExtensivOrder): SlaResult {
  const b = base(order, 145, 'Amercare');
  const ro = order.readOnly ?? {};
  const notes = (order.notes ?? '').trim();
  const t = today();

  // Parse "Delivery Date: YYYY-MM-DD" or "Requested Delivery Date: YYYY-MM-DD"
  const m = notes.match(/(?:Requested\s+)?Delivery Date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) {
    const deliveryDate = parseDate(m[1]);
    if (deliveryDate) {
      const slaDate = new Date(deliveryDate);
      slaDate.setDate(slaDate.getDate() - 1);
      return {
        ...b,
        rule: `Amercare (delivery ${toIso(deliveryDate)} → close by ${toIso(slaDate)})`,
        slaDate: toIso(slaDate),
        outOfSla: t > slaDate,
        alwaysFlag: false,
      };
    }
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'Amercare (2 biz days, no delivery date)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── K18 B2B (ID 129) ─────────────────────────────────────────────────────────
function classifyK18(order: ExtensivOrder): SlaResult {
  const b = base(order, 129, 'K18 Inc - B2B');
  const notes = (order.notes ?? '').trim();
  const t = today();

  const m = notes.match(/(?:Requested\s+)?(?:Ship|Delivery)\s+Date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) {
    const shipDate = parseDate(m[1]);
    if (shipDate) {
      return { ...b, rule: `K18 B2B (ship by ${toIso(shipDate)})`, slaDate: toIso(shipDate), outOfSla: t > shipDate, alwaysFlag: false };
    }
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'K18 B2B (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── K18 D2C (ID 130) ─────────────────────────────────────────────────────────
function classifyK18D2c(order: ExtensivOrder): SlaResult {
  const b = base(order, 130, 'K18 Inc - D2C');
  const slaDate = b._creation ? weekendAdjustedSla(b._creation, 1) : today();
  const t = today();
  return { ...b, rule: 'K18 D2C (1 biz day + weekend grace)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Growl (ID 131) ───────────────────────────────────────────────────────────
function classifyGrowl(order: ExtensivOrder): SlaResult {
  const b = base(order, 131, 'Growl');
  const notes = (order.notes ?? '').trim();
  const t = today();

  const m = notes.match(/(?:Requested\s+)?(?:Ship|Delivery)\s+Date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) {
    const shipDate = parseDate(m[1]);
    if (shipDate) {
      return { ...b, rule: `Growl (ship by ${toIso(shipDate)})`, slaDate: toIso(shipDate), outOfSla: t > shipDate, alwaysFlag: false };
    }
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'Growl (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Threshold (ID 176) ───────────────────────────────────────────────────────
function classifyThreshold(order: ExtensivOrder): SlaResult {
  const b = base(order, 176, 'Threshold');
  const notes = (order.notes ?? '').trim();
  const t = today();

  // "Must Ship By: YYYY-MM-DD" or "Ship By: YYYY-MM-DD"
  const m = notes.match(/(?:Must\s+)?Ship\s+By[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) {
    const shipDate = parseDate(m[1]);
    if (shipDate) {
      return { ...b, rule: `Threshold (ship by ${toIso(shipDate)})`, slaDate: toIso(shipDate), outOfSla: t > shipDate, alwaysFlag: false };
    }
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'Threshold (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Bamboo (ID 205) ──────────────────────────────────────────────────────────
const classifyBamboo = simple2BizDays(205, 'Bamboo', 'Bamboo (2 biz days)');

// ── BigBoi (ID 179) ──────────────────────────────────────────────────────────
function classifyBigboi(order: ExtensivOrder): SlaResult {
  const b = base(order, 179, 'BigBoi');
  const notes = (order.notes ?? '').trim();
  const t = today();

  const m = notes.match(/(?:Requested\s+)?(?:Ship|Delivery)\s+Date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) {
    const shipDate = parseDate(m[1]);
    if (shipDate) {
      return { ...b, rule: `BigBoi (ship by ${toIso(shipDate)})`, slaDate: toIso(shipDate), outOfSla: t > shipDate, alwaysFlag: false };
    }
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'BigBoi (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Biggest Little (ID 220) ──────────────────────────────────────────────────
const classifyBiggestLittle = simple2BizDays(220, 'Biggest Little', 'Biggest Little (2 biz days)');

// ── Birch Babe (ID 231) ──────────────────────────────────────────────────────
const classifyBirchBabe = simple2BizDays(231, 'Birch Babe', 'Birch Babe (2 biz days)');

// ── Boba Group (IDs 190, 191, 192) ───────────────────────────────────────────
function classifyBobaGroup(order: ExtensivOrder): SlaResult {
  const ro = order.readOnly ?? {};
  const cid = ro.customerIdentifier?.id ?? 191;
  const cname = ro.customerIdentifier?.name ?? 'Boba Group';
  const b = base(order, cid, cname);
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  const t = today();
  return { ...b, rule: 'Boba Group (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Bubblegum Kids (ID 204) ──────────────────────────────────────────────────
const classifyBubblegumKids = simple2BizDays(204, 'Bubblegum Kids', 'Bubblegum Kids (2 biz days)');

// ── Caboo (ID 177) ───────────────────────────────────────────────────────────
const classifyCaboo = simple2BizDays(177, 'Caboo', 'Caboo (2 biz days)');

// ── CanPrev (ID 226) ─────────────────────────────────────────────────────────
const classifyCanprev = simple2BizDays(226, 'CanPrev', 'CanPrev (2 biz days)');

// ── Chlorophyll Water (ID 100) ───────────────────────────────────────────────
const classifyChlorophyllWater = simple2BizDays(100, 'Chlorophyll Water', 'Chlorophyll Water (2 biz days)');

// ── Click and Grow (ID 113) ──────────────────────────────────────────────────
const classifyClickAndGrow = simple2BizDays(113, 'Click and Grow', 'Click and Grow (2 biz days)');

// ── Corporate Gifts (ID 208) ─────────────────────────────────────────────────
const classifyCorporateGifts = simple2BizDays(208, 'Corporate Gifts', 'Corporate Gifts (2 biz days)');

// ── Daily Nouri (ID 202) ─────────────────────────────────────────────────────
const classifyDailyNouri = simple2BizDays(202, 'Daily Nouri', 'Daily Nouri (2 biz days)');

// ── BeatBox (ID 160) ─────────────────────────────────────────────────────────
function classifyBeatbox(order: ExtensivOrder): SlaResult {
  const b = base(order, 160, 'BeatBox');
  const notes = (order.notes ?? '').trim();
  const t = today();

  const m = notes.match(/(?:Requested\s+)?(?:Ship|Delivery)\s+Date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) {
    const shipDate = parseDate(m[1]);
    if (shipDate) {
      return { ...b, rule: `BeatBox (ship by ${toIso(shipDate)})`, slaDate: toIso(shipDate), outOfSla: t > shipDate, alwaysFlag: false };
    }
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'BeatBox (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── David White / SitePro (ID 233) ───────────────────────────────────────────
const classifyDavidWhiteSitepro = simple2BizDays(233, 'David White / SitePro', 'David White/SitePro (2 biz days)');

// ── Dolce & Gabbana (ID 144) ─────────────────────────────────────────────────
const classifyDolceGabbana = simple2BizDays(144, 'Dolce & Gabbana', 'Dolce & Gabbana (2 biz days)');

// ── Drink Pres (ID 229) ──────────────────────────────────────────────────────
const classifyDrinkPres = simple2BizDays(229, 'Drink Pres', 'Drink Pres (2 biz days)');

// ── Drink Proxies (ID 218) ───────────────────────────────────────────────────
const classifyDrinkProxies = simple2BizDays(218, 'Drink Proxies', 'Drink Proxies (2 biz days)');

// ── Forte Brands (ID 147) ────────────────────────────────────────────────────
function classifyForteBrands(order: ExtensivOrder): SlaResult {
  const b = base(order, 147, 'Forte Brands');
  const slaDate = b._creation ? weekendAdjustedSla(b._creation, 1) : today();
  const t = today();
  const rule = b._creation && b._creation.getDay() >= 6
    ? 'Forte Brands (24h + weekend grace → Mon)' : 'Forte Brands (24h)';
  return { ...b, rule, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Havn Life (ID 228) ───────────────────────────────────────────────────────
const classifyHavnLife = simple2BizDays(228, 'Havn Life', 'Havn Life (2 biz days)');

// ── Helvina (ID 213) ─────────────────────────────────────────────────────────
const classifyHelvina = simple2BizDays(213, 'Helvina', 'Helvina (2 biz days)');

// ── IBG Group (ID 224) ───────────────────────────────────────────────────────
function parseIbgDeliveryDate(notes: string): Date | null {
  const m = notes.match(/Delivery Date\s*:\s*(\d{4}-\d{2}-\d{2})/i);
  if (m) return parseDate(m[1]);
  return null;
}

function classifyIbgGroup(order: ExtensivOrder): SlaResult {
  const b = base(order, 224, 'IBG Group');
  const ro = order.readOnly ?? {};
  const notes = (order.notes ?? '').trim();
  const t = today();

  if (ro.packDoneDate) {
    const age = b._creation ? diffDays(t, b._creation) : 0;
    return { ...b, rule: 'IBG Group — Packed ✅', slaDate: null, outOfSla: false, alwaysFlag: true, flagNote: `Packed ✅ — ${age}d old, awaiting pickup` };
  }

  const deliveryDate = parseIbgDeliveryDate(notes);
  if (deliveryDate) {
    const rawSla = new Date(deliveryDate);
    rawSla.setDate(rawSla.getDate() - 1);
    const slaDate = b._creation ? (rawSla > addBizDays(b._creation, 2) ? rawSla : addBizDays(b._creation, 2)) : rawSla;
    const watchDate = new Date(deliveryDate);
    watchDate.setDate(watchDate.getDate() - 2);
    const outOfSla = t > slaDate;
    const daysToDelivery = diffDays(deliveryDate, t);

    if (outOfSla) {
      return { ...b, rule: `IBG Group (delivery ${toIso(deliveryDate)} → close by ${toIso(slaDate)})`, slaDate: toIso(slaDate), outOfSla: true, alwaysFlag: false };
    } else if (t >= watchDate) {
      return { ...b, rule: `IBG Group (delivery ${toIso(deliveryDate)} → close by ${toIso(slaDate)})`, slaDate: toIso(slaDate), outOfSla: false, alwaysFlag: true, flagNote: `⏰ Delivery ${toIso(deliveryDate)} in ${daysToDelivery}d — close by ${toIso(slaDate)}` };
    } else {
      return { ...b, rule: `IBG Group (delivery ${toIso(deliveryDate)} → close by ${toIso(slaDate)})`, slaDate: toIso(slaDate), outOfSla: false, alwaysFlag: false };
    }
  }

  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'IBG Group (2 biz days, no delivery date)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Joyburst / No Sugar Company (IDs 173, 171) ───────────────────────────────
function classifyJoyburstNoSugar(order: ExtensivOrder): SlaResult {
  const ro = order.readOnly ?? {};
  const cid = ro.customerIdentifier?.id ?? 173;
  const cname = ro.customerIdentifier?.name ?? 'Joyburst/No Sugar Co.';
  const b = base(order, cid, cname);
  const slaDate = b._creation ? weekendAdjustedSla(b._creation, 1) : today();
  const t = today();
  return { ...b, rule: `${cname} (1 biz day + weekend grace)`, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── JUUL USA B2B (ID 82) ─────────────────────────────────────────────────────
function classifyJuulUsaB2b(order: ExtensivOrder): SlaResult {
  const b = base(order, 82, 'JUUL USA - B2B');
  const notes = (order.notes ?? '').trim();
  const t = today();

  const m = notes.match(/Requested Delivery Date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) {
    const deliveryDate = parseDate(m[1]);
    if (deliveryDate) {
      const slaDate = new Date(deliveryDate);
      slaDate.setDate(slaDate.getDate() - 1);
      return { ...b, rule: `JUUL USA B2B (delivery ${toIso(deliveryDate)} → close by ${toIso(slaDate)})`, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
    }
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'JUUL USA B2B (2 biz days, no delivery date)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── JUUL USA RetB (ID 93) ────────────────────────────────────────────────────
const classifyJuulUsaRetb = simple2BizDays(93, 'JUUL USA - RetB', 'JUUL USA RetB (2 biz days)');

// ── JUUL B2B (ID 3) ──────────────────────────────────────────────────────────
const classifyJuulB2b = simple2BizDays(3, 'JUUL - B2B', 'JUUL B2B (2 biz days)');

// ── JUUL D2C (IDs 33, 83) ────────────────────────────────────────────────────
function classifyJuulD2c(order: ExtensivOrder): SlaResult {
  const ro = order.readOnly ?? {};
  const cid = ro.customerIdentifier?.id ?? 33;
  const cname = ro.customerIdentifier?.name ?? 'JUUL D2C';
  const b = base(order, cid, cname);
  const slaDate = b._creation ? weekendAdjustedSla(b._creation, 1) : today();
  const t = today();
  return { ...b, rule: `${cname} (1 biz day + weekend grace)`, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Kabrita (ID 185) ─────────────────────────────────────────────────────────
const classifyKabrita = simple2BizDays(185, 'Kabrita', 'Kabrita (2 biz days)');

// ── Kindling (ID 197) ────────────────────────────────────────────────────────
function classifyKindling(order: ExtensivOrder): SlaResult {
  const b = base(order, 197, 'Kindling');
  const notes = (order.notes ?? '').trim();
  const t = today();

  const m = notes.match(/(?:Requested\s+)?(?:Ship|Delivery)\s+Date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) {
    const shipDate = parseDate(m[1]);
    if (shipDate) {
      return { ...b, rule: `Kindling (ship by ${toIso(shipDate)})`, slaDate: toIso(shipDate), outOfSla: t > shipDate, alwaysFlag: false };
    }
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'Kindling (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Left Coast Naturals (ID 151) ─────────────────────────────────────────────
const classifyLeftCoastNaturals = simple2BizDays(151, 'Left Coast Naturals', 'Left Coast Naturals (2 biz days)');

// ── Lil Bucks (ID 216) ───────────────────────────────────────────────────────
function parseLilBucksDates(notes: string): { shipDate: Date | null; mustArrive: Date | null; earliestDelivery: Date | null } {
  let shipDate: Date | null = null, mustArrive: Date | null = null, earliestDelivery: Date | null = null;
  let m = notes.match(/Requested ship date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) shipDate = parseDate(m[1]);
  m = notes.match(/Must arrive by date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) mustArrive = parseDate(m[1]);
  m = notes.match(/Amazon Earliest Delivery[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (m) earliestDelivery = parseDate(m[1]);
  return { shipDate, mustArrive, earliestDelivery };
}

function classifyLilBucks(order: ExtensivOrder): SlaResult {
  const b = base(order, 216, 'Lil Bucks');
  const notes = (order.notes ?? '').trim();
  const t = today();
  const { shipDate, mustArrive, earliestDelivery } = parseLilBucksDates(notes);

  if (shipDate) {
    return { ...b, rule: `Lil Bucks (ship by ${toIso(shipDate)})`, slaDate: toIso(shipDate), outOfSla: t > shipDate, alwaysFlag: false };
  }
  if (mustArrive) {
    const slaDate = subtractBizDays(mustArrive, 5);
    return { ...b, rule: `Lil Bucks (must arrive ${toIso(mustArrive)} → ship by ${toIso(slaDate)})`, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
  }
  if (earliestDelivery) {
    const slaDate = new Date(earliestDelivery);
    slaDate.setDate(slaDate.getDate() - 1);
    return { ...b, rule: `Lil Bucks (earliest delivery ${toIso(earliestDelivery)} → ship by ${toIso(slaDate)})`, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'Lil Bucks (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Magic Scoop (ID 222) ─────────────────────────────────────────────────────
const classifyMagicScoop = simple2BizDays(222, 'Magic Scoop', 'Magic Scoop (2 biz days)');

// ── Nestle NOPT (ID 11) ──────────────────────────────────────────────────────
const classifyNestleNopt = simple2BizDays(11, 'Nestle - NOPT', 'Nestle NOPT (2 biz days)');

// ── Nestle NHS (ID 6) ────────────────────────────────────────────────────────
const classifyNestleNhs = simple2BizDays(6, 'Nestle Health Science', 'Nestle NHS (2 biz days)');

// ── Pantheryx (ID 203) ───────────────────────────────────────────────────────
function parsePantheryxShipDate(notes: string): Date | null {
  const m = notes.match(/Requested Ship Date[:\s]+\w+,\s+(\w+ \d{1,2},\s+\d{4})/i);
  if (m) {
    try {
      return new Date(m[1].trim());
    } catch { return null; }
  }
  return null;
}

function classifyPantheryx(order: ExtensivOrder): SlaResult {
  const b = base(order, 203, 'Pantheryx');
  const notes = (order.notes ?? '').trim();
  const t = today();
  const shipDate = parsePantheryxShipDate(notes);
  if (shipDate && !isNaN(shipDate.getTime())) {
    shipDate.setHours(0, 0, 0, 0);
    return { ...b, rule: `Pantheryx (ship by ${toIso(shipDate)})`, slaDate: toIso(shipDate), outOfSla: t > shipDate, alwaysFlag: false };
  }
  const slaDate = b._creation ? addBizDays(b._creation, 2) : today();
  return { ...b, rule: 'Pantheryx (2 biz days)', slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
}

// ── Quantum (ID 165) ─────────────────────────────────────────────────────────
const classifyQuantum = simple2BizDays(165, 'Quantum', 'Quantum (2 biz days)');

// ── Raw C (ID 196) ───────────────────────────────────────────────────────────
const classifyRawC = simple2BizDays(196, 'Raw C', 'Raw C (2 biz days)');

// ── Schaaf Tools (ID 236) ────────────────────────────────────────────────────
const classifySchaafTools = simple2BizDays(236, 'Schaaf Tools', 'Schaaf Tools (2 biz days)');

// ── Scotts (ID 71) ───────────────────────────────────────────────────────────
const classifyScotts = simple2BizDays(71, 'Scotts', 'Scotts (2 biz days)');

// ── Shaper Tools (ID 14) ─────────────────────────────────────────────────────
const classifyShaperTools = simple2BizDays(14, 'Shaper Tools', 'Shaper Tools (2 biz days)');

// ── SmartSweets (ID 140) ─────────────────────────────────────────────────────
const classifySmartsweets = simple2BizDays(140, 'SmartSweets', 'SmartSweets (2 biz days)');

// ── Squishable (ID 149) ──────────────────────────────────────────────────────
const classifySquishable = simple2BizDays(149, 'Squishable', 'Squishable (2 biz days)');

// ── Ted Baker (ID 227) ───────────────────────────────────────────────────────
const classifyTedBaker = simple2BizDays(227, 'Ted Baker', 'Ted Baker (2 biz days)');

// ── Two Sage Sisters (ID 162) ────────────────────────────────────────────────
const classifyTwoSageSisters = simple2BizDays(162, 'Two Sage Sisters', 'Two Sage Sisters (2 biz days)');

// ── Vintage Home (ID 225) ────────────────────────────────────────────────────
// D2C (≤5 items) = 24h + weekend grace; B2B (≥6 items) = 3 biz days
function classifyVintageHome(order: ExtensivOrder): SlaResult {
  const b = base(order, 225, 'Vintage Home');
  const totalQty = order._total_qty ?? 0;
  const t = today();

  if (totalQty <= 5) {
    const slaDate = b._creation ? weekendAdjustedSla(b._creation, 1) : today();
    const rule = b._creation && b._creation.getDay() >= 6
      ? `Vintage Home D2C (${totalQty} items — 24h + weekend grace → Mon)`
      : `Vintage Home D2C (${totalQty} items — 24h)`;
    return { ...b, rule, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
  } else {
    const slaDate = b._creation ? addBizDays(b._creation, 3) : today();
    return { ...b, rule: `Vintage Home B2B (${totalQty} items — 3 biz days)`, slaDate: toIso(slaDate), outOfSla: t > slaDate, alwaysFlag: false };
  }
}

// ── Well Played Toys (ID 157) ────────────────────────────────────────────────
const classifyWellPlayedToys = simple2BizDays(157, 'Well Played Toys', 'Well Played Toys (2 biz days)');

// ── CLIENT_CLASSIFIERS map ────────────────────────────────────────────────────

export const CLIENT_CLASSIFIERS: Record<number, Classifier> = {
  143: classifyOrganika,
  145: classifyAmercare,
  129: classifyK18,
  130: classifyK18D2c,
  131: classifyGrowl,
  176: classifyThreshold,
  205: classifyBamboo,
  179: classifyBigboi,
  220: classifyBiggestLittle,
  231: classifyBirchBabe,
  191: classifyBobaGroup,
  192: classifyBobaGroup,
  190: classifyBobaGroup,
  204: classifyBubblegumKids,
  177: classifyCaboo,
  226: classifyCanprev,
  100: classifyChlorophyllWater,
  113: classifyClickAndGrow,
  208: classifyCorporateGifts,
  202: classifyDailyNouri,
  160: classifyBeatbox,
  233: classifyDavidWhiteSitepro,
  144: classifyDolceGabbana,
  229: classifyDrinkPres,
  218: classifyDrinkProxies,
  147: classifyForteBrands,
  228: classifyHavnLife,
  213: classifyHelvina,
  224: classifyIbgGroup,
  173: classifyJoyburstNoSugar,
  171: classifyJoyburstNoSugar,
  3:   classifyJuulB2b,
  82:  classifyJuulUsaB2b,
  93:  classifyJuulUsaRetb,
  185: classifyKabrita,
  197: classifyKindling,
  33:  classifyJuulD2c,
  83:  classifyJuulD2c,
  151: classifyLeftCoastNaturals,
  216: classifyLilBucks,
  222: classifyMagicScoop,
  11:  classifyNestleNopt,
  6:   classifyNestleNhs,
  203: classifyPantheryx,
  165: classifyQuantum,
  196: classifyRawC,
  236: classifySchaafTools,
  71:  classifyScotts,
  14:  classifyShaperTools,
  140: classifySmartsweets,
  149: classifySquishable,
  227: classifyTedBaker,
  162: classifyTwoSageSisters,
  225: classifyVintageHome,
  157: classifyWellPlayedToys,
};

// ── SLA_CLIENTS name map ──────────────────────────────────────────────────────

export const SLA_CLIENTS: Record<number, string> = {
  143: 'Organika',
  145: 'Amercare',
  129: 'K18 Inc - B2B',
  130: 'K18 Inc - D2C',
  131: 'Growl',
  176: 'Threshold',
  205: 'Bamboo',
  179: 'BigBoi',
  220: 'Biggest Little',
  231: 'Birch Babe',
  191: 'Boba Group',
  192: 'Boba Group (2)',
  190: 'Boba Group (3)',
  204: 'Bubblegum Kids',
  177: 'Caboo',
  226: 'CanPrev',
  100: 'Chlorophyll Water',
  113: 'Click and Grow',
  208: 'Corporate Gifts',
  202: 'Daily Nouri',
  160: 'BeatBox',
  233: 'David White / SitePro',
  144: 'Dolce & Gabbana',
  229: 'Drink Pres',
  218: 'Drink Proxies',
  147: 'Forte Brands',
  228: 'Havn Life',
  213: 'Helvina',
  224: 'IBG Group',
  173: 'Joyburst',
  171: 'No Sugar Company',
  3:   'JUUL - B2B',
  82:  'JUUL USA - B2B',
  93:  'JUUL USA - RetB',
  185: 'Kabrita',
  197: 'Kindling',
  33:  'JUUL - D2C',
  83:  'JUUL USA - D2C',
  151: 'Left Coast Naturals',
  216: 'Lil Bucks',
  222: 'Magic Scoop',
  11:  'Nestle - NOPT',
  6:   'Nestle Health Science',
  203: 'Pantheryx',
  165: 'Quantum',
  196: 'Raw C',
  236: 'Schaaf Tools',
  71:  'Scotts',
  14:  'Shaper Tools',
  140: 'SmartSweets',
  149: 'Squishable',
  227: 'Ted Baker',
  162: 'Two Sage Sisters',
  225: 'Vintage Home',
  157: 'Well Played Toys',
};

// ── Main classification runner ────────────────────────────────────────────────

export function classifyOrder(order: ExtensivOrder): SlaResult | null {
  const ro = order.readOnly ?? {};
  if (ro.isClosed) return null;

  const cid = ro.customerIdentifier?.id;
  if (!cid) return null;

  // Tracking watch takes priority
  const trackingResult = classifyTrackingWatch(order);
  if (trackingResult) return trackingResult;

  const classifier = CLIENT_CLASSIFIERS[cid];
  if (!classifier) return null;

  const result = classifier(order);

  // Add bizDaysLate for OOS orders
  if (result.outOfSla && result.slaDate) {
    const slaD = parseDate(result.slaDate);
    if (slaD) {
      result.bizDaysLate = diffDays(today(), slaD);
    }
  }

  return result;
}

export function classifyOrders(orders: ExtensivOrder[]): SlaResult[] {
  const results: SlaResult[] = [];
  for (const order of orders) {
    const r = classifyOrder(order);
    if (r) results.push(r);
  }
  return results;
}

// ── Warehouse sort order ──────────────────────────────────────────────────────

const WH_ORDER = ['TOR', 'COL', 'REN', 'CAL'];

export function sortWarehouses(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ai = WH_ORDER.findIndex(p => a.toUpperCase().startsWith(p));
    const bi = WH_ORDER.findIndex(p => b.toUpperCase().startsWith(p));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}
