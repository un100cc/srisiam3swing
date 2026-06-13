// SRISIAM Waves engine — 3 Swings + ท่ามาตรฐาน + 100 of A + ความแรง Divergence
// ตรวจจับ: Trend line 2-4 → RSI Divergence (วัดความแรงด้วย Fib ext ของ sideway)
// → หลุดเทรนด์ไลน์ → Choch (ปิดเต็มแท่ง) → M1/M2 retrace → เป้า M3 ตามตาราง 4 แบบ

// ---------- indicators ----------
function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

// ---------- pivots ----------
function findPivots(c, L = 4, R = 4) {
  const piv = [];
  for (let i = L; i < c.length - R; i++) {
    let isH = true, isL = true;
    for (let j = i - L; j <= i + R; j++) {
      if (j === i) continue;
      if (c[j].high >= c[i].high) isH = false;
      if (c[j].low <= c[i].low) isL = false;
      if (!isH && !isL) break;
    }
    if (isH) piv.push({ i, price: c[i].high, t: 'H' });
    if (isL) piv.push({ i, price: c[i].low, t: 'L' });
  }
  return piv;
}

function zigzag(piv) {
  const z = [];
  for (const p of piv) {
    const last = z[z.length - 1];
    if (!last) { z.push({ ...p }); continue; }
    if (last.t === p.t) {
      if (p.t === 'H' ? p.price > last.price : p.price < last.price) z[z.length - 1] = { ...p };
    } else z.push({ ...p });
  }
  return z;
}

// rsi ที่จุด pivot — ใช้ค่า "ที่แท่ง pivot จริง" (±1 เฉพาะกรณีค่า null)
// หมายเหตุ: ห้ามกวาด window กว้างแล้วเอา max/min — จะคว้าค่า spike ข้างเคียงสร้าง divergence ปลอม
function rsiAt(rsiArr, i, t) {
  if (rsiArr[i] != null) return rsiArr[i];
  for (let d = 1; d <= 1; d++) {
    if (rsiArr[i - d] != null) return rsiArr[i - d];
    if (rsiArr[i + d] != null) return rsiArr[i + d];
  }
  return null;
}

// ---------- ตาราง 4 แบบ (ความลับ Divergence) ----------
// divExt = ระยะ Div (% fib ext ของ sideway), retrace = M2 retrace %
function m3Expectation(divExt, retracePct) {
  if (retracePct != null && retracePct > 50) return { lo: 100, hi: 100, form: 'ขั้นต่ำ 100 of A (M2 ลึกเกิน 50%)' };
  if (divExt >= 161.8) {
    if (retracePct != null && retracePct <= 38.2) return { lo: 161.8, hi: 200, form: 'แบบที่ 1 : Div แรง + รีเทสตื้น' };
    if (retracePct != null) return { lo: 138.2, hi: 161.8, form: 'แบบที่ 2 : Div แรง + รีเทสลึก' };
    return { lo: 100, hi: 161.8, form: 'Div แรง (รอ M2)' };
  }
  if (divExt >= 138.2) {
    if (retracePct != null && retracePct <= 38.2) return { lo: 100, hi: 138.2, form: 'แบบที่ 3 : Div ปานกลาง + รีเทสตื้น' };
    if (retracePct != null) return { lo: 100, hi: 100, form: 'แบบที่ 4 : Div ปานกลาง + รีเทสลึก' };
    return { lo: 100, hi: 138.2, form: 'Div ปานกลาง (รอ M2)' };
  }
  return { lo: 100, hi: 100, form: 'ขั้นต่ำ 100 of A' };
}

// ---------- core (มุมมองฝั่ง SHORT: จบขาขึ้น) ----------
// สำหรับฝั่ง LONG ใช้แท่งเทียน mirror แล้วแปลงราคากลับ
function detectBearish(candles, opts = {}) {
  const maxAgeBars = opts.maxAgeBars ?? 90;       // setup ต้องไม่เก่าเกินนี้ (นับจากจุด 5)
  const closes = candles.map(c => c.close);
  const r = rsi(closes, 14);
  const piv = findPivots(candles, opts.pivotL ?? 4, opts.pivotR ?? 4);
  const z = zigzag(piv);
  const n = candles.length;

  // หา pattern ล่าสุด: L2 → H3 → L4 → H5 (HH + HL = ขาขึ้น)
  for (let k = z.length - 1; k >= 3; k--) {
    if (z[k].t !== 'H') continue;
    const H5 = z[k], L4 = z[k - 1], H3 = z[k - 2], L2 = z[k - 3];
    if (L4.t !== 'L' || H3.t !== 'H' || L2.t !== 'L') continue;
    if (n - 1 - H5.i > maxAgeBars) break;                 // เก่าเกินไป
    if (!(L4.price > L2.price)) continue;                  // ต้องเป็น HL
    if (!(H5.price >= H3.price * 0.998)) continue;         // HH หรือ Equal High

    // ----- จุด (1) + กฎ Elliott impulse: (3)>(1) และ (4) ห้าม overlap (1) -----
    let P1 = null;
    for (const p of piv) if (p.t === 'H' && p.i < L2.i) P1 = p;
    if (!P1) continue;                                     // ต้องมีจุด (1) ยืนยันโครงสร้าง 5 คลื่น
    if (!(H3.price > P1.price)) continue;                  // wave3 ต้องสูงกว่า wave1
    if (!(L4.price > P1.price)) continue;                  // wave4 ห้าม overlap wave1 (non-overlap rule)

    // ----- RSI Regular Bearish Divergence -----
    const r3 = rsiAt(r, H3.i, 'H'), r5 = rsiAt(r, H5.i, 'H');
    if (r3 == null || r5 == null || !(r5 < r3 - 0.5)) continue;

    // ----- ความแรง Div: fib ext ของ sideway (3)→(4) ที่ราคาวิ่งไปทำจุด (5) -----
    const range34 = H3.price - L4.price;
    if (range34 <= 0) continue;
    const divExt = ((H5.price - L4.price) / range34) * 100;
    // คู่มือ: Div ที่ใช้ได้ต้อง ≥138.2% (ตาราง 4 แบบมีแค่ 138.2% / 161.8%) — ต่ำกว่านี้ไม่เข้าเกณฑ์
    if (divExt < 138.2) continue;
    const divStrength = divExt >= 161.8 ? 'แรง' : 'ปานกลาง';
    const obos = r3 >= 70 && r5 >= 65; // โซน overbought ทั้งคู่ (ผ่อนเล็กน้อยที่จุดสอง)

    // ----- invalidate: ราคาปิดกลับขึ้นทะลุจุด (5) = wave count เสีย -----
    let reclaimed = false;
    for (let i = H5.i + 1; i < n; i++) if (candles[i].close > H5.price * 1.001) { reclaimed = true; break; }
    if (reclaimed) continue;

    // ----- Trend line 2-4 -----
    const slope = (L4.price - L2.price) / (L4.i - L2.i);
    const tlAt = (i) => L2.price + slope * (i - L2.i);

    // internal swing low สุดท้ายก่อนถึงจุด (5) — ใช้เช็ค Choch (Internal)
    let internalLow = null;
    for (const p of piv) if (p.t === 'L' && p.i > L4.i && p.i < H5.i) internalLow = p;

    // ----- สแกนเหตุการณ์หลังจุด (5): หลุดเทรนด์ไลน์ / Choch (ปิดเต็มแท่ง = ใช้ราคา close) -----
    let breakIdx = null, chochIntIdx = null, chochExtIdx = null;
    for (let i = H5.i + 1; i < n; i++) {
      const cl = candles[i].close;
      if (breakIdx == null && cl < tlAt(i)) breakIdx = i;
      if (chochIntIdx == null && internalLow && cl < internalLow.price) chochIntIdx = i;
      if (chochExtIdx == null && cl < L4.price) { chochExtIdx = i; break; }
    }

    const last = candles[n - 1];
    const price = last.close;

    const base = {
      side: 'SHORT',
      points: { p1: P1 ? P1.price : null, p2: L2.price, p3: H3.price, p4: L4.price, p5: H5.price, p5Idx: H5.i },
      idx: { p1: P1 ? P1.i : null, p2: L2.i, p3: H3.i, p4: L4.i, p5: H5.i },
      rsi: { r3: round(r3, 1), r5: round(r5, 1), obos },
      divExt: round(divExt, 1), divStrength,
      trendlineNow: round(tlAt(n - 1)),
      chochLevel: L4.price,
      internalLow: internalLow ? internalLow.price : null,
      barsSinceP5: n - 1 - H5.i,
      price,
    };

    // ----- ระบุ stage -----
    if (chochExtIdx == null) {
      if (breakIdx == null && chochIntIdx == null) {
        // เพิ่งเกิด Div — ราคายังอยู่เหนือเส้น
        return { ...base, stage: 'DIV', stageInfo: 'เกิด Divergence — รอหลุด Trendline 2-4 / Choch' };
      }
      return {
        ...base, stage: 'BREAK',
        stageInfo: (chochIntIdx != null ? 'Choch (Internal) แล้ว' : 'หลุด Trendline 2-4 แล้ว') + ' — รอ Choch (External) ปิดเต็มแท่งใต้จุด (4)',
      };
    }

    // ----- หลัง Choch (External): M1 / M2 / M3 -----
    // M1 = สวิงลงแรก = pivot low ตัวแรกตั้งแต่จุด Choch (ไม่ใช่ low ต่ำสุดทั้งหมด)
    let m1Idx = null, m1Low = null;
    for (const p of piv) if (p.t === 'L' && p.i >= chochExtIdx) { m1Idx = p.i; m1Low = p.price; break; }
    // ยังไม่เกิด pivot low (สวิงแรกกำลังก่อตัว) — ใช้ low ต่ำสุดชั่วคราว, ยังไม่มี M2
    let m1Provisional = false;
    if (m1Idx == null) {
      m1Provisional = true; m1Idx = chochExtIdx; m1Low = candles[chochExtIdx].low;
      for (let i = chochExtIdx; i < n; i++) if (candles[i].low < m1Low) { m1Low = candles[i].low; m1Idx = i; }
    }
    const m1Size = H5.price - m1Low;
    if (m1Size <= 0) continue;

    // M2 = retrace = pivot high ตัวแรกหลัง M1
    let m2High = null, m2Idx = null;
    if (!m1Provisional) {
      for (const p of piv) if (p.t === 'H' && p.i > m1Idx) { m2Idx = p.i; m2High = p.price; break; }
    }
    const retracePct = m2High != null ? ((m2High - m1Low) / m1Size) * 100 : null;
    if (retracePct != null && retracePct > 100) continue; // retrace ทะลุจุด (5) = โครงสร้างกลับตัวเสียแล้ว

    const exp = m3Expectation(divExt, retracePct);
    const anchor = m2High != null ? m2High : L4.price; // จุด B ของ Fib Extension (0=จุด5, A=M1, B=M2)
    // over-extended: สวิงแรก (5)→M1 ใหญ่จนเป้า 100% ทะลุ 0 (ฝั่ง SHORT จริงเท่านั้น) = เทรดไม่ได้ ทิ้ง
    if (anchor > 0 && anchor - m1Size <= 0) continue;
    // ฝั่ง SHORT จริง (ราคาบวก) เป้าห้ามต่ำกว่า 0 — ฝั่ง LONG วิ่งบนราคา mirror (ติดลบ) ห้าม clamp
    const clampM3 = (v) => (anchor > 0 ? Math.max(v, 0) : v);
    const m3 = {
      tp1: round(clampM3(anchor - 1.0 * m1Size)),         // 100 of A = TP ขั้นต่ำเสมอ (คู่มือหน้า 11)
      lo: round(clampM3(anchor - (exp.lo / 100) * m1Size)), // ขอบใกล้ของโซนคาดหวังตามฟอร์ม
      hi: round(clampM3(anchor - (exp.hi / 100) * m1Size)), // ขอบไกลของโซนคาดหวัง
      pctLo: exp.lo, pctHi: exp.hi, form: exp.form,
    };

    // โซน entry ท่ามาตรฐาน: Flip (neckline = จุด 4) + Fib retrace 38.2–78.6% ของ M1
    const entryLo = m1Low + 0.382 * m1Size;
    const entryHi = m1Low + 0.786 * m1Size;
    const inEntry = price >= entryLo && price <= entryHi;

    // Post-Pattern Effect / invalidation zone = Fib 0.786–0.886 ของ M1 (คู่มือ/เคส: reaction zone หลัง pattern)
    // ถ้าราคาเข้าโซนนี้หรือเกิน = retrace ลึกผิดปกติ → setup กลับตัวกำลังอ่อน/ใกล้ invalid
    const ppe = { lo: round(m1Low + 0.786 * m1Size), hi: round(m1Low + 0.886 * m1Size) };

    // ----- M3 speed/quality (M3X) : แยก "กลับตัวจริง (เร็วแรง)" จาก "พักตัวไปต่อ (อืด)" -----
    // เทียบความเร็วขา M3 (M2→ปัจจุบัน) กับขา M1 ((5)→M1) — self-calibrating ไม่ใช้เลขมายากล
    const m1Bars = Math.max(m1Idx - H5.i, 1);
    const m1Vel = m1Size / m1Bars;
    let m3q = null;
    if (m2Idx != null) {
      const m3Bars = Math.max((n - 1) - m2Idx, 1);
      const m3Travel = anchor - price;                 // ระยะที่ M3 วิ่งไปทางเป้า (บวกเมื่อคืบหน้า ทั้ง SHORT/LONG-mirror)
      const m3Vel = m3Travel / m3Bars;
      const ratio = m1Vel > 0 ? m3Vel / m1Vel : 0;
      m3q = {
        ratio: round(ratio, 2),
        grade: ratio >= 1 ? 'M3X' : ratio >= 0.5 ? 'M3' : 'SLOW',
        bars: m3Bars,
      };
    }

    const ext = {
      ...base,
      idx: { ...base.idx, choch: chochExtIdx, m1: m1Idx, m2: m2Idx },
      abc: { a: 'M1', b: 'M2', c: 'M3' },              // M1/M2/M3 = ABC correction (คู่มือหน้า 10,12)
      m1: { high: H5.price, low: m1Low, size: round(m1Size) },
      m2: m2High != null ? { high: m2High, retracePct: round(retracePct, 1) } : null,
      m3, m3q, ppe,
      entryZone: { lo: round(entryLo), hi: round(entryHi), flip: L4.price },
      barsSinceChoch: n - 1 - chochExtIdx,
    };

    if (m2High == null || retracePct < 23.6) {
      return { ...ext, stage: 'CHOCH', stageInfo: 'Choch (External) ปิดเต็มแท่งแล้ว — รอ retrace เข้าโซน entry (M1/=A เกิดแล้ว)' };
    }
    if (inEntry) {
      const near886 = price >= ppe.lo;
      return { ...ext, stage: 'ENTRY', stageInfo: near886
        ? '⚡ Entry แต่ลึกถึงโซน Post-Pattern Effect (0.786–0.886) — ระวัง invalid'
        : '⚡ ราคาอยู่ในโซน entry (Fib 38.2–78.6% / Flip) — เข้าที่ M2/=B' };
    }
    // เลย M2 แล้ว กำลังวิ่งหา M3/=C
    if (price < entryLo) {
      const hit = price <= m3.tp1;
      const qtag = m3q ? ` · ${m3q.grade === 'M3X' ? '🚀 M3X (เร็ว/แรง = กลับตัวจริง)' : m3q.grade === 'SLOW' ? '🐢 M3 อืด — ระวัง 3 สวิงพักตัวไปต่อ (invalid)' : 'M3 ปกติ'}` : '';
      return { ...ext, stage: hit ? 'M3' : 'RUN', stageInfo: (hit ? '🎯 ถึงเป้า M3 ขั้นต่ำ (100%) แล้ว' : 'กำลังวิ่งหา M3/=C') + qtag };
    }
    // retrace เกิน 78.6% = เข้าโซน Post-Pattern Effect → จุด invalidation ที่ดี
    return { ...ext, stage: 'CHOCH', stageInfo: '⚠️ retrace ลึกเกิน 78.6% เข้าโซน Post-Pattern Effect (0.786–0.886) — ใกล้ invalid, เฝ้าระวังพลิกเป็นพักตัวไปต่อ' };
  }
  return null;
}

function mirror(candles) {
  return candles.map(c => ({ time: c.time, open: -c.open, high: -c.low, low: -c.high, close: -c.close, volume: c.volume }));
}

function flipPrice(v) { return v == null ? null : round(-v); }

function detectBullish(candles, opts) {
  const m = detectBearish(mirror(candles), opts);
  if (!m) return null;
  const f = flipPrice;
  return {
    ...m,
    side: 'LONG',
    price: f(m.price),
    points: { p1: f(m.points.p1), p2: f(m.points.p2), p3: f(m.points.p3), p4: f(m.points.p4), p5: f(m.points.p5), p5Idx: m.points.p5Idx },
    rsi: { r3: round(100 - m.rsi.r3, 1), r5: round(100 - m.rsi.r5, 1), obos: m.rsi.obos },
    trendlineNow: f(m.trendlineNow),
    chochLevel: f(m.chochLevel),
    internalLow: f(m.internalLow),
    m1: m.m1 ? { high: f(m.m1.low), low: f(m.m1.high), size: m.m1.size } : undefined,
    m2: m.m2 ? { high: f(m.m2.high), retracePct: m.m2.retracePct } : m.m2,
    m3: m.m3 ? { ...m.m3, tp1: f(m.m3.tp1), lo: f(m.m3.lo), hi: f(m.m3.hi) } : undefined,
    m3q: m.m3q,                                          // ratio/grade ไม่มีราคา ส่งผ่านได้เลย
    ppe: m.ppe ? { lo: f(m.ppe.hi), hi: f(m.ppe.lo) } : undefined, // flip + สลับ lo/hi ให้ lo<hi
    entryZone: m.entryZone ? { lo: f(m.entryZone.hi), hi: f(m.entryZone.lo), flip: f(m.entryZone.flip) } : undefined,
  };
}

function round(v, d = 6) {
  if (v == null || !isFinite(v)) return null;
  const m = Math.pow(10, d);
  const r = Math.round(v * m) / m;
  // ตัดทศนิยมตามขนาดราคา
  if (d === 6) {
    const a = Math.abs(r);
    if (a >= 1000) return Math.round(r * 100) / 100;
    if (a >= 1) return Math.round(r * 10000) / 10000;
  }
  return r;
}

function analyze(candles, opts = {}) {
  const bear = detectBearish(candles, opts);
  const bull = detectBullish(candles, opts);
  // เลือก setup ที่สดกว่า (จุด 5 ใหม่กว่า)
  if (bear && bull) return bear.points.p5Idx >= bull.points.p5Idx ? bear : bull;
  return bear || bull;
}

module.exports = { analyze, detectBearish, detectBullish, rsi, findPivots, zigzag, m3Expectation };
