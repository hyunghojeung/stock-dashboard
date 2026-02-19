import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 스윙 백테스트 페이지 v2 / Swing Backtest Page v2
// [v2 변경사항 / Changes]
// - 📋 매매 내역 탭 신규 (trades_summary 테이블 + 검색 + 정렬)
// - 🔬 종목 테스트 탭 신규 (단일 종목 백테스트 + 파라미터 슬라이더)
// - 기간 필터 (전체/1개월/3개월/6개월/1년)
// - 테이블 헤더 클릭 정렬 (오름차순/내림차순)
// - 📖 가이드 버튼 추가 (swing_guide.html 새 탭 열기)
//
// 파일 경로: src/pages/SwingBacktest.jsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const API_BASE = "https://web-production-139e9.up.railway.app";

async function api(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`API 오류: ${path}`, e);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 유틸 / Common Utilities
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseDate(str) {
  if (!str) return null;
  const s = str.replace(/-/g, "").slice(0, 8);
  if (s.length < 8) return null;
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}

function fmtDate(str) {
  if (!str) return "—";
  const s = str.replace(/-/g, "").slice(0, 8);
  if (s.length < 8) return str;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function getDateNMonthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 가이드 버튼 컴포넌트 / Guide Button Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function GuideButton() {
  return (
    <button onClick={() => window.open('/swing_guide.html', '_blank')}
      style={{
        padding: "4px 12px", borderRadius: 6,
        border: "1px solid rgba(79,195,247,0.3)",
        background: "rgba(79,195,247,0.1)",
        color: "#4fc3f7", fontSize: 11, fontWeight: 600,
        cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif",
        transition: "all 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(79,195,247,0.2)"; e.currentTarget.style.borderColor = "rgba(79,195,247,0.5)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(79,195,247,0.1)"; e.currentTarget.style.borderColor = "rgba(79,195,247,0.3)"; }}
    >📖 가이드</button>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 정렬 훅 / Sort Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useSort(defaultKey = "", defaultDir = "desc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);

  const toggle = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useCallback((data) => {
    if (!sortKey || !data) return data || [];
    return [...data].sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [sortKey, sortDir]);

  const indicator = (key) => {
    if (sortKey !== key) return " ↕";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  return { sortKey, sortDir, toggle, sorted, indicator };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UI 서브 컴포넌트 / Sub Components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MiniBar({ value, max, color = "#4fc3f7" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
    </div>
  );
}

function WinRateBadge({ rate }) {
  const r = typeof rate === "string" ? parseFloat(rate) : rate;
  const color = r >= 65 ? "#4cff8b" : r >= 50 ? "#ffd54f" : "#ff5252";
  return (
    <span style={{ color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14 }}>
      {typeof rate === "number" ? rate.toFixed(1) : rate}%
    </span>
  );
}

function SignalBadge({ strength }) {
  const map = {
    "강": { bg: "rgba(76,255,139,0.15)", color: "#4cff8b", border: "rgba(76,255,139,0.3)" },
    "중": { bg: "rgba(255,213,79,0.15)", color: "#ffd54f", border: "rgba(255,213,79,0.3)" },
    "약": { bg: "rgba(255,82,82,0.15)", color: "#ff5252", border: "rgba(255,82,82,0.3)" },
  };
  const s = map[strength] || map["약"];
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>{strength}</span>
  );
}

function ProgressRing({ pct, size = 120 }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#4fc3f7" strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="middle"
        fill="#e0e6f0" fontSize={22} fontWeight={700} fontFamily="'JetBrains Mono', monospace"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}>{pct}%</text>
    </svg>
  );
}

// ── 기간 필터 / Period Filter ──
function PeriodFilter({ value, onChange }) {
  const options = [
    { key: "all", label: "전체" },
    { key: "1m", label: "1개월" },
    { key: "3m", label: "3개월" },
    { key: "6m", label: "6개월" },
    { key: "1y", label: "1년" },
  ];
  return (
    <div style={{ display: "flex", gap: 2, background: "rgba(8,15,30,0.6)", borderRadius: 6, padding: 3 }}>
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
          padding: "4px 12px", borderRadius: 4, border: "none",
          background: value === o.key ? "rgba(79,195,247,0.2)" : "transparent",
          color: value === o.key ? "#4fc3f7" : "#556677",
          fontSize: 11, fontWeight: value === o.key ? 600 : 400,
          cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
          transition: "all 0.2s",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// ── 정렬 가능 TH / Sortable Table Header ──
function SortTH({ children, sortKey, currentKey, indicator, onClick, style = {} }) {
  const active = currentKey === sortKey;
  return (
    <th onClick={() => onClick(sortKey)} style={{
      textAlign: "left", padding: "8px 10px", color: active ? "#4fc3f7" : "#556677",
      borderBottom: "1px solid rgba(100,140,200,0.1)", fontWeight: 600, fontSize: 11,
      cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", transition: "color 0.2s",
      ...style,
    }}>
      {children}<span style={{ fontSize: 9, opacity: 0.6 }}>{indicator(sortKey)}</span>
    </th>
  );
}

// ── 파라미터 슬라이더 / Parameter Slider ──
function ParamSlider({ label, labelEn, value, min, max, step, unit, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#99aabb" }}>
          {label} <span style={{ fontSize: 10, color: "#556677" }}>{labelEn}</span>
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#4fc3f7",
        }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: "#4fc3f7", height: 4 }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#445566" }}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ── 세대 진화 차트 (SVG) ──
function GenerationChart({ generations }) {
  if (!generations || generations.length === 0) return null;
  const W = 680, H = 200, P = 40;
  const scores = generations.map(g => g.best_metrics?.total_return ?? g.best_score ?? 0);
  const maxVal = Math.max(...scores.map(Math.abs), 1);
  const minVal = Math.min(...scores, 0);
  const range = maxVal - minVal || 1;
  const barW = Math.min(40, (W - P * 2) / scores.length - 4);
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <rect width={W} height={H} fill="rgba(8,15,30,0.6)" rx={8} />
      {minVal < 0 && (
        <line x1={P} y1={P + (maxVal / range) * (H - P * 2)}
          x2={W - 10} y2={P + (maxVal / range) * (H - P * 2)}
          stroke="rgba(255,255,255,0.1)" strokeDasharray="4,4" />
      )}
      {scores.map((s, i) => {
        const x = P + i * ((W - P * 2) / scores.length) + 2;
        const barH = (Math.abs(s) / range) * (H - P * 2);
        const y = s >= 0
          ? P + ((maxVal - s) / range) * (H - P * 2)
          : P + (maxVal / range) * (H - P * 2);
        const color = s >= 0 ? "#4cff8b" : "#ff5252";
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 2)} fill={color} opacity={0.7} rx={3} />
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fill="#556677" fontSize={9}
              fontFamily="'JetBrains Mono',monospace">{i + 1}세대</text>
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" fill={color} fontSize={9}
              fontFamily="'JetBrains Mono',monospace">{s > 0 ? "+" : ""}{s.toFixed(1)}%</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 패턴 통계 바 차트 ──
function PatternBarChart({ data, title, valueKey = "win_rate", labelKey = "range" }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ marginBottom: 16 }}>
      {title && <div style={{ fontSize: 12, color: "#8899aa", marginBottom: 8, fontWeight: 600 }}>{title}</div>}
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const label = d[labelKey] || d.category || "";
        const count = d.count || 0;
        const color = val >= 65 ? "#4cff8b" : val >= 50 ? "#ffd54f" : "#ff5252";
        const pct = (val / maxVal) * 100;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12 }}>
            <div style={{
              width: 100, color: "#99aabb", textAlign: "right",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11, flexShrink: 0,
            }}>{label}</div>
            <div style={{
              flex: 1, height: 20, background: "rgba(255,255,255,0.04)",
              borderRadius: 4, overflow: "hidden", position: "relative",
            }}>
              <div style={{
                width: `${pct}%`, height: "100%", background: color, opacity: 0.6,
                borderRadius: 4, transition: "width 0.8s ease",
              }} />
              <span style={{
                position: "absolute", right: 6, top: 2, fontSize: 11,
                color: "#e0e6f0", fontFamily: "'JetBrains Mono',monospace",
              }}>{val.toFixed(1)}% ({count}건)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 에퀴티 커브 (SVG) ──
function EquityCurve({ data }) {
  if (!data || data.length < 2) return null;
  const W = 680, H = 160, P = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2);
    const y = P + ((max - v) / range) * (H - P * 2);
    return `${x},${y}`;
  }).join(" ");
  const fillPoints = `${P},${H - P} ${points} ${P + (W - P * 2)},${H - P}`;
  const lastVal = data[data.length - 1];
  const color = lastVal >= 0 ? "#4cff8b" : "#ff5252";
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <rect width={W} height={H} fill="rgba(8,15,30,0.6)" rx={8} />
      {min < 0 && max > 0 && (
        <line x1={P} y1={P + (max / range) * (H - P * 2)}
          x2={W - 10} y2={P + (max / range) * (H - P * 2)}
          stroke="rgba(255,255,255,0.15)" strokeDasharray="4,4" />
      )}
      <polygon points={fillPoints} fill={color} opacity={0.08} />
      <polyline points={points} fill="none" stroke={color}
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <text x={W - P} y={P - 6} textAnchor="end" fill={color}
        fontSize={13} fontWeight={700} fontFamily="'JetBrains Mono',monospace">
        {lastVal > 0 ? "+" : ""}{lastVal.toFixed(1)}%
      </text>
    </svg>
  );
}

// ── 미니 캔들차트 (종목 테스트용) / Mini Candle Chart ──
function MiniCandleChart({ candles, tradePoints }) {
  if (!candles || candles.length === 0) return null;
  const W = 700, H = 300, P = 50, VOL_H = 40;
  const CHART_H = H - VOL_H - P - 20;
  const closes = candles.map(c => c.close);

  // ── 이동평균선 계산 / Moving Averages ──
  const calcMA = (data, period) => {
    return data.map((_, i) => {
      if (i < period - 1) return null;
      const slice = data.slice(i - period + 1, i + 1);
      return slice.reduce((a, b) => a + b, 0) / period;
    });
  };
  const ma5 = calcMA(closes, 5);
  const ma20 = calcMA(closes, 20);
  const ma60 = calcMA(closes, 60);

  const prices = candles.flatMap(c => [c.high, c.low]);
  const pMin = Math.min(...prices) * 0.998;
  const pMax = Math.max(...prices) * 1.002;
  const pRange = pMax - pMin || 1;
  const maxVol = Math.max(...candles.map(c => c.volume || 0), 1);
  const cw = (W - P - 10) / candles.length;
  const toY = (p) => 10 + (1 - (p - pMin) / pRange) * CHART_H;
  const volBaseY = CHART_H + 30;

  const tpMap = {};
  if (tradePoints) {
    tradePoints.forEach(tp => { if (tp.idx !== undefined) tpMap[tp.idx] = tp; });
  }

  let els = [];
  els.push(<rect key="bg" width={W} height={H} fill="rgba(8,15,30,0.8)" rx={8} />);

  for (let i = 0; i <= 4; i++) {
    const p = pMin + pRange * (i / 4);
    const y = toY(p);
    els.push(<line key={`gl${i}`} x1={P - 5} y1={y} x2={W - 5} y2={y} stroke="rgba(50,70,100,0.2)" strokeDasharray="3,3" />);
    els.push(<text key={`gt${i}`} x={4} y={y + 3} fill="#445566" fontSize={9} fontFamily="JetBrains Mono,monospace">{Math.round(p).toLocaleString()}</text>);
  }

  candles.forEach((c, i) => {
    const x = P + i * cw;
    const isUp = c.close >= c.open;
    const color = isUp ? "#ff4444" : "#4488ff";
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(bodyBot - bodyTop, 1);
    const mid = x + cw / 2;

    const vH = (c.volume / maxVol) * VOL_H;
    els.push(<rect key={`v${i}`} x={x + 1} y={volBaseY + VOL_H - vH} width={cw - 2} height={vH} fill={color} opacity={0.2} rx={1} />);
    els.push(<line key={`w${i}`} x1={mid} y1={toY(c.high)} x2={mid} y2={toY(c.low)} stroke={color} strokeWidth={1} />);
    els.push(<rect key={`b${i}`} x={x + 1} y={bodyTop} width={cw - 2} height={bodyH} fill={color} rx={1} />);

    if (i % 20 === 0 && c.date) {
      const ds = c.date.replace(/-/g, "");
      const lbl = ds.length >= 8 ? `${ds.slice(4, 6)}/${ds.slice(6, 8)}` : "";
      els.push(<text key={`dt${i}`} x={mid} y={H - 4} textAnchor="middle" fill="#445566" fontSize={8} fontFamily="JetBrains Mono,monospace">{lbl}</text>);
    }
  });

  const maLines = [
    { data: ma5, color: "#ffcc00", label: "MA5" },
    { data: ma20, color: "#ff6699", label: "MA20" },
    { data: ma60, color: "#66ccff", label: "MA60" },
  ];

  maLines.forEach(({ data: maData, color, label }) => {
    let path = "";
    maData.forEach((v, i) => {
      if (v === null) return;
      const x = P + i * cw + cw / 2;
      const y = toY(v);
      path += (path ? "L" : "M") + `${x},${y} `;
    });
    if (path) {
      els.push(
        <path key={`ma-${label}`} d={path} fill="none" stroke={color}
          strokeWidth={1.2} opacity={0.7} strokeLinecap="round" />
      );
    }
  });

  candles.forEach((c, i) => {
    const tp = tpMap[i];
    if (!tp) return;
    const x = P + i * cw;
    const mid = x + cw / 2;
    const isBuy = tp.type === "buy";
    const markerY = isBuy ? toY(c.low) + 14 : toY(c.high) - 14;
    const mc = isBuy ? "#4cff8b" : "#ff5252";
    const pts = isBuy
      ? `${mid},${markerY - 9} ${mid - 6},${markerY} ${mid + 6},${markerY}`
      : `${mid},${markerY + 9} ${mid - 6},${markerY} ${mid + 6},${markerY}`;

    els.push(<circle key={`mkbg${i}`} cx={mid} cy={markerY - (isBuy ? 4 : -4)} r={10} fill="rgba(8,15,30,0.7)" />);
    els.push(<polygon key={`mk${i}`} points={pts} fill={mc} opacity={0.95} />);
    els.push(
      <text key={`ml${i}`} x={mid} y={isBuy ? markerY + 14 : markerY - 10}
        textAnchor="middle" fill={mc} fontSize={9} fontWeight="600"
        fontFamily="Noto Sans KR,sans-serif">
        {isBuy ? "매수" : (tp.profit_pct != null ? `${tp.profit_pct > 0 ? "+" : ""}${tp.profit_pct.toFixed(1)}%` : "매도")}
      </text>
    );
  });

  const legendY = H - 16;
  els.push(<circle key="lg5" cx={P} cy={legendY} r={3} fill="#ffcc00" />);
  els.push(<text key="lt5" x={P + 6} y={legendY + 3} fill="#ffcc00" fontSize={8} fontFamily="JetBrains Mono,monospace">MA5</text>);
  els.push(<circle key="lg20" cx={P + 45} cy={legendY} r={3} fill="#ff6699" />);
  els.push(<text key="lt20" x={P + 51} y={legendY + 3} fill="#ff6699" fontSize={8} fontFamily="JetBrains Mono,monospace">MA20</text>);
  els.push(<circle key="lg60" cx={P + 98} cy={legendY} r={3} fill="#66ccff" />);
  els.push(<text key="lt60" x={P + 104} y={legendY + 3} fill="#66ccff" fontSize={8} fontFamily="JetBrains Mono,monospace">MA60</text>);

  els.push(<polygon key="lgb" points={`${P + 155},${legendY + 3} ${P + 150},${legendY - 3} ${P + 160},${legendY - 3}`} fill="#4cff8b" />);
  els.push(<text key="ltb" x={P + 163} y={legendY + 3} fill="#4cff8b" fontSize={8} fontFamily="JetBrains Mono,monospace">매수</text>);
  els.push(<polygon key="lgs" points={`${P + 198},${legendY - 3} ${P + 193},${legendY + 3} ${P + 203},${legendY + 3}`} fill="#ff5252" />);
  els.push(<text key="lts" x={P + 206} y={legendY + 3} fill="#ff5252" fontSize={8} fontFamily="JetBrains Mono,monospace">매도</text>);

  return <svg width={W} height={H} style={{ display: "block", maxWidth: "100%" }}>{els}</svg>;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 컴포넌트 / Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function SwingBacktest() {
  const [tab, setTab] = useState("overview");
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [capital, setCapital] = useState(1000000);
  const [capitalInput, setCapitalInput] = useState("1,000,000");
  const [period, setPeriod] = useState("all");
  const pollRef = useRef(null);

  const [testCode, setTestCode] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testParams, setTestParams] = useState({
    trailing_pct: 5.0, stop_loss_pct: -7.0, pullback_min: 3.0, pullback_max: 8.0,
  });
  const [testPeriod, setTestPeriod] = useState(250); // 테스트 기간 (일수)
  const [showCandidateList, setShowCandidateList] = useState(false); // 발굴 종목 팝업
  const [optimizing, setOptimizing] = useState(false);
  const [optProgress, setOptProgress] = useState({ current: 0, total: 0, bestReturn: null });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchSource, setSearchSource] = useState("all");
  const searchTimer = useRef(null);
  const dropdownRef = useRef(null);

  const tradeSort = useSort("entry_date", "desc");
  const stockSort = useSort("total_return", "desc");
  const candidateSort = useSort("score", "desc");

  const [tradeSearch, setTradeSearch] = useState("");

  const fmtWon = (v) => {
    const abs = Math.abs(v);
    if (abs >= 100000000) return (v / 100000000).toFixed(1) + "억";
    if (abs >= 10000) return (v / 10000).toFixed(1) + "만원";
    return Math.round(v).toLocaleString() + "원";
  };

  const wonEl = (v, opts = {}) => {
    const { fontSize = 14, sign = false } = opts;
    const signStr = sign ? (v > 0 ? "+" : (v < 0 ? "-" : "")) : (v < 0 ? "-" : "");
    const absVal = Math.abs(v);
    let intPart = "";
    let decPart = "";
    let unit = "";

    if (absVal >= 100000000) {
      const val = absVal / 100000000;
      const str = val.toFixed(1);
      const [i, d] = str.split(".");
      intPart = signStr + i;
      decPart = d && d !== "0" ? "." + d : "";
      unit = "억";
    } else if (absVal >= 10000) {
      const val = absVal / 10000;
      if (val >= 1000) {
        intPart = signStr + Math.round(val).toLocaleString();
        decPart = "";
      } else {
        const str = val.toFixed(1);
        const [i, d] = str.split(".");
        intPart = signStr + parseInt(i).toLocaleString();
        decPart = d && d !== "0" ? "." + d : "";
      }
      unit = "만원";
    } else {
      intPart = signStr + Math.round(absVal).toLocaleString();
      decPart = "";
      unit = "원";
    }

    return (
      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <span style={{ fontSize }}>{intPart}</span>
        {decPart && <span style={{ fontSize: Math.round(fontSize * 0.7), opacity: 0.7 }}>{decPart}</span>}
        <span style={{ fontSize: Math.round(fontSize * 0.75) }}>{unit}</span>
      </span>
    );
  };

  // ── 숫자 포맷 (소수점 이하 작게) / Number format (small decimals) ──
  // unit: "%" (기본), "" (없음), "일" 등
  const pctEl = (v, opts = {}) => {
    const { fontSize = 20, sign = false, color, decimal = 1, unit = "%" } = opts;
    const val = typeof v === "number" ? v : parseFloat(v) || 0;
    const str = val.toFixed(decimal);
    const [intPart, decPart] = str.split(".");
    const signStr = sign ? (val > 0 ? "+" : "") : "";
    const c = color || (val >= 0 ? "#4cff8b" : "#ff5252");
    const smallSize = Math.round(fontSize * 0.6);
    return (
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: c }}>
        <span style={{ fontSize }}>{signStr}{intPart}</span>
        {decPart && <span style={{ fontSize: smallSize, opacity: 0.7 }}>.{decPart}</span>}
        {unit && <span style={{ fontSize: smallSize, opacity: 0.7 }}>{unit}</span>}
      </span>
    );
  };

  const pctToWon = (pct, opts = {}) => wonEl(capital * pct / 100, opts);
  const pctToWonStr = (pct) => fmtWon(capital * pct / 100);
  const applyCapital = () => {
    const val = parseInt(capitalInput.replace(/,/g, ""));
    if (!isNaN(val) && val > 0) setCapital(val);
  };

  useEffect(() => {
    (async () => {
      try {
        const prog = await api("/api/swing/progress");
        if (prog && prog.status === "running") {
          setProgress(prog);
          setRunning(true);
          setLoading(false);
          return;
        }
      } catch (e) { /* ignore */ }

      const data = await api("/api/swing/result");
      if (data && !data.error) setResult(data);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!running) return;
    pollRef.current = setInterval(async () => {
      const prog = await api("/api/swing/progress");
      if (prog) {
        setProgress(prog);
        if (prog.status === "done") {
          setRunning(false);
          const data = await api("/api/swing/result");
          if (data && !data.error) setResult(data);
        }
        if (prog.status === "error") {
          setRunning(false);
        }
      }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [running]);

  const startAnalysis = async () => {
    setRunning(true);
    setProgress({ status: "running", pct: 0, step: "시작", message: "분석을 시작합니다..." });
    await api("/api/swing/run", { method: "POST" });
  };

  // ── 거래비용 (1회 매매당) / Trading cost per round trip ──
  // 증권사 수수료 ~0.03% (매수+매도) + 증권거래세 0.18% (매도) + 기타 = ~0.25%
  const TRADE_FEE_PCT = 0.25;

  const runSingleTest = async (overrideDays) => {
    if (!testCode.trim()) return;
    setTestLoading(true);
    setTestResult(null);
    setShowDropdown(false);
    const params = new URLSearchParams({
      trailing_pct: testParams.trailing_pct,
      stop_loss_pct: testParams.stop_loss_pct,
      pullback_min: testParams.pullback_min,
      pullback_max: testParams.pullback_max,
      days: overrideDays ?? testPeriod,
    });
    const data = await api(`/api/swing/test/${testCode.trim()}?${params}`);
    setTestResult(data);
    setTestLoading(false);
  };

  // ── 테스트 기간 변경 시 자동 재실행 / Auto re-run when period changes ──
  const prevPeriodRef = useRef(testPeriod);
  useEffect(() => {
    if (prevPeriodRef.current !== testPeriod && testCode.trim() && testResult) {
      prevPeriodRef.current = testPeriod;
      runSingleTest(testPeriod);
    } else {
      prevPeriodRef.current = testPeriod;
    }
  }, [testPeriod]);

  // ── 개별 종목 파라미터 최적화 / Single stock parameter optimization ──
  const optimizeSingle = async () => {
    if (!testCode.trim()) return;
    setOptimizing(true);
    setTestResult(null);

    // 파라미터 그리드 / Parameter grid
    const pullbacks = [[1,3],[1,5],[2,5],[2,8],[3,8],[3,10],[5,10],[5,12]];
    const trailings = [2, 3, 4, 5, 7, 10];
    const stopLosses = [-4, -6, -8, -10, -13];

    const grid = [];
    for (const [pmin, pmax] of pullbacks) {
      for (const trail of trailings) {
        for (const sl of stopLosses) {
          grid.push({ pullback_min: pmin, pullback_max: pmax, trailing_pct: trail, stop_loss_pct: sl });
        }
      }
    }

    setOptProgress({ current: 0, total: grid.length, bestReturn: null });

    let bestResult = null;
    let bestReturn = -Infinity;
    let bestParams = null;

    // 순차 실행 (3개씩 병렬) / Sequential with 3 concurrent
    const BATCH = 3;
    for (let i = 0; i < grid.length; i += BATCH) {
      const batch = grid.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(p => {
        const qs = new URLSearchParams({ ...p, days: testPeriod });
        return api(`/api/swing/test/${testCode.trim()}?${qs}`).then(data => ({ data, params: p }));
      }));

      for (const { data, params: p } of results) {
        if (!data || data.error) continue;
        const ret = data?.stats?.summary?.total_return || -999;
        // 세후 수익률 기준 / Net return basis
        const trades = data?.stats?.summary?.total_trades || 0;
        const netRet = ret - (TRADE_FEE_PCT * trades);
        if (netRet > bestReturn) {
          bestReturn = netRet;
          bestResult = data;
          bestParams = p;
        }
      }

      setOptProgress({ current: Math.min(i + BATCH, grid.length), total: grid.length, bestReturn: bestReturn > -Infinity ? bestReturn : null });
    }

    if (bestParams) {
      setTestParams(bestParams);
      setTestResult(bestResult);
    }

    setOptimizing(false);
  };

  const handleSearchInput = (val) => {
    setSearchQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (/^\d{6}$/.test(val.trim())) {
      setTestCode(val.trim());
      setShowDropdown(false);
      return;
    }

    if (val.trim().length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const delay = searchSource === "all" ? 400 : 200;
    searchTimer.current = setTimeout(async () => {
      const data = await api(`/api/swing/search?q=${encodeURIComponent(val.trim())}&source=${searchSource}`);
      if (data?.results) {
        setSearchResults(data.results);
        setShowDropdown(data.results.length > 0);
      }
    }, delay);
  };

  const selectStock = (stock) => {
    setTestCode(stock.code);
    setSearchQuery(`${stock.name} (${stock.code})`);
    setShowDropdown(false);
  };

  const filteredTrades = useMemo(() => {
    const trades = result?.trades_summary || [];
    if (period === "all") return trades;
    const monthMap = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };
    const cutoff = getDateNMonthsAgo(monthMap[period] || 120);
    return trades.filter(t => {
      const d = parseDate(t.entry_date);
      return d && d >= cutoff;
    });
  }, [result, period]);

  const filteredSummary = useMemo(() => {
    const trades = filteredTrades;
    if (!trades || trades.length === 0) return null;
    const total = trades.length;

    // 세전 기준으로 승/패 판정 (원래 profit_pct 사용)
    const wins = trades.filter(t => t.is_win);
    const lossTrades = trades.filter(t => !t.is_win);
    const winPcts = wins.map(t => t.profit_pct || 0);
    const lossPcts = lossTrades.map(t => t.profit_pct || 0);

    const maxPos = result?.final_stats?.summary?.max_positions || result?.pattern_stats?.summary?.max_positions || 5;

    // 세전 (gross) 계산
    let grossReturn = 0, grossPeak = 0, grossMdd = 0;
    // 세후 (net) 계산 — 매 거래마다 수수료 차감
    let netReturn = 0, netPeak = 0, netMdd = 0;
    // 총 수수료·세금
    let totalFees = 0;

    for (const t of trades) {
      const pct = t.profit_pct || 0;
      const feePct = TRADE_FEE_PCT;
      const netPct = pct - feePct;

      // Gross
      grossReturn += pct / maxPos;
      if (grossReturn > grossPeak) grossPeak = grossReturn;
      const gdd = grossReturn - grossPeak;
      if (gdd < grossMdd) grossMdd = gdd;

      // Net
      netReturn += netPct / maxPos;
      if (netReturn > netPeak) netPeak = netReturn;
      const ndd = netReturn - netPeak;
      if (ndd < netMdd) netMdd = ndd;

      totalFees += feePct / maxPos;
    }

    // 세후 기준 승/패 재판정
    const netWins = trades.filter(t => ((t.profit_pct || 0) - TRADE_FEE_PCT) > 0);

    return {
      total_trades: total,
      win_count: netWins.length,
      loss_count: total - netWins.length,
      win_rate: total > 0 ? (netWins.length / total * 100) : 0,
      avg_profit: total > 0 ? trades.reduce((a, t) => a + ((t.profit_pct || 0) - TRADE_FEE_PCT), 0) / total : 0,
      avg_win: netWins.length > 0 ? netWins.reduce((a, t) => a + ((t.profit_pct || 0) - TRADE_FEE_PCT), 0) / netWins.length : 0,
      avg_loss: (() => { const nl = trades.filter(t => ((t.profit_pct||0)-TRADE_FEE_PCT) <= 0); return nl.length > 0 ? nl.reduce((a,t) => a + ((t.profit_pct||0)-TRADE_FEE_PCT), 0) / nl.length : 0; })(),
      // 세후 수익률 (메인 표시용)
      total_return: Math.round(netReturn * 100) / 100,
      mdd: Math.round(netMdd * 100) / 100,
      // 세전 수익률 (참고용)
      gross_return: Math.round(grossReturn * 100) / 100,
      gross_mdd: Math.round(grossMdd * 100) / 100,
      // 총 수수료·세금 비율
      total_fees_pct: Math.round(totalFees * 100) / 100,
    };
  }, [filteredTrades, result]);

  const TABS = [
    { id: "overview", label: "📊 개요" },
    { id: "candidates", label: "🔍 발굴" },
    { id: "trades", label: "📋 매매 내역" },
    { id: "patterns", label: "📈 패턴" },
    { id: "calibration", label: "🧬 교정" },
    { id: "singletest", label: "🔬 종목 테스트" },
  ];

  const S = {
    page: { fontFamily: "'Noto Sans KR', -apple-system, sans-serif", color: "#e0e6f0", minHeight: "100vh", padding: 20 },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 },
    title: { fontSize: 20, fontWeight: 700, background: "linear-gradient(135deg, #4fc3f7, #81d4fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
    runBtn: {
      padding: "10px 28px", borderRadius: 8, border: "none",
      background: running ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #4fc3f7, #29b6f6)",
      color: running ? "#778899" : "#0a1628", fontWeight: 700, fontSize: 14,
      cursor: running ? "not-allowed" : "pointer", fontFamily: "'Noto Sans KR', sans-serif",
    },
    tabBar: { display: "flex", gap: 2, marginBottom: 20, background: "rgba(15,22,40,0.6)", borderRadius: 10, padding: 4, flexWrap: "wrap" },
    tabBtn: (active) => ({
      padding: "8px 14px", borderRadius: 8, border: "none",
      background: active ? "rgba(79,195,247,0.15)" : "transparent",
      color: active ? "#4fc3f7" : "#556677", fontWeight: active ? 600 : 400, fontSize: 12,
      cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif",
      borderBottom: active ? "2px solid #4fc3f7" : "2px solid transparent",
    }),
    card: {
      background: "linear-gradient(135deg, rgba(25,35,65,0.85), rgba(15,22,48,0.9))",
      border: "1px solid rgba(100,140,200,0.12)", borderRadius: 12, padding: 20, marginBottom: 16,
    },
    cardTitle: { fontSize: 14, fontWeight: 600, color: "#8899aa", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
    grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 },
    statBox: { background: "rgba(8,15,30,0.5)", borderRadius: 8, padding: 14, border: "1px solid rgba(100,140,200,0.08)" },
    statLabel: { fontSize: 11, color: "#556677", marginBottom: 4 },
    statValue: { fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
    td: { padding: "8px 10px", borderBottom: "1px solid rgba(100,140,200,0.06)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },
    th: { textAlign: "left", padding: "8px 10px", color: "#556677", borderBottom: "1px solid rgba(100,140,200,0.1)", fontWeight: 600, fontSize: 11 },
    mono: { fontFamily: "'JetBrains Mono', monospace" },
  };

  // ━━━ 분석 진행 중 ━━━
  if (running && progress) {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
          <ProgressRing pct={progress.pct} size={160} />
          <div style={{ marginTop: 24, fontSize: 18, fontWeight: 600 }}>{progress.step}</div>
          <div style={{ marginTop: 8, color: "#8899aa", fontSize: 13 }}>{progress.message}</div>
          {progress.error && <div style={{ marginTop: 16, color: "#ff5252", fontSize: 13 }}>오류: {progress.error}</div>}
          <div style={{ marginTop: 24, padding: "10px 20px", background: "rgba(79,195,247,0.08)", borderRadius: 8, border: "1px solid rgba(79,195,247,0.15)", fontSize: 12, color: "#81d4fa", display: "inline-block" }}>
            💡 다른 페이지로 이동해도 분석은 서버에서 계속 진행됩니다. 돌아오면 자동으로 상태를 확인합니다.
          </div>
        </div>
      </div>
    );
  }

  // ━━━ 로딩 ━━━
  if (loading) {
    return (
      <div style={S.page}><div style={{ ...S.card, textAlign: "center", padding: 60 }}><div style={{ color: "#8899aa" }}>데이터를 불러오는 중...</div></div></div>
    );
  }

  // ━━━ 결과 없음 (종목테스트만 가능) ━━━
  if (!result) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={S.title}>📊 스윙 자동발굴 & 백테스트</div>
            <GuideButton />
          </div>
        </div>
        <div style={S.tabBar}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={S.tabBtn(tab === t.id)}>{t.label}</button>
          ))}
        </div>
        {tab === "singletest" ? renderSingleTestTab() : (
          <div style={{ ...S.card, textAlign: "center", padding: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>🔬</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>아직 분석 결과가 없습니다</div>
            <div style={{ color: "#8899aa", fontSize: 13, marginBottom: 28, lineHeight: 1.8 }}>
              전종목을 스캔하여 스윙 투자 후보를 자동 발굴하고,<br />매매 타이밍 패턴을 통계적으로 분석합니다.
            </div>
            <button onClick={startAnalysis} style={S.runBtn}>🚀 분석 시작 (약 5~15분 소요)</button>
          </div>
        )}
      </div>
    );
  }

  // ━━━ 데이터 추출 ━━━
  const wp = result?.winner_profile || {};
  const candidates = result?.candidates || [];
  const ps = result?.final_stats || result?.pattern_stats || {};
  const cal = result?.calibration || {};
  const summaryRaw = ps?.summary || {};
  // summary: 항상 프론트에서 재계산한 total_return/mdd 사용, 나머지는 summaryRaw
  // Always use frontend-calculated total_return/mdd, rest from backend
  const summary = filteredSummary
    ? { ...summaryRaw, ...filteredSummary }
    : summaryRaw;

  const exitReasonMap = { trailing_stop: "트레일링", stop_loss: "손절", max_hold: "만기" };

  // ━━━ 종목 테스트 탭 렌더러 (분리) ━━━
  function renderSingleTestTab() {
    const candidates = result?.candidates || [];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>🔬 단일 종목 백테스트</div>

            {/* 발굴 종목 팝업 + 검색 / Candidate popup + Search */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                <button onClick={() => setShowCandidateList(v => !v)} style={{
                  flex: 1, padding: "7px 0", borderRadius: 6, border: showCandidateList ? "1px solid rgba(76,255,139,0.4)" : "1px solid rgba(76,255,139,0.2)",
                  background: showCandidateList ? "rgba(76,255,139,0.15)" : "rgba(76,255,139,0.06)",
                  color: "#4cff8b", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif",
                  transition: "all 0.2s",
                }}>🔍 발굴 종목 {candidates.length > 0 ? `(${candidates.length})` : ""} {showCandidateList ? "▲" : "▼"}</button>
                <button onClick={() => { setShowCandidateList(false); }} style={{
                  flex: 1, padding: "7px 0", borderRadius: 6,
                  border: "1px solid rgba(79,195,247,0.2)",
                  background: "rgba(79,195,247,0.06)",
                  color: "#4fc3f7", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif",
                }}>🌐 전체 시장 검색</button>
              </div>

              {/* 발굴 종목 팝업 리스트 / Candidate popup list */}
              {showCandidateList && candidates.length > 0 && (
                <>
                <div onClick={() => setShowCandidateList(false)} style={{
                  position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 199,
                }} />
                <div style={{
                  position: "absolute", top: 42, left: 0, right: 0, zIndex: 200,
                  background: "rgba(12,18,38,0.98)", border: "1px solid rgba(76,255,139,0.3)",
                  borderRadius: 10, maxHeight: 300, overflowY: "auto",
                  boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(8px)",
                }}>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(76,255,139,0.15)", fontSize: 11, color: "#4cff8b", fontWeight: 600, position: "sticky", top: 0, background: "rgba(12,18,38,0.98)" }}>
                    📋 발굴된 {candidates.length}개 종목 — 클릭하면 바로 테스트
                  </div>
                  {candidates.map((c, i) => (
                    <div key={c.code} onClick={() => {
                      setTestCode(c.code);
                      setSearchQuery(`${c.name} (${c.code})`);
                      setShowCandidateList(false);
                      // 자동 실행
                      setTimeout(() => {
                        setTestLoading(true);
                        setTestResult(null);
                        const p = new URLSearchParams({
                          trailing_pct: testParams.trailing_pct, stop_loss_pct: testParams.stop_loss_pct,
                          pullback_min: testParams.pullback_min, pullback_max: testParams.pullback_max, days: testPeriod,
                        });
                        api(`/api/swing/test/${c.code}?${p}`).then(data => { setTestResult(data); setTestLoading(false); });
                      }, 50);
                    }}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", cursor: "pointer",
                      background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent",
                      borderBottom: "1px solid rgba(100,140,200,0.06)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(76,255,139,0.08)"}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 ? "rgba(255,255,255,0.02)" : "transparent"}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#e0e6f0" }}>{c.name}</span>
                        <span style={{ fontSize: 10, color: "#556677", marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>{c.code}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                          color: c.score >= 70 ? "#4cff8b" : c.score >= 50 ? "#ffd54f" : "#ff5252",
                        }}>{c.score}점</span>
                        <span style={{
                          padding: "1px 6px", borderRadius: 8, fontSize: 9, fontWeight: 600,
                          background: c.signal_strength === "강" ? "rgba(76,255,139,0.15)" : c.signal_strength === "중" ? "rgba(255,213,79,0.15)" : "rgba(255,82,82,0.15)",
                          color: c.signal_strength === "강" ? "#4cff8b" : c.signal_strength === "중" ? "#ffd54f" : "#ff5252",
                        }}>{c.signal_strength}</span>
                      </div>
                    </div>
                  ))}
                </div>
                </>
              )}
            </div>

            <div style={{ marginBottom: 16, position: "relative" }} ref={dropdownRef}>
              <div style={{ fontSize: 12, color: "#99aabb", marginBottom: 6 }}>
                종목명 또는 코드 검색
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input type="text" value={searchQuery}
                    onChange={e => handleSearchInput(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { setShowDropdown(false); runSingleTest(); }
                      if (e.key === "Escape") setShowDropdown(false);
                    }}
                    placeholder="예: 삼성전자, 005930"
                    style={{
                      width: "100%", background: "rgba(8,15,30,0.6)", border: "1px solid rgba(100,140,200,0.2)",
                      borderRadius: 6, padding: "8px 12px", color: "#e0e6f0", fontSize: 13,
                      fontFamily: "'Noto Sans KR', sans-serif", outline: "none",
                    }} />

                  {showDropdown && searchResults.length > 0 && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                      background: "rgba(15,22,48,0.98)", border: "1px solid rgba(79,195,247,0.25)",
                      borderRadius: 8, marginTop: 4, maxHeight: 240, overflowY: "auto",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                    }}>
                      {searchResults.map((s, i) => (
                        <div key={s.code} onClick={() => selectStock(s)} style={{
                          padding: "8px 12px", cursor: "pointer",
                          background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent",
                          borderBottom: "1px solid rgba(100,140,200,0.06)",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(79,195,247,0.1)"}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 ? "rgba(255,255,255,0.02)" : "transparent"}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                          <span style={{ fontSize: 11, color: "#556677", marginLeft: 8, fontFamily: "'JetBrains Mono', monospace" }}>{s.code}</span>
                          <span style={{ fontSize: 10, color: "#445566", marginLeft: 6 }}>{(s.market || "").toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={runSingleTest} disabled={testLoading || !testCode.trim()} style={{
                  padding: "8px 18px", borderRadius: 6, border: "none",
                  background: testLoading ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #4fc3f7, #29b6f6)",
                  color: testLoading ? "#556677" : "#0a1628", fontWeight: 700, fontSize: 13,
                  cursor: testLoading ? "wait" : "pointer",
                }}>{testLoading ? "⏳" : "실행"}</button>
              </div>
              {testCode && (
                <div style={{ fontSize: 11, color: "#4fc3f7", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  선택된 코드: {testCode}
                </div>
              )}
            </div>

            {/* 테스트 기간 선택 / Test Period */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#8899aa", fontWeight: 600, marginBottom: 8 }}>📅 테스트 기간</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, background: "rgba(8,15,30,0.5)", borderRadius: 6, padding: 3 }}>
                {[
                  { days: 5, label: "1주" },
                  { days: 10, label: "2주" },
                  { days: 15, label: "3주" },
                  { days: 20, label: "4주" },
                  { days: 22, label: "1달" },
                  { days: 44, label: "2달" },
                  { days: 60, label: "3달" },
                  { days: 120, label: "6개월" },
                  { days: 250, label: "1년" },
                  { days: 500, label: "2년" },
                  { days: 750, label: "3년" },
                ].map(o => (
                  <button key={o.days} onClick={() => setTestPeriod(o.days)} style={{
                    padding: "5px 8px", borderRadius: 4, border: "none",
                    background: testPeriod === o.days ? "rgba(79,195,247,0.2)" : "transparent",
                    color: testPeriod === o.days ? "#4fc3f7" : "#556677",
                    fontSize: 11, fontWeight: testPeriod === o.days ? 600 : 400,
                    cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                    transition: "all 0.2s", whiteSpace: "nowrap",
                  }}>{o.label}</button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(100,140,200,0.1)", paddingTop: 16 }}>
              <div style={{ fontSize: 12, color: "#8899aa", fontWeight: 600, marginBottom: 12 }}>⚙️ 파라미터 조절</div>
              <ParamSlider label="최소 눌림" labelEn="Min Pullback" value={testParams.pullback_min}
                min={1} max={10} step={0.5} unit="%" onChange={v => setTestParams(p => ({ ...p, pullback_min: v }))} />
              <ParamSlider label="최대 눌림" labelEn="Max Pullback" value={testParams.pullback_max}
                min={3} max={15} step={0.5} unit="%" onChange={v => setTestParams(p => ({ ...p, pullback_max: v }))} />
              <ParamSlider label="트레일링 스톱" labelEn="Trailing Stop" value={testParams.trailing_pct}
                min={2} max={15} step={0.5} unit="%" onChange={v => setTestParams(p => ({ ...p, trailing_pct: v }))} />
              <ParamSlider label="손절" labelEn="Stop Loss" value={testParams.stop_loss_pct}
                min={-15} max={-2} step={0.5} unit="%" onChange={v => setTestParams(p => ({ ...p, stop_loss_pct: v }))} />
            </div>

            {cal.best_params && (
              <button onClick={() => setTestParams({
                trailing_pct: cal.best_params.trailing_pct || 5,
                stop_loss_pct: cal.best_params.stop_loss_pct || -7,
                pullback_min: cal.best_params.pullback_min || 3,
                pullback_max: cal.best_params.pullback_max || 8,
              })} style={{
                width: "100%", padding: "8px", borderRadius: 6,
                border: "1px solid rgba(79,195,247,0.2)", background: "rgba(79,195,247,0.08)",
                color: "#4fc3f7", fontSize: 11, cursor: "pointer", marginTop: 8,
                fontFamily: "'Noto Sans KR', sans-serif",
              }}>🧬 자동교정 최적값 적용</button>
            )}

            {/* 개별 종목 최적화 버튼 / Single stock optimize button */}
            <button onClick={optimizeSingle} disabled={optimizing || !testCode.trim()} style={{
              width: "100%", padding: "10px", borderRadius: 8,
              border: "none",
              background: optimizing ? "rgba(255,213,79,0.1)" : "linear-gradient(135deg, #ffd54f, #ffb300)",
              color: optimizing ? "#ffd54f" : "#0a1628",
              fontSize: 12, fontWeight: 700, cursor: optimizing ? "wait" : "pointer", marginTop: 8,
              fontFamily: "'Noto Sans KR', sans-serif",
              transition: "all 0.3s",
              opacity: !testCode.trim() ? 0.4 : 1,
            }}>
              {optimizing
                ? `⏳ 최적화 중... ${optProgress.current}/${optProgress.total}${optProgress.bestReturn != null ? ` (현재 최고: ${optProgress.bestReturn > 0 ? "+" : ""}${optProgress.bestReturn.toFixed(1)}%)` : ""}`
                : "🎯 이 종목 최적 파라미터 자동 탐색"
              }
            </button>
            {optimizing && (
              <div style={{ marginTop: 6 }}>
                <div style={{
                  height: 4, borderRadius: 2, background: "rgba(255,213,79,0.1)", overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    background: "linear-gradient(90deg, #ffd54f, #ffb300)",
                    width: `${optProgress.total > 0 ? (optProgress.current / optProgress.total * 100) : 0}%`,
                    transition: "width 0.3s",
                  }} />
                </div>
                <div style={{ fontSize: 10, color: "#556677", marginTop: 4, textAlign: "center" }}>
                  240개 파라미터 조합 탐색 · 3개씩 병렬 실행
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          {testLoading && !optimizing && (
            <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
              <div style={{ color: "#8899aa", fontSize: 14 }}>⏳ 네이버 금융에서 데이터를 가져오고 있습니다...</div>
            </div>
          )}

          {optimizing && (
            <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🎯</div>
              <div style={{ color: "#ffd54f", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                최적 파라미터 탐색 중...
              </div>
              <div style={{ color: "#8899aa", fontSize: 13, marginBottom: 16 }}>
                {optProgress.current} / {optProgress.total} 조합 테스트 완료
              </div>
              <div style={{ width: 300, margin: "0 auto", height: 6, borderRadius: 3, background: "rgba(255,213,79,0.1)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  background: "linear-gradient(90deg, #ffd54f, #ffb300)",
                  width: `${optProgress.total > 0 ? (optProgress.current / optProgress.total * 100) : 0}%`,
                  transition: "width 0.3s",
                }} />
              </div>
              {optProgress.bestReturn != null && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: "#556677" }}>현재까지 최고 세후 수익률</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: optProgress.bestReturn >= 0 ? "#4cff8b" : "#ff5252", marginTop: 4 }}>
                    {optProgress.bestReturn > 0 ? "+" : ""}{optProgress.bestReturn.toFixed(1)}%
                  </div>
                </div>
              )}
              <div style={{ color: "#445566", fontSize: 11, marginTop: 12 }}>
                눌림 범위 8종 × 트레일링 6종 × 손절 5종 = 240조합
              </div>
            </div>
          )}

          {!testLoading && !optimizing && !testResult && (
            <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔬</div>
              <div style={{ color: "#8899aa", fontSize: 14 }}>좌측에서 종목코드를 입력하고 실행하세요.</div>
              <div style={{ color: "#556677", fontSize: 12, marginTop: 8 }}>발굴 종목 탭에서 "테스트" 버튼으로도 실행 가능합니다.</div>
            </div>
          )}

          {!testLoading && !optimizing && testResult?.error && (
            <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
              <div style={{ color: "#ff5252", fontSize: 14 }}>❌ {testResult.error}</div>
            </div>
          )}

          {!testLoading && !optimizing && testResult && !testResult.error && (() => {
            const ts = testResult.stats?.summary || {};
            // 세후 재계산 / Recalculate after fees
            const tradeCount = ts.total_trades || 0;
            const netReturn = (ts.total_return || 0) - (TRADE_FEE_PCT * tradeCount);
            const netWinCount = (() => {
              const sells = (testResult.trade_points || []).filter(p => p.type === "sell");
              return sells.filter(s => ((s.profit_pct || 0) - TRADE_FEE_PCT) > 0).length;
            })();
            const netWinRate = tradeCount > 0 ? (netWinCount / tradeCount * 100) : 0;
            return (
              <>
                <div style={{ ...S.card, padding: "14px 20px" }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{testResult.name || testResult.code}</span>
                  <span style={{ fontSize: 12, color: "#556677", marginLeft: 8 }}>{testResult.code}</span>
                  <span style={{ fontSize: 10, color: "#4fc3f7", marginLeft: 8, padding: "2px 6px", background: "rgba(79,195,247,0.1)", borderRadius: 4 }}>
                    네이버 {testResult.total_candles}일
                  </span>
                  <span style={{ fontSize: 10, color: "#ffd54f", marginLeft: 6, padding: "2px 6px", background: "rgba(255,213,79,0.1)", borderRadius: 4 }}>
                    📅 테스트: {({ 5:"1주", 10:"2주", 15:"3주", 20:"4주", 22:"1달", 44:"2달", 60:"3달", 120:"6개월", 250:"1년", 500:"2년", 750:"3년" })[testPeriod] || testPeriod + "일"}
                  </span>
                </div>

                <div style={S.card}>
                  <div style={S.cardTitle}>📈 일봉 차트 + 매매 포인트</div>
                  {(() => {
                    // 테스트 기간에 맞게 일봉 슬라이스 / Slice candles to match test period
                    const allCandles = testResult.candles || [];
                    const sliced = allCandles.length > testPeriod ? allCandles.slice(-testPeriod) : allCandles;
                    // 표시 범위 내 매매 포인트만 필터 / Filter trade points within visible range
                    const firstIdx = allCandles.length - sliced.length;
                    const pts = (testResult.trade_points || []).filter(p => p.idx >= firstIdx).map(p => ({ ...p, idx: p.idx - firstIdx }));
                    return <MiniCandleChart candles={sliced} tradePoints={pts} />;
                  })()}
                </div>

                <div style={S.grid4}>
                  <div style={S.statBox}>
                    <div style={S.statLabel}>순수익률</div>
                    <div>{pctEl(netReturn, { fontSize: 18, sign: true })}</div>
                    <div style={{ fontSize: 10, color: "#556677" }}>세전 {(ts.total_return || 0) > 0 ? "+" : ""}{(ts.total_return || 0).toFixed(1)}%</div>
                  </div>
                  <div style={S.statBox}>
                    <div style={S.statLabel}>승률</div>
                    <div>{pctEl(netWinRate, { fontSize: 18, color: "#ffd54f" })}</div>
                    <div style={{ fontSize: 10, color: "#556677" }}>{netWinCount}승 {tradeCount - netWinCount}패 / {tradeCount}건</div>
                  </div>
                  <div style={S.statBox}>
                    <div style={S.statLabel}>MDD</div>
                    <div>{pctEl(ts.mdd || 0, { fontSize: 18, color: "#ff5252" })}</div>
                  </div>
                  <div style={S.statBox}>
                    <div style={S.statLabel}>평균 보유일</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#4fc3f7" }}>
                      <span style={{ fontSize: 18 }}>{Math.floor(ts.avg_holding_days || 0)}</span>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>.{((ts.avg_holding_days || 0).toFixed(1)).split(".")[1]}일</span>
                    </div>
                  </div>
                </div>

                {testResult.trade_points && testResult.trade_points.length > 0 && (() => {
                  // 기간 내 매매만 필터 / Filter trades within test period
                  const allCandles = testResult.candles || [];
                  const firstIdx = allCandles.length > testPeriod ? allCandles.length - testPeriod : 0;
                  const visibleBuys = testResult.trade_points.filter(p => p.type === "buy" && p.idx >= firstIdx);
                  const visibleSells = testResult.trade_points.filter(p => p.type === "sell" && p.idx >= firstIdx);
                  if (visibleBuys.length === 0) return null;
                  return (
                  <div style={{ ...S.card, marginTop: 16 }}>
                    <div style={S.cardTitle}>📋 매매 포인트 ({visibleBuys.length}건)</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={S.table}><thead><tr>
                        <th style={S.th}>매수일</th><th style={S.th}>매수가</th>
                        <th style={S.th}>매도일</th><th style={S.th}>매도가</th>
                        <th style={S.th}>수익률</th><th style={S.th}>매도사유</th>
                      </tr></thead><tbody>
                        {visibleBuys.map((b, i) => {
                            const sl = visibleSells[i];
                            const pct = (sl?.profit_pct || 0) - TRADE_FEE_PCT; // 세후
                            return (
                              <tr key={i} style={{ background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                                <td style={S.td}>{fmtDate(b.date)}</td>
                                <td style={S.td}>{(b.price || 0).toLocaleString()}</td>
                                <td style={S.td}>{sl ? fmtDate(sl.date) : "—"}</td>
                                <td style={S.td}>{sl ? (sl.price || 0).toLocaleString() : "—"}</td>
                                <td style={S.td}>
                                  {pctEl(pct, { fontSize: 12, sign: true, decimal: 2 })}
                                </td>
                                <td style={S.td}>{sl ? (exitReasonMap[sl.reason] || sl.reason || "—") : "—"}</td>
                              </tr>
                            );
                        })}
                      </tbody></table>
                    </div>
                  </div>
                  );
                })()}
              </>
            );
          })()}
        </div>
      </div>
    );
  }


  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 메인 렌더 / Main Render
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div style={S.page}>
      {/* 헤더 / Header */}
      <div style={S.header}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={S.title}>📊 스윙 자동발굴 & 백테스트</div>
            <GuideButton />
          </div>
          <div style={{ fontSize: 11, color: "#556677", marginTop: 4 }}>
            분석일: {result?.timestamp?.slice(0, 10) || "-"} · {result?.stocks_analyzed || 0}개 종목
            {result?.data_source === "naver" && " · 네이버 금융"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <PeriodFilter value={period} onChange={setPeriod} />
          <button onClick={startAnalysis} style={S.runBtn} disabled={running}>
            {running ? "⏳ 분석 중..." : "🔄 재분석"}
          </button>
        </div>
      </div>

      {/* 탭 / Tabs */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={S.tabBtn(tab === t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ━━━━━━━━━━ 개요 탭 / Overview ━━━━━━━━━━ */}
      {tab === "overview" && (
        <>
          <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#8899aa", fontWeight: 600, whiteSpace: "nowrap" }}>💰 투자금</span>
            <div style={{ display: "flex", alignItems: "center", gap: 2, background: "rgba(8,15,30,0.6)", borderRadius: 8, border: "1px solid rgba(79,195,247,0.2)", padding: "4px 10px" }}>
              <input type="text" value={capitalInput}
                onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ""); setCapitalInput(raw ? parseInt(raw).toLocaleString() : ""); }}
                onKeyDown={e => e.key === "Enter" && applyCapital()}
                style={{ background: "transparent", border: "none", outline: "none", color: "#4fc3f7", fontSize: 16, fontWeight: 700, width: 130, fontFamily: "'JetBrains Mono', monospace", textAlign: "right" }} />
              <span style={{ color: "#556677", fontSize: 13 }}>원</span>
            </div>
            <button onClick={applyCapital} style={{ padding: "5px 16px", borderRadius: 6, border: "1px solid rgba(79,195,247,0.3)", background: "rgba(79,195,247,0.1)", color: "#4fc3f7", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>적용</button>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              {[1000000, 5000000, 10000000, 50000000].map(v => (
                <button key={v} onClick={() => { setCapital(v); setCapitalInput(v.toLocaleString()); }} style={{
                  padding: "3px 10px", borderRadius: 4, border: "none",
                  background: capital === v ? "rgba(79,195,247,0.2)" : "rgba(255,255,255,0.04)",
                  color: capital === v ? "#4fc3f7" : "#556677", fontSize: 11, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{v >= 10000000 ? (v / 10000000) + "천만" : (v / 10000).toLocaleString() + "만"}</button>
              ))}
            </div>
          </div>

          {period !== "all" && filteredSummary && (
            <div style={{ background: "rgba(79,195,247,0.08)", border: "1px solid rgba(79,195,247,0.2)", borderRadius: 8, padding: "8px 16px", marginBottom: 16, fontSize: 12, color: "#81d4fa" }}>
              📅 기간 필터: <strong>{({ "1m": "최근 1개월", "3m": "최근 3개월", "6m": "최근 6개월", "1y": "최근 1년" })[period]}</strong>
              {" "}— {filteredTrades.length}건 / 전체 {(result?.trades_summary || []).length}건
            </div>
          )}

          <div style={{ ...S.card, padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "#556677", marginBottom: 4 }}>순수익률 (수수료·세금 차감 / 동시 {summaryRaw.max_positions || 5}종목 분산)</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  {pctEl(summary.total_return || 0, { fontSize: 32, sign: true })}
                  <span style={{ fontWeight: 700, color: (summary.total_return || 0) >= 0 ? "#4cff8b" : "#ff5252", opacity: 0.85 }}>
                    ({pctToWon(summary.total_return || 0, { fontSize: 22, sign: true })})
                  </span>
                </div>
                {/* 세전 수익률 + 수수료 + 원금포함 / Gross, fees, total */}
                <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#556677" }}>
                    세전 {pctEl(summary.gross_return || 0, { fontSize: 11, sign: true, color: "#7a8ca8" })}
                  </span>
                  <span style={{ fontSize: 11, color: "#ff6b6b" }}>
                    수수료·세금 −{(summary.total_fees_pct || 0).toFixed(1)}% ({fmtWon(capital * (summary.total_fees_pct || 0) / 100)})
                  </span>
                  <span style={{ fontSize: 11, color: "#4fc3f7", fontWeight: 600 }}>
                    💰 평가금 {fmtWon(capital + capital * (summary.total_return || 0) / 100)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {summaryRaw.trading_period_days > 0 && <div><div style={{ fontSize: 11, color: "#556677" }}>매매 기간</div><div style={{ ...S.mono, fontSize: 16, fontWeight: 700 }}>{summaryRaw.trading_period_days}일</div></div>}
                <div><div style={{ fontSize: 11, color: "#556677" }}>매매 수</div><div style={{ ...S.mono, fontSize: 16, fontWeight: 700 }}>{summary.total_trades || 0}건{summary.skipped_trades > 0 && <span style={{ fontSize: 11, color: "#556677", marginLeft: 4 }}>(+{summary.skipped_trades} 패스)</span>}</div></div>
                {summaryRaw.trading_period_days > 0 && <div><div style={{ fontSize: 11, color: "#556677" }}>연환산</div><div>{pctEl((summary.total_return || 0) / (summaryRaw.trading_period_days / 365), { fontSize: 16, sign: true })}</div></div>}
              </div>
            </div>
          </div>

          <div style={S.grid4}>
            <div style={S.statBox}><div style={S.statLabel}>승률</div><div>{pctEl(summary.win_rate || 0, { fontSize: 20, color: "#ffd54f" })}</div><div style={{ fontSize: 11, color: "#556677", marginTop: 2 }}>{summary.win_count || 0}승 {summary.loss_count || 0}패</div></div>
            <div style={S.statBox}><div style={S.statLabel}>MDD</div><div>{pctEl(summary.mdd || 0, { fontSize: 20, color: "#ff5252" })}</div><div style={{ fontSize: 11, color: "#556677", marginTop: 2 }}>{pctToWon(summary.mdd || 0, { fontSize: 11 })}</div></div>
            <div style={S.statBox}><div style={S.statLabel}>샤프 비율</div><div>{pctEl(summaryRaw.sharpe_ratio || 0, { fontSize: 20, decimal: 2, unit: "", color: (summaryRaw.sharpe_ratio || 0) >= 1 ? "#4cff8b" : "#ffd54f" })}</div><div style={{ fontSize: 11, color: "#556677", marginTop: 2 }}>1.0↑ 양호</div></div>
            <div style={S.statBox}><div style={S.statLabel}>손익비</div><div>{pctEl(summaryRaw.profit_loss_ratio || 0, { fontSize: 20, decimal: 2, unit: "", color: (summaryRaw.profit_loss_ratio || 0) >= 2 ? "#4cff8b" : "#ffd54f" })}</div><div style={{ fontSize: 11, color: "#556677", marginTop: 2 }}>2.0↑ 양호</div></div>
          </div>

          <div style={{ ...S.grid2, marginTop: 16 }}>
            <div style={S.card}><div style={S.cardTitle}>📈 누적 수익 곡선</div><EquityCurve data={ps?.equity_curve || [0]} /></div>
            <div style={S.card}>
              <div style={S.cardTitle}>🏆 상승 종목 공통 조건 ({wp.total_winners || 0}개)</div>
              {(wp.top_conditions || []).slice(0, 8).map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 12 }}>
                  <span style={{ color: "#99aabb" }}>{c.condition}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, width: 180 }}>
                    <MiniBar value={c.match_pct} max={100} color={c.match_pct >= 60 ? "#4cff8b" : "#4fc3f7"} />
                    <span style={{ ...S.mono, fontSize: 11, width: 40, textAlign: "right" }}>{c.match_pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...S.grid2, marginTop: 0 }}>
            <div style={S.statBox}><div style={S.statLabel}>평균 수익</div><div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>{pctEl(summary.avg_win || 0, { fontSize: 16, sign: true, decimal: 2, color: "#4cff8b" })} <span style={{ fontSize: 11, color: "#4cff8b", opacity: 0.7 }}>({pctToWon(summary.avg_win || 0, { fontSize: 11, sign: true })})</span></div></div>
            <div style={S.statBox}><div style={S.statLabel}>평균 손실</div><div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>{pctEl(summary.avg_loss || 0, { fontSize: 16, decimal: 2, color: "#ff5252" })} <span style={{ fontSize: 11, color: "#ff5252", opacity: 0.7 }}>({pctToWon(summary.avg_loss || 0, { fontSize: 11 })})</span></div></div>
          </div>

          {(ps?.stock_stats || []).length > 0 && (
            <div style={{ ...S.card, marginTop: 16 }}>
              <div style={S.cardTitle}>📋 종목별 매매 성과 ({(ps.stock_stats).length}개)</div>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}><thead><tr>
                  <th style={S.th}>#</th>
                  <SortTH sortKey="name" currentKey={stockSort.sortKey} indicator={stockSort.indicator} onClick={stockSort.toggle}>종목명</SortTH>
                  <SortTH sortKey="total_return" currentKey={stockSort.sortKey} indicator={stockSort.indicator} onClick={stockSort.toggle}>수익률</SortTH>
                  <SortTH sortKey="win_rate" currentKey={stockSort.sortKey} indicator={stockSort.indicator} onClick={stockSort.toggle}>승률</SortTH>
                  <SortTH sortKey="total_trades" currentKey={stockSort.sortKey} indicator={stockSort.indicator} onClick={stockSort.toggle}>매매수</SortTH>
                  <SortTH sortKey="avg_profit" currentKey={stockSort.sortKey} indicator={stockSort.indicator} onClick={stockSort.toggle}>평균</SortTH>
                  <SortTH sortKey="max_profit" currentKey={stockSort.sortKey} indicator={stockSort.indicator} onClick={stockSort.toggle}>최대익</SortTH>
                  <SortTH sortKey="max_loss" currentKey={stockSort.sortKey} indicator={stockSort.indicator} onClick={stockSort.toggle}>최대손</SortTH>
                </tr></thead><tbody>
                  {stockSort.sorted(ps.stock_stats).map((s, i) => {
                    const netTotalReturn = (s.total_return || 0) - TRADE_FEE_PCT * (s.total_trades || 0);
                    const netAvgProfit = (s.avg_profit || 0) - TRADE_FEE_PCT;
                    return (
                    <tr key={i} style={{ background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                      <td style={{ ...S.td, color: "#556677" }}>{i + 1}</td>
                      <td style={{ ...S.td, fontFamily: "'Noto Sans KR',sans-serif", fontWeight: 600 }}>
                        <div>{(s.name && s.name !== s.code) ? s.name : s.code}</div>
                        <div style={{ fontSize: 10, color: "#556677" }}>{s.code}</div>
                      </td>
                      <td style={S.td}>
                        {pctEl(netTotalReturn, { fontSize: 12, sign: true, decimal: 2 })}
                        <div style={{ fontSize: 10, color: "#556677" }}>{pctToWon(netTotalReturn, { fontSize: 10 })}</div>
                      </td>
                      <td style={S.td}><WinRateBadge rate={s.win_rate || 0} /></td>
                      <td style={S.td}>{s.total_trades}<span style={{ fontSize: 10, color: "#556677" }}> ({s.win_count}승{s.loss_count}패)</span></td>
                      <td style={S.td}>{pctEl(netAvgProfit, { fontSize: 12, sign: true, decimal: 2 })}</td>
                      <td style={S.td}>{pctEl((s.max_profit || 0) - TRADE_FEE_PCT, { fontSize: 12, sign: true, decimal: 2, color: "#4cff8b" })}</td>
                      <td style={S.td}>{pctEl((s.max_loss || 0) - TRADE_FEE_PCT, { fontSize: 12, decimal: 2, color: "#ff5252" })}</td>
                    </tr>
                    );
                  })}
                </tbody></table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ━━━━━━━━━━ 발굴 종목 탭 ━━━━━━━━━━ */}
      {tab === "candidates" && (
        <div style={S.card}>
          <div style={S.cardTitle}>🔍 자동 발굴 후보 ({candidates.length}개)</div>
          {candidates.length === 0 ? (
            <div style={{ color: "#556677", textAlign: "center", padding: 40 }}>발굴된 종목이 없습니다.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}><thead><tr>
                <th style={S.th}>#</th>
                <SortTH sortKey="name" currentKey={candidateSort.sortKey} indicator={candidateSort.indicator} onClick={candidateSort.toggle}>종목명</SortTH>
                <SortTH sortKey="current_price" currentKey={candidateSort.sortKey} indicator={candidateSort.indicator} onClick={candidateSort.toggle}>현재가</SortTH>
                <SortTH sortKey="score" currentKey={candidateSort.sortKey} indicator={candidateSort.indicator} onClick={candidateSort.toggle}>점수</SortTH>
                <th style={S.th}>신호</th>
                <th style={S.th}>충족 조건</th>
                <th style={S.th}>테스트</th>
              </tr></thead><tbody>
                {candidateSort.sorted(candidates).map((c, i) => (
                  <tr key={i} style={{ background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                    <td style={{ ...S.td, color: "#556677" }}>{i + 1}</td>
                    <td style={{ ...S.td, fontFamily: "'Noto Sans KR',sans-serif", fontWeight: 600 }}>
                      <div>{c.name}</div><div style={{ fontSize: 10, color: "#556677" }}>{c.code}</div>
                    </td>
                    <td style={S.td}>{(c.current_price || 0).toLocaleString()}원</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <MiniBar value={c.score} max={100} color={c.score >= 70 ? "#4cff8b" : c.score >= 50 ? "#ffd54f" : "#4fc3f7"} />
                        <span style={{ fontWeight: 700 }}>{c.score}</span>
                      </div>
                    </td>
                    <td style={S.td}><SignalBadge strength={c.signal_strength} /></td>
                    <td style={{ ...S.td, fontSize: 11, fontFamily: "'Noto Sans KR',sans-serif", maxWidth: 280 }}>
                      {(c.matched_conditions || []).map((cond, j) => (
                        <span key={j} style={{ display: "inline-block", padding: "1px 6px", background: "rgba(79,195,247,0.1)", borderRadius: 4, marginRight: 4, marginBottom: 2, color: "#81d4fa", fontSize: 10 }}>{cond}</span>
                      ))}
                    </td>
                    <td style={S.td}>
                      <button onClick={() => { setTestCode(c.code); setSearchQuery(`${c.name} (${c.code})`); setTab("singletest"); }} style={{
                        padding: "3px 10px", borderRadius: 4, border: "1px solid rgba(79,195,247,0.3)",
                        background: "rgba(79,195,247,0.1)", color: "#4fc3f7", fontSize: 10, cursor: "pointer",
                      }}>🔬</button>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━ 매매 내역 탭 ━━━━━━━━━━ */}
      {tab === "trades" && (
        <>
          <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#8899aa" }}>📋 매매 내역</span>
            <input type="text" placeholder="종목명/코드 검색..." value={tradeSearch}
              onChange={e => setTradeSearch(e.target.value)}
              style={{ background: "rgba(8,15,30,0.6)", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 6, padding: "5px 12px", color: "#e0e6f0", fontSize: 12, outline: "none", width: 180 }} />
            <PeriodFilter value={period} onChange={setPeriod} />
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#556677", ...S.mono }}>
              {filteredTrades.filter(t => !tradeSearch || (t.stock_name || "").includes(tradeSearch) || (t.stock_code || "").includes(tradeSearch)).length}건
            </span>
          </div>

          {filteredSummary && (
            <div style={{ ...S.grid4, marginBottom: 16 }}>
              <div style={S.statBox}><div style={S.statLabel}>수익률</div><div>{pctEl(filteredSummary.total_return, { fontSize: 16, sign: true })}</div></div>
              <div style={S.statBox}><div style={S.statLabel}>승률</div><div>{pctEl(filteredSummary.win_rate, { fontSize: 16, color: "#ffd54f" })}</div></div>
              <div style={S.statBox}><div style={S.statLabel}>매매수</div><div style={{ ...S.mono, fontSize: 16, fontWeight: 700 }}>{filteredSummary.total_trades}건</div></div>
              <div style={S.statBox}><div style={S.statLabel}>MDD</div><div>{pctEl(filteredSummary.mdd, { fontSize: 16, color: "#ff5252" })}</div></div>
            </div>
          )}

          <div style={S.card}>
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}><thead><tr>
                <SortTH sortKey="entry_date" currentKey={tradeSort.sortKey} indicator={tradeSort.indicator} onClick={tradeSort.toggle}>진입일</SortTH>
                <SortTH sortKey="stock_name" currentKey={tradeSort.sortKey} indicator={tradeSort.indicator} onClick={tradeSort.toggle}>종목</SortTH>
                <SortTH sortKey="entry_price" currentKey={tradeSort.sortKey} indicator={tradeSort.indicator} onClick={tradeSort.toggle}>매수가</SortTH>
                <SortTH sortKey="exit_price" currentKey={tradeSort.sortKey} indicator={tradeSort.indicator} onClick={tradeSort.toggle}>매도가</SortTH>
                <SortTH sortKey="profit_pct" currentKey={tradeSort.sortKey} indicator={tradeSort.indicator} onClick={tradeSort.toggle}>수익률</SortTH>
                <th style={S.th}>수익금</th>
                <SortTH sortKey="holding_days" currentKey={tradeSort.sortKey} indicator={tradeSort.indicator} onClick={tradeSort.toggle}>보유일</SortTH>
                <SortTH sortKey="exit_reason" currentKey={tradeSort.sortKey} indicator={tradeSort.indicator} onClick={tradeSort.toggle}>매도사유</SortTH>
                <SortTH sortKey="exit_date" currentKey={tradeSort.sortKey} indicator={tradeSort.indicator} onClick={tradeSort.toggle}>청산일</SortTH>
              </tr></thead><tbody>
                {tradeSort.sorted(
                  filteredTrades.filter(t => !tradeSearch || (t.stock_name || "").includes(tradeSearch) || (t.stock_code || "").includes(tradeSearch))
                ).map((t, i) => {
                  const grossPct = t.profit_pct || 0;
                  const pct = grossPct - TRADE_FEE_PCT; // 세후
                  const color = pct >= 0 ? "#4cff8b" : "#ff5252";
                  return (
                    <tr key={i} style={{ background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                      <td style={S.td}>{fmtDate(t.entry_date)}</td>
                      <td style={{ ...S.td, fontFamily: "'Noto Sans KR',sans-serif" }}>
                        <span style={{ fontWeight: 600 }}>{t.stock_name || t.stock_code}</span>
                        {t.stock_name && t.stock_name !== t.stock_code && <span style={{ fontSize: 10, color: "#556677", marginLeft: 4 }}>{t.stock_code}</span>}
                      </td>
                      <td style={S.td}>{(t.entry_price || 0).toLocaleString()}</td>
                      <td style={S.td}>{(t.exit_price || 0).toLocaleString()}</td>
                      <td style={S.td}>{pctEl(pct, { fontSize: 12, sign: true, decimal: 2, color })}</td>
                      <td style={{ ...S.td, color, fontSize: 11 }}>{pctToWon(pct, { fontSize: 11, sign: true })}</td>
                      <td style={S.td}>{t.holding_days || 0}일</td>
                      <td style={S.td}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 10,
                          background: t.exit_reason === "stop_loss" ? "rgba(255,82,82,0.15)" : t.exit_reason === "trailing_stop" ? "rgba(76,255,139,0.1)" : "rgba(255,255,255,0.05)",
                          color: t.exit_reason === "stop_loss" ? "#ff5252" : t.exit_reason === "trailing_stop" ? "#4cff8b" : "#8899aa",
                        }}>{exitReasonMap[t.exit_reason] || t.exit_reason}</span>
                      </td>
                      <td style={S.td}>{fmtDate(t.exit_date)}</td>
                    </tr>
                  );
                })}
              </tbody></table>
              {filteredTrades.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "#556677" }}>해당 기간에 매매 내역이 없습니다.</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ━━━━━━━━━━ 패턴 통계 탭 ━━━━━━━━━━ */}
      {tab === "patterns" && (
        <>
          <div style={S.grid2}>
            <div style={S.card}><div style={S.cardTitle}>📉 눌림 깊이별</div><PatternBarChart data={ps?.pullback_stats} labelKey="range" /></div>
            <div style={S.card}><div style={S.cardTitle}>📊 거래량 변화별</div><PatternBarChart data={ps?.volume_stats} labelKey="range" /></div>
          </div>
          <div style={S.grid2}>
            <div style={S.card}><div style={S.cardTitle}>📈 RSI 구간별</div><PatternBarChart data={ps?.rsi_stats} labelKey="range" /></div>
            <div style={S.card}><div style={S.cardTitle}>🕯️ 봉 패턴별</div><PatternBarChart data={ps?.pattern_stats} labelKey="category" /></div>
          </div>
          <div style={S.grid2}>
            <div style={S.card}><div style={S.cardTitle}>📅 요일별</div><PatternBarChart data={ps?.weekday_stats} labelKey="category" /></div>
            <div style={S.card}><div style={S.cardTitle}>📊 MA 배열별</div><PatternBarChart data={ps?.ma_stats} labelKey="category" /></div>
          </div>
          <div style={S.grid2}>
            <div style={S.card}><div style={S.cardTitle}>🎯 볼린저밴드 위치별</div><PatternBarChart data={ps?.bb_stats} labelKey="range" /></div>
            <div style={S.card}><div style={S.cardTitle}>🚪 매도 사유별</div><PatternBarChart data={ps?.exit_stats} labelKey="category" /></div>
          </div>
        </>
      )}

      {/* ━━━━━━━━━━ 자동 교정 탭 ━━━━━━━━━━ */}
      {tab === "calibration" && (
        <>
          <div style={S.card}>
            <div style={S.cardTitle}>🧬 최적 파라미터</div>
            <div style={S.grid3}>
              {Object.entries(cal.best_params || {}).map(([key, val]) => {
                const labels = { pullback_min: "최소 눌림 %", pullback_max: "최대 눌림 %", trailing_pct: "트레일링 %", stop_loss_pct: "손절 %", max_hold_days: "최대 보유일" };
                return (
                  <div key={key} style={S.statBox}>
                    <div style={S.statLabel}>{labels[key] || key}</div>
                    <div>
                      {pctEl(typeof val === "number" ? val : parseFloat(val) || 0, {
                        fontSize: 22, unit: key.includes("pct") || key.includes("loss") ? "%" : key.includes("days") ? "일" : "", color: "#4fc3f7"
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {cal.best_metrics && (
            <div style={S.card}>
              <div style={S.cardTitle}>📊 최적 파라미터 성과</div>
              <div style={S.grid3}>
                <div style={S.statBox}><div style={S.statLabel}>총 수익률</div><div>{pctEl(cal.best_metrics.total_return || 0, { fontSize: 20, sign: true })}</div></div>
                <div style={S.statBox}><div style={S.statLabel}>승률</div><div>{pctEl(cal.best_metrics.win_rate || 0, { fontSize: 20, color: "#ffd54f" })}</div></div>
                <div style={S.statBox}><div style={S.statLabel}>MDD</div><div>{pctEl(cal.best_metrics.mdd || 0, { fontSize: 20, color: "#ff5252" })}</div></div>
              </div>
            </div>
          )}
          <div style={S.card}>
            <div style={S.cardTitle}>🧬 세대별 진화 ({(cal.generations || []).length}세대)</div>
            <GenerationChart generations={cal.generations} />
            {(cal.generations || []).length > 0 && (
              <div style={{ marginTop: 16, overflowX: "auto" }}>
                <table style={S.table}><thead><tr>
                  <th style={S.th}>세대</th><th style={S.th}>수익률</th><th style={S.th}>승률</th>
                  <th style={S.th}>MDD</th><th style={S.th}>매매수</th><th style={S.th}>점수</th>
                </tr></thead><tbody>
                  {(cal.generations || []).map((g, i) => {
                    const m = g.best_metrics || {};
                    return (
                      <tr key={i}>
                        <td style={S.td}>{g.generation}세대</td>
                        <td style={S.td}>{pctEl(m.total_return || 0, { fontSize: 12, sign: true })}</td>
                        <td style={S.td}><WinRateBadge rate={m.win_rate || 0} /></td>
                        <td style={S.td}>{pctEl(m.mdd || 0, { fontSize: 12, color: "#ff5252" })}</td>
                        <td style={S.td}>{m.total_trades || 0}회</td>
                        <td style={S.td}>{pctEl(g.best_score || 0, { fontSize: 12, color: "#4fc3f7", unit: "" })}</td>
                      </tr>
                    );
                  })}
                </tbody></table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ━━━━━━━━━━ 종목 테스트 탭 ━━━━━━━━━━ */}
      {tab === "singletest" && renderSingleTestTab()}
    </div>
  );
}
