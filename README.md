# 🌊 SRISIAM Waves Scanner

Crypto scanner ตามกลยุทธ์ **SRISIAM Waves** — 3 Swings + ท่ามาตรฐาน + 100 of A + ความแรง Divergence

สแกนเหรียญ Top volume จาก Binance (USDT pairs) ทั้งสองฝั่ง:
- 🔴 **SHORT** — จบขาขึ้น (Bearish Divergence)
- 🟢 **LONG** — จบขาลง (Bullish Divergence)

## วิธีใช้

```bash
node server.js
# เปิด http://localhost:3100
```

ไม่ต้องติดตั้ง dependency ใด ๆ (Node 18+ ใช้ built-in `http` + `fetch`)

## ขั้นตอนตามกลยุทธ์

| ขั้น | สิ่งที่ตรวจ |
|------|------------|
| ① จบเทรนด์ | โครงสร้าง wave (2)(3)(4)(5) → หลุด Trendline 2-4 + Choch **ปิดเต็มแท่ง** ใต้จุด (4) |
| ② Divergence | RSI Regular Div ระหว่าง (3)-(5) · ความแรง = Fib ext ของ sideway: ≥138.2% ปานกลาง / ≥161.8% แรง |
| ③ Entry ท่ามาตรฐาน | Choch → retrace เข้าโซน Flip (จุด 4) / Fib 38.2–78.6% ของ M1 |
| ④ TP 100 of A | เป้า M3 ตามตาราง 4 แบบ (Div แรง+รีเทสตื้น → 161.8–200% of M1 ฯลฯ) |

## Stage ของแต่ละเหรียญ

`DIV` เกิด Divergence → `BREAK` หลุดเทรนด์ไลน์ → `CHOCH ✓` คอนเฟิร์มกลับตัว → `⚡ ENTRY` ราคาอยู่ในโซนเข้า → `RUN` วิ่งหาเป้า → `🎯 M3` ถึงเป้า

## ฟีเจอร์

- 📈 กดดูกราฟในตัว — ตีเส้นให้อัตโนมัติ: จุด (2)–(5), M1/M2, Trendline 2-4, เส้น Divergence (ราคา+RSI), Choch/Flip, โซน Entry, เป้า M3
- เลือก TF ได้ 1h–1D (แนะนำ 4h+ ตามคู่มือ)
- ลิงก์เปิดกราฟ TradingView ต่อเหรียญ
- Filter ตาม stage / LONG / SHORT · auto-refresh 90s

## ไฟล์

- `srisiam.js` — engine ตรวจจับ pattern, divergence, stage, เป้า M3
- `server.js` — HTTP server + Binance API (cache 60s)
- `index.html` — dashboard + chart modal (LightweightCharts)
