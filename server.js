// SRISIAM Waves Scanner — Binance API + TradingView chart links
// run: node server.js  →  http://localhost:3100
const http = require('http');
const fs = require('fs');
const path = require('path');
const { analyze, rsi } = require('./srisiam');

const PORT = 3100;
const BINANCE = 'https://api.binance.com';
const EXCLUDE = /^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|USDP|AEUR|USD1|XUSD|RLUSD|USDE|PYUSD|GUSD|USTC)USDT$/;

// ---------- cache ----------
const cache = new Map();
function getCache(key, ttlMs) {
  const e = cache.get(key);
  if (e && Date.now() - e.t < ttlMs) return e.v;
  return null;
}
function setCache(key, v) { cache.set(key, { t: Date.now(), v }); }

// ---------- binance ----------
async function topSymbols(limit = 50) {
  const hit = getCache('symbols:' + limit, 10 * 60 * 1000);
  if (hit) return hit;
  const res = await fetch(BINANCE + '/api/v3/ticker/24hr');
  if (!res.ok) throw new Error('binance ticker ' + res.status);
  const all = await res.json();
  const list = all
    .filter(t => t.symbol.endsWith('USDT') && !EXCLUDE.test(t.symbol) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, limit)
    .map(t => ({ symbol: t.symbol, price: Number(t.lastPrice), change: Number(t.priceChangePercent) }));
  setCache('symbols:' + limit, list);
  return list;
}

async function klines(symbol, interval, limit = 400) {
  const key = `k:${symbol}:${interval}`;
  const hit = getCache(key, 60 * 1000);
  if (hit) return hit;
  const res = await fetch(`${BINANCE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error(`klines ${symbol} ${res.status}`);
  const raw = await res.json();
  const c = raw.map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
  setCache(key, c);
  return c;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]).catch(e => ({ error: String(e.message || e) }));
    }
  }));
  return out;
}

// ---------- scan ----------
const TV_INTERVAL = { '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1d': 'D' };

async function scan(tf = '4h', top = 50) {
  const key = `scan:${tf}:${top}`;
  const hit = getCache(key, 60 * 1000);
  if (hit) return hit;
  const syms = await topSymbols(top);
  const results = await mapLimit(syms, 8, async (s) => {
    const c = await klines(s.symbol, tf);
    const r = analyze(c);
    if (!r) return null;
    return {
      symbol: s.symbol, change24h: s.change,
      tv: `https://www.tradingview.com/chart/?symbol=BINANCE:${s.symbol}&interval=${TV_INTERVAL[tf] || '240'}`,
      ...r,
    };
  });
  const found = results.filter(r => r && !r.error);
  const order = { ENTRY: 0, CHOCH: 1, RUN: 2, BREAK: 3, DIV: 4, M3: 5 };
  found.sort((a, b) => (order[a.stage] ?? 9) - (order[b.stage] ?? 9) || b.divExt - a.divExt || a.barsSinceP5 - b.barsSinceP5);
  const payload = { time: Date.now(), tf, scanned: syms.length, found: found.length, results: found };
  setCache(key, payload);
  return payload;
}

// ---------- http ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
      return;
    }
    if (url.pathname === '/api/scan') {
      const tf = url.searchParams.get('tf') || '4h';
      const top = Math.min(Number(url.searchParams.get('top') || 50), 120);
      if (!TV_INTERVAL[tf]) { res.writeHead(400); res.end('bad tf'); return; }
      const data = await scan(tf, top);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === '/api/chart') {
      const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
      const tf = url.searchParams.get('tf') || '4h';
      if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol) || !TV_INTERVAL[tf]) { res.writeHead(400); res.end('bad params'); return; }
      const c = await klines(symbol, tf);
      const data = { symbol, tf, candles: c, rsi: rsi(c.map(x => x.close), 14), analysis: analyze(c) };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${PORT} ถูกใช้งานอยู่แล้ว — scanner น่าจะรันอยู่แล้ว`);
    console.error(`   เปิด http://localhost:${PORT} ได้เลย หรือปิดตัวเก่าก่อน: taskkill /F /IM node.exe\n`);
    process.exit(1);
  }
  throw e;
});
server.listen(PORT, () => console.log(`SRISIAM Waves Scanner → http://localhost:${PORT}`));
