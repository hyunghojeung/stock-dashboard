import { useState, useEffect, useCallback } from "react";

// ============================================================
// API Helper
// ============================================================
const API_BASE = "https://web-production-139e9.up.railway.app";

async function api(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    return await res.json();
  } catch {
    return null;
  }
}

// ============================================================
// Mock Data (데모용 - 실제 API 연동 전)
// ============================================================
const MOCK = {
  strategies: [
    { id: 1, name: "전략1 기본형", description: "눌림목 ATR×2.0, 손절-3%", atr_multiplier: 2.0, stop_loss_pct: -3.0, initial_capital: 1000000, is_live: false, is_active: true },
  ],
  holdings: [
    { id: 1, strategy_id: 1, stock_code: "005930", stock_name: "삼성전자", buy_price: 178600, sell_price: null, current_price: 181200, quantity: 10, unrealized_profit: 26000, unrealized_pct: 1.46 },
    { id: 2, strategy_id: 1, stock_code: "000660", stock_name: "SK하이닉스", buy_price: 174200, sell_price: null, current_price: 178600, quantity: 8, unrealized_profit: 35200, unrealized_pct: 2.53 },
    { id: 3, strategy_id: 1, stock_code: "035720", stock_name: "카카오", buy_price: 53100, sell_price: null, current_price: 52400, quantity: 20, unrealized_profit: -14000, unrealized_pct: -1.32 },
  ],
  watchlist: [
    { stock_code: "005930", stock_name: "삼성전자", score: 92, volume_score: 28, trend_score: 22, status: "눌림목감지" },
    { stock_code: "000660", stock_name: "SK하이닉스", score: 88, volume_score: 25, trend_score: 20, status: "감시중" },
    { stock_code: "035720", stock_name: "카카오", score: 85, volume_score: 22, trend_score: 18, status: "매수완료" },
    { stock_code: "373220", stock_name: "LG에너지솔루션", score: 82, volume_score: 20, trend_score: 18, status: "감시중" },
    { stock_code: "035420", stock_name: "네이버", score: 79, volume_score: 18, trend_score: 17, status: "감시중" },
    { stock_code: "068270", stock_name: "셀트리온", score: 76, volume_score: 16, trend_score: 16, status: "감시중" },
    { stock_code: "005380", stock_name: "현대차", score: 73, volume_score: 15, trend_score: 15, status: "감시중" },
  ],
  trades: [
    { id: 1, strategy_id: 1, stock_name: "삼성전자", trade_type: "sell", buy_price: 178600, sell_price: 181500, current_price: 181200, quantity: 5, net_profit: 8200, profit_pct: 1.46, trade_reason: "트레일링스톱", traded_at: "2026-02-18T14:15:00" },
    { id: 2, strategy_id: 1, stock_name: "카카오", trade_type: "buy", buy_price: 53100, sell_price: null, current_price: 52400, quantity: 20, net_profit: null, traded_at: "2026-02-18T13:42:00" },
    { id: 3, strategy_id: 1, stock_name: "네이버", trade_type: "sell", buy_price: 213400, sell_price: 216000, current_price: 215500, quantity: 3, net_profit: 5400, profit_pct: 1.22, trade_reason: "트레일링스톱", traded_at: "2026-02-18T11:30:00" },
    { id: 4, strategy_id: 1, stock_name: "SK하이닉스", trade_type: "buy", buy_price: 174200, sell_price: null, current_price: 178600, quantity: 8, net_profit: null, traded_at: "2026-02-18T10:55:00" },
    { id: 5, strategy_id: 1, stock_name: "셀트리온", trade_type: "sell", buy_price: 186200, sell_price: 184200, current_price: 185000, quantity: 5, net_profit: -3600, profit_pct: -1.07, trade_reason: "VWAP이탈", traded_at: "2026-02-18T10:22:00" },
  ],
  assetHistory: [
    { record_date: "2026-02-10", total_asset: 1000000 },
    { record_date: "2026-02-11", total_asset: 1015000 },
    { record_date: "2026-02-12", total_asset: 1032000 },
    { record_date: "2026-02-13", total_asset: 1028000 },
    { record_date: "2026-02-14", total_asset: 1055000 },
    { record_date: "2026-02-17", total_asset: 1120000 },
    { record_date: "2026-02-18", total_asset: 1245000 },
  ],
};

// ============================================================
// Format Helpers
// ============================================================
const fmt = (n) => n?.toLocaleString("ko-KR") ?? "—";
const fmtWon = (n) => n != null ? `${n >= 0 ? "+" : ""}${n.toLocaleString("ko-KR")}원` : "—";
const fmtPct = (n) => n != null ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "—";
const clr = (n) => n > 0 ? "#4cff8b" : n < 0 ? "#ff4c4c" : "#8899aa";

// ============================================================
// Components
// ============================================================

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const h = now.getHours();
  const m = now.getMinutes();
  const isOpen = h >= 9 && (h < 15 || (h === 15 && m <= 30));
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const status = isWeekend ? "휴장 (주말)" : isOpen ? "장 운영 중" : h < 9 ? "장 시작 전" : "장 마감";
  const statusColor = isOpen ? "#4cff8b" : "#ff9800";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ color: "#8899aa", fontSize: 14 }}>
        {now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
      </span>
      <span style={{ color: "#e0e6f0", fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>
        {now.toLocaleTimeString("ko-KR")}
      </span>
      <span style={{ background: isOpen ? "rgba(76,255,139,0.15)" : "rgba(255,152,0,0.15)", color: statusColor, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
        ● {status}
      </span>
    </div>
  );
}

function Card({ title, value, sub, color = "#e0e6f0", icon }) {
  return (
    <div style={{ background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 200, backdropFilter: "blur(10px)" }}>
      <div style={{ color: "#6688aa", fontSize: 12, marginBottom: 6 }}>{icon} {title}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ color: color === "#e0e6f0" ? "#6688aa" : color, fontSize: 12, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function MiniChart({ data, width = 500, height = 120, color = "#4cff8b" }) {
  if (!data.length) return null;
  const vals = data.map(d => d.total_asset);
  const min = Math.min(...vals) * 0.998;
  const max = Math.max(...vals) * 1.002;
  const range = max - min || 1;
  const points = vals.map((v, i) => `${(i / (vals.length - 1)) * width},${height - ((v - min) / range) * (height - 20) - 10}`).join(" ");
  const area = points + ` ${width},${height - 5} 0,${height - 5}`;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#chartGrad)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
      {vals.map((v, i) => (
        <circle key={i} cx={(i / (vals.length - 1)) * width} cy={height - ((v - min) / range) * (height - 20) - 10} r="3" fill={color} />
      ))}
    </svg>
  );
}

function CandleChart({ width = 560, height = 280 }) {
  const candles = [];
  let price = 180000;
  for (let i = 0; i < 35; i++) {
    const open = price + (Math.random() - 0.48) * 2000;
    const close = open + (Math.random() - 0.45) * 3000;
    const high = Math.max(open, close) + Math.random() * 1500;
    const low = Math.min(open, close) - Math.random() * 1500;
    candles.push({ open, close, high, low, volume: Math.random() * 500000 + 100000 });
    price = close;
  }
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const min = Math.min(...allPrices) - 500;
  const max = Math.max(...allPrices) + 500;
  const range = max - min;
  const cw = (width - 40) / candles.length;

  const toY = (p) => 20 + (1 - (p - min) / range) * (height - 60);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <rect x="0" y="0" width={width} height={height} fill="rgba(8,15,30,0.8)" rx="4" />
      {[0.25, 0.5, 0.75].map(p => (
        <g key={p}>
          <line x1="30" y1={toY(min + range * p)} x2={width - 10} y2={toY(min + range * p)} stroke="rgba(50,70,100,0.3)" strokeDasharray="3,3" />
          <text x="2" y={toY(min + range * p) + 4} fill="#445566" fontSize="9" fontFamily="monospace">{fmt(Math.round(min + range * p))}</text>
        </g>
      ))}
      {candles.map((c, i) => {
        const x = 35 + i * cw;
        const isUp = c.close >= c.open;
        const color = isUp ? "#ff4444" : "#4488ff";
        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyBot = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(bodyBot - bodyTop, 1);
        return (
          <g key={i}>
            <line x1={x + cw / 2} y1={toY(c.high)} x2={x + cw / 2} y2={toY(c.low)} stroke={color} strokeWidth="1" />
            <rect x={x + 1} y={bodyTop} width={cw - 2} height={bodyH} fill={color} rx="1" />
            <rect x={x + 1} y={height - 35} width={cw - 2} height={c.volume / 600000 * 25} fill={color} opacity="0.3" />
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================
// Pages
// ============================================================

function DashboardPage() {
  const sells = MOCK.trades.filter(t => t.trade_type === "sell");
  const todayProfit = sells.reduce((s, t) => s + (t.net_profit || 0), 0);
  const wins = sells.filter(t => (t.net_profit || 0) > 0).length;
  const losses = sells.filter(t => (t.net_profit || 0) <= 0).length;
  const totalUnrealized = MOCK.holdings.reduce((s, h) => s + (h.unrealized_profit || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Top Cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card icon="💰" title="총 자산" value="1,245,000원" sub="+24.5%" color="#4cff8b" />
        <Card icon="📈" title="오늘 순수익" value={fmtWon(todayProfit)} sub="수수료·세금 차감" color={clr(todayProfit)} />
        <Card icon="💼" title="보유 종목" value={`${MOCK.holdings.length} 종목`} sub={`미실현 ${fmtWon(totalUnrealized)}`} color="#64b5f6" />
        <Card icon="🔄" title="오늘 매매" value={`${sells.length}회 (${wins}승 ${losses}패)`} sub={`승률 ${sells.length ? Math.round(wins / sells.length * 100) : 0}%`} color="#ffd54f" />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Left: Chart */}
        <div style={{ flex: "1 1 550px", background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15 }}>📈 실시간 차트</span>
              <span style={{ color: "#6688aa", fontSize: 12, marginLeft: 12 }}>삼성전자 (005930)</span>
            </div>
            <div>
              <span style={{ color: "#ff4444", fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>181,200원</span>
              <span style={{ color: "#ff4444", fontSize: 12, marginLeft: 8 }}>▲2,600 (+1.46%)</span>
            </div>
          </div>
          <CandleChart />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {["1분", "3분", "5분", "15분", "일봉"].map((tf, i) => (
              <button key={tf} style={{ background: i === 2 ? "rgba(79,195,247,0.2)" : "transparent", color: i === 2 ? "#4fc3f7" : "#556677", border: "1px solid " + (i === 2 ? "rgba(79,195,247,0.3)" : "transparent"), borderRadius: 6, padding: "4px 12px", fontSize: 11, cursor: "pointer" }}>{tf}</button>
            ))}
          </div>
        </div>

        {/* Right: Watchlist + Holdings */}
        <div style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Watchlist */}
          <div style={{ background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 16 }}>
            <div style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>🔍 오늘의 감시 종목</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ color: "#556677" }}>
                <td style={{ padding: "6px 4px" }}>종목명</td><td>점수</td><td>상태</td>
              </tr></thead>
              <tbody>{MOCK.watchlist.slice(0, 5).map((s, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "rgba(10,18,40,0.5)" : "transparent" }}>
                  <td style={{ padding: "6px 4px", color: "#e0e6f0" }}>{s.stock_name}</td>
                  <td style={{ color: "#ffd54f", fontFamily: "monospace" }}>{s.score}</td>
                  <td><span style={{ color: s.status === "매수완료" ? "#4cff8b" : s.status === "눌림목감지" ? "#ffd54f" : "#6688aa", fontSize: 11 }}>{s.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {/* Holdings */}
          <div style={{ background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 16 }}>
            <div style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>💼 보유 종목</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ color: "#556677" }}>
                <td style={{ padding: "6px 4px" }}>종목</td><td>매수가</td><td>매도가</td><td>현재가</td><td>수익률</td><td>미실현</td>
              </tr></thead>
              <tbody>{MOCK.holdings.map((h, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "rgba(10,18,40,0.5)" : "transparent" }}>
                  <td style={{ padding: "6px 4px", color: "#e0e6f0" }}>{h.stock_name}</td>
                  <td style={{ color: "#6688aa", fontFamily: "monospace" }}>{fmt(h.buy_price)}</td>
                  <td style={{ color: "#556677", fontFamily: "monospace" }}>{h.sell_price ? fmt(h.sell_price) : "—"}</td>
                  <td style={{ color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(h.current_price)}</td>
                  <td style={{ color: clr(h.unrealized_pct), fontFamily: "monospace" }}>{fmtPct(h.unrealized_pct)}</td>
                  <td style={{ color: clr(h.unrealized_profit), fontFamily: "monospace" }}>{fmtWon(h.unrealized_profit)}</td>
                </tr>
              ))}</tbody>
            </table>
            <div style={{ borderTop: "1px solid rgba(100,140,200,0.15)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6688aa", fontSize: 12 }}>합계</span>
              <span style={{ color: clr(totalUnrealized), fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{fmtWon(totalUnrealized)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Trade Log */}
        <div style={{ flex: "1 1 550px", background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>📋 오늘 매매 로그</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ color: "#556677" }}>
              <td style={{ padding: "6px 4px" }}>시간</td><td>구분</td><td>종목</td><td>매수가</td><td>매도가</td><td>현재가</td><td>순수익</td>
            </tr></thead>
            <tbody>{MOCK.trades.map((t, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "rgba(10,18,40,0.5)" : "transparent" }}>
                <td style={{ padding: "6px 4px", color: "#6688aa", fontFamily: "monospace" }}>{t.traded_at.split("T")[1].slice(0, 5)}</td>
                <td style={{ color: t.trade_type === "buy" ? "#64b5f6" : clr(t.net_profit) }}>{t.trade_type === "buy" ? "매수" : "매도"}</td>
                <td style={{ color: "#e0e6f0" }}>{t.stock_name}</td>
                <td style={{ color: "#6688aa", fontFamily: "monospace" }}>{fmt(t.buy_price)}</td>
                <td style={{ color: t.sell_price ? "#e0e6f0" : "#334455", fontFamily: "monospace" }}>{t.sell_price ? fmt(t.sell_price) : "—"}</td>
                <td style={{ color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(t.current_price)}</td>
                <td style={{ color: t.net_profit != null ? clr(t.net_profit) : "#334455", fontFamily: "monospace" }}>{t.net_profit != null ? fmtWon(t.net_profit) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{ borderTop: "1px solid rgba(100,140,200,0.15)", marginTop: 8, paddingTop: 8, display: "flex", gap: 20 }}>
            <span style={{ color: "#6688aa", fontSize: 12 }}>매매 {sells.length}회 | {wins}승 {losses}패 | 승률 {sells.length ? Math.round(wins / sells.length * 100) : 0}%</span>
            <span style={{ color: clr(todayProfit), fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>실현 순수익: {fmtWon(todayProfit)}</span>
          </div>
        </div>

        {/* Growth Journey Mini */}
        <div style={{ flex: "1 1 400px", background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>🎯 100만원 → 10억 여정</div>
          <MiniChart data={MOCK.assetHistory} width={420} height={130} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, padding: "0 4px" }}>
            <span style={{ color: "#556677", fontSize: 10 }}>2/10</span>
            <span style={{ color: "#556677", fontSize: 10 }}>2/18</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
            {[["시작금액", "1,000,000원", "#e0e6f0"], ["현재자산", "1,245,000원", "#4cff8b"], ["남은금액", "998,755,000원", "#ffd54f"]].map(([l, v, c]) => (
              <div key={l} style={{ flex: 1 }}>
                <div style={{ color: "#556677", fontSize: 11 }}>{l}</div>
                <div style={{ color: c, fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#556677" }}>목표 진행률</span>
              <span style={{ color: "#64b5f6" }}>0.12%</span>
            </div>
            <div style={{ background: "rgba(10,18,40,0.8)", borderRadius: 6, height: 8, marginTop: 4, overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(90deg, #4fc3f7, #4cff8b)", width: "0.12%", minWidth: 4, height: "100%", borderRadius: 6 }} />
            </div>
          </div>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ color: "#556677" }}>경과: 8일</span>
            <span style={{ color: "#556677" }}>예상 남은 거래일: 약 920일</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 24 }}>
        <h2 style={{ color: "#e0e6f0", fontSize: 18, margin: "0 0 20px" }}>📖 매매 전략 정리</h2>

        {[
          { title: "1. 종목 선정 (점수제 100점)", items: ["거래량 (30점): 최근 거래량 추세 평가", "상승추세 (25점): 가격 변동률 기반", "테마/관심도 (20점): 거래대금 기반", "기술적 신호 (15점): RSI, MACD 등", "수급 (10점): 매수/매도 잔량 비율"], color: "#64b5f6" },
          { title: "2. 매수 타이밍 (눌림목 7가지 신호)", items: ["✅ 필수: ATR 범위 내 하락 + 봉차트 반등 패턴", "선택: 거래량 감소, MA 지지, RSI 반등, VWAP 지지, 호가창 매수우세", "7개 중 필수 2개 포함 4개 이상 → 매수"], color: "#4cff8b" },
          { title: "3. 봉차트 패턴", items: ["반등: 샛별형(+30), 상승장악형(+25), 망치형(+20), 상승잉태형(+15), 역망치형(+10)", "하락: 하락장악형(차단), 저녁별형(차단), 교수형(-20)"], color: "#ffd54f" },
          { title: "4. 익절 (트레일링 스톱)", items: ["스톱가 = 최고점 - (ATR × 배수)", "가격 상승 시 스톱가도 상승 (절대 하락 안 함)", "변동성 자동 적응 (ATR 기반)"], color: "#ff9800" },
          { title: "5. 손절 (3단계 안전장치)", items: ["1차: VWAP - (ATR × 0.5) 이탈", "2차: 5분봉 20MA 2봉 연속 이탈", "3차: 매수가 대비 절대 -3% (최후 안전장치)"], color: "#ff4444" },
          { title: "6. 매매 원칙", items: ["손실 종목 3일간 재매수 금지", "연속 3회 손절 → 해당 종목 당일 매매 중지", "수익 = 수수료 + 세금 차감 순수익", "수익금 전액 복리 재투자"], color: "#ce93d8" },
        ].map(({ title, items, color }) => (
          <div key={title} style={{ marginBottom: 20 }}>
            <h3 style={{ color, fontSize: 15, margin: "0 0 10px", borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>{title}</h3>
            {items.map((item, i) => (
              <div key={i} style={{ color: "#aabbcc", fontSize: 13, padding: "4px 0 4px 20px", lineHeight: 1.6 }}>{item}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparePage() {
  const s = MOCK.strategies[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 24, textAlign: "center" }}>
        <div style={{ color: "#ffd54f", fontSize: 16, marginBottom: 8 }}>📊 전략 비교</div>
        <div style={{ color: "#6688aa", fontSize: 13 }}>현재 전략1 기본형만 가동 중입니다</div>
        <div style={{ color: "#556677", fontSize: 12, marginTop: 4 }}>대화를 통해 전략을 수정하면 새 전략이 추가되어 비교할 수 있습니다</div>
        <div style={{ marginTop: 20, background: "rgba(10,18,40,0.5)", borderRadius: 8, padding: 16, display: "inline-block" }}>
          <div style={{ color: "#64b5f6", fontWeight: 600 }}>{s.name}</div>
          <div style={{ color: "#6688aa", fontSize: 12, marginTop: 4 }}>ATR×{s.atr_multiplier} | 손절 {s.stop_loss_pct}% | 신호 {s.min_optional_signals}개↑</div>
          <div style={{ marginTop: 8, color: s.is_live ? "#ff4444" : "#ffd54f", fontSize: 12 }}>
            {s.is_live ? "🔴 실전 매매 중" : "🟡 모의투자 중"}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPage() {
  const [dark, setDark] = useState(true);
  return (
    <div style={{ background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 24 }}>
      <h2 style={{ color: "#e0e6f0", fontSize: 18, margin: "0 0 20px" }}>⚙️ 설정</h2>
      {[
        ["다크 / 라이트 모드", <button style={{ background: dark ? "#1a3a6e" : "#ddd", color: dark ? "#64b5f6" : "#333", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer" }} onClick={() => setDark(!dark)}>{dark ? "🌙 다크" : "☀️ 라이트"}</button>],
        ["카카오톡 알림", <span style={{ color: "#4cff8b" }}>ON (미설정)</span>],
        ["KIS API 상태 (모의)", <span style={{ color: "#4cff8b" }}>● 연결됨</span>],
        ["KIS API 상태 (실전)", <span style={{ color: "#ff9800" }}>● 미설정</span>],
        ["서버 상태", <span style={{ color: "#4cff8b" }}>● Running</span>],
      ].map(([label, ctrl], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(100,140,200,0.1)" }}>
          <span style={{ color: "#aabbcc", fontSize: 14 }}>{label}</span>
          {ctrl}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Main App
// ============================================================
const MENU = [
  { id: "dashboard", icon: "📊", label: "대시보드" },
  { id: "compare", icon: "⚖️", label: "전략 비교" },
  { id: "portfolio", icon: "💼", label: "보유종목" },
  { id: "history", icon: "📋", label: "매매이력" },
  { id: "watchlist", icon: "🔍", label: "감시종목" },
  { id: "performance", icon: "📈", label: "수익분석" },
  { id: "growth", icon: "🎯", label: "성장여정" },
  { id: "strategy", icon: "📖", label: "전략정리" },
  { id: "settings", icon: "⚙️", label: "설정" },
];

export default function App() {
  const [auth, setAuth] = useState(false);
  const [pw, setPw] = useState("");
  const [page, setPage] = useState("dashboard");
  const [sideOpen, setSideOpen] = useState(true);

  if (!auth) {
    return (
      <div style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(20,40,80,1) 0%, rgba(8,12,24,1) 70%)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <div style={{ background: "linear-gradient(135deg, rgba(25,35,65,0.95), rgba(12,18,38,0.98))", border: "1px solid rgba(100,140,200,0.2)", borderRadius: 16, padding: "48px 40px", textAlign: "center", width: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
          <h1 style={{ color: "#e0e6f0", fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>10억 만들기</h1>
          <p style={{ color: "#6688aa", fontSize: 13, margin: "0 0 28px" }}>주식 자동매매 시스템</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pw === "4332" && setAuth(true)}
            placeholder="비밀번호 입력"
            style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid rgba(100,140,200,0.2)", background: "rgba(10,18,40,0.8)", color: "#e0e6f0", fontSize: 15, outline: "none", boxSizing: "border-box", textAlign: "center", letterSpacing: 8 }}
          />
          <button
            onClick={() => pw === "4332" ? setAuth(true) : alert("비밀번호가 틀렸습니다")}
            style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #1a5276, #2471a3)", color: "#e0e6f0", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 12 }}
          >접속하기</button>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <DashboardPage />;
      case "compare": return <ComparePage />;
      case "strategy": return <StrategyPage />;
      case "settings": return <SettingsPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "radial-gradient(ellipse at 30% 20%, rgba(14,24,50,1) 0%, rgba(8,12,24,1) 70%)", fontFamily: "'Noto Sans KR', sans-serif", color: "#e0e6f0" }}>
      {/* Sidebar */}
      <div style={{ width: sideOpen ? 200 : 56, transition: "width 0.2s", background: "rgba(8,14,30,0.95)", borderRight: "1px solid rgba(100,140,200,0.1)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: sideOpen ? "16px 16px 12px" : "16px 8px 12px", cursor: "pointer" }} onClick={() => setSideOpen(!sideOpen)}>
          {sideOpen ? <span style={{ color: "#ffd54f", fontWeight: 700, fontSize: 15 }}>💰 10억 만들기</span> : <span style={{ fontSize: 20 }}>💰</span>}
        </div>
        <div style={{ borderBottom: "1px solid rgba(100,140,200,0.1)", margin: "0 8px 8px" }} />
        {MENU.map((m) => (
          <div
            key={m.id}
            onClick={() => setPage(m.id)}
            style={{
              padding: sideOpen ? "10px 16px" : "10px 0",
              cursor: "pointer",
              background: page === m.id ? "rgba(26,58,110,0.6)" : "transparent",
              borderRadius: 6,
              margin: "1px 6px",
              color: page === m.id ? "#64b5f6" : "#6688aa",
              fontSize: 13,
              textAlign: sideOpen ? "left" : "center",
              transition: "background 0.15s",
            }}
          >
            {m.icon}{sideOpen ? ` ${m.label}` : ""}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ borderTop: "1px solid rgba(100,140,200,0.1)", margin: "0 8px", padding: sideOpen ? 16 : 8 }}>
          {sideOpen && <>
            <div style={{ color: "#556677", fontSize: 11 }}>총 자산</div>
            <div style={{ color: "#4cff8b", fontSize: 14, fontWeight: 600, fontFamily: "monospace" }}>1,245,000원</div>
            <div style={{ color: "#556677", fontSize: 11, marginTop: 8 }}>목표 진행률</div>
            <div style={{ background: "rgba(10,18,40,0.8)", borderRadius: 6, height: 6, marginTop: 4, overflow: "hidden" }}>
              <div style={{ background: "#64b5f6", width: "0.12%", minWidth: 3, height: "100%", borderRadius: 6 }} />
            </div>
            <div style={{ color: "#445566", fontSize: 10, marginTop: 3 }}>0.12% / 10억</div>
          </>}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div style={{ background: "rgba(8,14,30,0.9)", borderBottom: "1px solid rgba(100,140,200,0.1)", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15 }}>{MENU.find(m => m.id === page)?.icon} {MENU.find(m => m.id === page)?.label}</div>
          <Clock />
        </div>

        {/* Strategy Tabs */}
        <div style={{ background: "rgba(10,16,32,0.8)", borderBottom: "1px solid rgba(100,140,200,0.1)", padding: "0 20px", display: "flex", gap: 0, flexShrink: 0 }}>
          {["전체 비교", "전략1 기본형 🟡"].map((tab, i) => (
            <div key={i} style={{ padding: "10px 20px", fontSize: 12, color: i === 1 ? "#64b5f6" : "#6688aa", borderBottom: i === 1 ? "2px solid #64b5f6" : "2px solid transparent", cursor: "pointer" }}>{tab}</div>
          ))}
        </div>

        {/* Page Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
