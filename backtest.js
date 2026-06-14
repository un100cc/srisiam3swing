// Backtest REV (SRISIAM reversal) — history ยาว + enumerate ทุก setup + expectancy/drawdown
// run: node backtest.js [tf] [topN] [bars]   e.g. node backtest.js 4h 40 2500
const https = require('https');
const { findPivots, zigzag, rsi, emaArr, m3Expectation } = require('./srisiam');

const TF = process.argv[2] || '4h';
const TOPN = +(process.argv[3] || 40);
const BARS = +(process.argv[4] || 2500);
const EXCLUDE = /^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|USDP|AEUR|USD1|XUSD|RLUSD|USDE|PYUSD|GUSD|USTC)USDT$/;

function jget(url) {
  return new Promise((res) => {
    https.get(url, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res(JSON.parse(d)); } catch { res(null); } }); }).on('error', () => res(null));
  });
}
async function topSymbols(n) {
  const all = await jget('https://api.binance.com/api/v3/ticker/24hr');
  return all.filter(t => t.symbol.endsWith('USDT') && !EXCLUDE.test(t.symbol) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol))
    .sort((a, b) => +b.quoteVolume - +a.quoteVolume).slice(0, n).map(t => t.symbol);
}
async function history(sym, tf, bars) {
  let out = [], endTime = Date.now();
  while (out.length < bars) {
    const raw = await jget(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000&endTime=${endTime}`);
    if (!Array.isArray(raw) || raw.length === 0) break;
    const chunk = raw.map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
    out = chunk.concat(out);
    endTime = chunk[0].time - 1;
    if (raw.length < 1000) break;
  }
  // dedupe + sort
  const m = new Map(); out.forEach(c => m.set(c.time, c));
  return [...m.values()].sort((a, b) => a.time - b.time);
}

function rsiAt(r, i) { if (r[i] != null) return r[i]; for (let d = 1; d <= 1; d++) { if (r[i - d] != null) return r[i - d]; if (r[i + d] != null) return r[i + d]; } return null; }

// enumerate ทุก REV setup (ฝั่ง SHORT) บน candles — คืน trade outcomes
function backtestSide(c) {
  const n = c.length, minLeg = 3;
  const closes = c.map(x => x.close);
  const r = rsi(closes, 14);
  const piv = findPivots(c, 4, 4);
  const z = zigzag(piv);
  const trades = [];
  for (let k = 3; k < z.length; k++) {
    if (z[k].t !== 'H') continue;
    const H5 = z[k], L4 = z[k - 1], H3 = z[k - 2], L2 = z[k - 3];
    if (L4.t !== 'L' || H3.t !== 'H' || L2.t !== 'L') continue;
    if (!(L4.price > L2.price) || !(H5.price >= H3.price * 0.998)) continue;
    if (H3.i - L2.i < minLeg || L4.i - H3.i < minLeg || H5.i - L4.i < minLeg) continue;
    let P1 = null; for (const p of piv) if (p.t === 'H' && p.i < L2.i) P1 = p;
    if (!P1 || L2.i - P1.i < minLeg || !(H3.price > P1.price) || !(L4.price > P1.price)) continue;
    const w1 = P1.price - L2.price, w3 = H3.price - L2.price; if (w1 > 0 && w3 / w1 > 12) continue;
    const r3 = rsiAt(r, H3.i), r5 = rsiAt(r, H5.i);
    if (r3 == null || r5 == null || !(r5 < r3 - 0.5)) continue;
    const range34 = H3.price - L4.price; if (range34 <= 0) continue;
    const divExt = ((H5.price - L4.price) / range34) * 100; if (divExt < 100) continue;
    const grade = divExt >= 161.8 ? 'แรง' : divExt >= 138.2 ? 'ปานกลาง' : 'อ่อน';
    // reclaim ระหว่าง H5 -> ChoCh = setup เสีย
    // ChoCh: close แรกที่ < L4 หลัง H5
    let choch = -1; for (let i = H5.i + 1; i < n; i++) { if (c[i].close > H5.price * 1.001) { choch = -2; break; } if (c[i].close < L4.price) { choch = i; break; } }
    if (choch < 0) continue;
    // M1 = pivot low แรก >= choch
    let m1Idx = -1, m1Low = null; for (const p of piv) if (p.t === 'L' && p.i >= choch) { m1Idx = p.i; m1Low = p.price; break; }
    if (m1Idx < 0) continue;
    const m1Size = H5.price - m1Low; if (m1Size <= 0) continue;
    // M2 = pivot high แรกหลัง M1 ; ถ้าไม่มี ใช้ L4 anchor
    let m2High = null, m2Idx = -1; for (const p of piv) if (p.t === 'H' && p.i > m1Idx) { m2Idx = p.i; m2High = p.price; break; }
    const retracePct = m2High != null ? ((m2High - m1Low) / m1Size) * 100 : null;
    if (retracePct != null && retracePct > 100) continue;
    const anchor = m2High != null ? m2High : L4.price;
    if (anchor > 0 && anchor - m1Size <= 0) continue; // over-extended (เฉพาะราคาจริง/ฝั่ง SHORT — mirror อย่า clamp)
    const exp = m3Expectation(divExt, retracePct);
    const tp1 = anchor - 1.0 * m1Size;
    const entryLo = m1Low + 0.382 * m1Size, entryHi = m1Low + 0.786 * m1Size;
    // ENTRY: บาร์แรกหลัง M1 ที่ close อยู่ในโซน (ไม่ reclaim ก่อน)
    let ei = -1;
    for (let i = m1Idx + 1; i < n; i++) {
      if (c[i].close > H5.price * 1.001) { ei = -2; break; }   // reclaim ก่อนเข้า = ยกเลิก
      if (c[i].close >= entryLo && c[i].close <= entryHi) { ei = i; break; }
      if (c[i].close < tp1) { ei = -2; break; }                // วิ่งถึงเป้าก่อนเข้า = พลาด
    }
    if (ei < 0) continue;
    const entry = c[ei].close, sl = H5.price;
    const risk = sl - entry, reward = entry - tp1; if (risk <= 0 || reward <= 0) continue;
    const RR = reward / risk;
    // forward จาก ei+1
    let res = 0;
    for (let i = ei + 1; i < Math.min(n, ei + 150); i++) {
      if (c[i].high >= sl) { res = -1; break; }
      if (c[i].low <= tp1) { res = 1; break; }
    }
    if (res === 0) continue;
    trades.push({ res, RR, grade, divExt: Math.round(divExt) });
  }
  return trades;
}
function mirror(c) { return c.map(x => ({ time: x.time, open: -x.open, high: -x.low, low: -x.high, close: -x.close })); }

function stats(trades) {
  const tot = trades.length; if (!tot) return null;
  let w = 0, sR = 0, gp = 0, gl = 0, eq = 0, peak = 0, dd = 0;
  for (const t of trades) {
    if (t.res > 0) { w++; sR += t.RR; gp += t.RR; eq += t.RR; }
    else { sR -= 1; gl += 1; eq -= 1; }
    peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak);
  }
  return { tot, win: w, winRate: w / tot, exp: sR / tot, totR: sR, pf: gl ? gp / gl : Infinity, maxDD: dd };
}

(async () => {
  const syms = await topSymbols(TOPN);
  let all = [];
  process.stdout.write(`ดึง history ${TF} ~${BARS} แท่ง x ${syms.length} เหรียญ...\n`);
  for (const s of syms) {
    const c = await history(s, TF, BARS);
    if (c.length < 200) continue;
    all = all.concat(backtestSide(c).map(t => ({ ...t, side: 'SHORT' })), backtestSide(mirror(c)).map(t => ({ ...t, side: 'LONG' })));
  }
  console.log(`\n=== REV BACKTEST: ${TF}, top ${syms.length}, ~${BARS} แท่ง/เหรียญ ===`);
  const overall = stats(all);
  if (!overall) { console.log('ไม่มี trade'); return; }
  const f = (x) => x.toFixed(2);
  const line = (name, s) => console.log(name.padEnd(16) + `| ไม้ ${('' + s.tot).padStart(4)} | win ${(s.winRate * 100).toFixed(0).padStart(3)}% | exp ${f(s.exp).padStart(6)}R | PF ${f(s.pf).padStart(5)} | maxDD ${f(s.maxDD).padStart(7)}R | รวม ${f(s.totR).padStart(7)}R`);
  line('ทั้งหมด', overall);
  for (const g of ['แรง', 'ปานกลาง', 'อ่อน']) { const s = stats(all.filter(t => t.grade === g)); if (s) line('  เกรด ' + g, s); }
  for (const sd of ['LONG', 'SHORT']) { const s = stats(all.filter(t => t.side === sd)); if (s) line('  ' + sd, s); }
  console.log('\nหมายเหตุ: entry=close ในโซน Fib 38.2-78.6%, SL=จุด(5), TP=tp1(100% of M1). breakeven winRate ≈ 1/(1+avgRR)');
})();
