/**
 * 가상투자 시뮬레이터 탭 / Virtual Investment Simulator Tab
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 파일경로: src/VirtualInvestTab.jsx
 *
 * PatternDetector.jsx의 4번째 탭으로 통합.
 * 매수추천 종목을 5가지 전략으로 동시 비교 백테스트 + 실시간 모의투자.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

const API_BASE = "https://web-production-139e9.up.railway.app";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 프리셋 정의 / Preset Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PRESETS = [
  { key: "aggressive", name: "🔥 공격형", tp: 10, sl: 5, days: 5, color: "#ff5252" },
  { key: "standard", name: "⚖️ 기본형", tp: 7, sl: 3, days: 10, color: "#4fc3f7" },
  { key: "conservative", name: "🛡️ 보수형", tp: 5, sl: 2, days: 15, color: "#4cff8b" },
  { key: "longterm", name: "🐢 장기형", tp: 15, sl: 5, days: 30, color: "#ffd54f" },
  { key: "custom", name: "🎛️ 커스텀", tp: 7, sl: 3, days: 10, color: "#ce93d8" },
  { key: "smart", name: "🧠 스마트형", tp: 0, sl: 5, days: 20, trailing: 3, grace: 2, color: "#ff9800" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 스타일 / Styles
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const S = {
  container: { padding: "0" },
  card: {
    background: "linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))",
    border: "1px solid rgba(100,140,200,0.15)",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "12px",
  },
  subTabBar: {
    display: "flex",
    gap: "6px",
    marginBottom: "14px",
  },
  subTab: (active) => ({
    padding: "8px 18px",
    borderRadius: "8px",
    border: active ? "1px solid rgba(79,195,247,0.4)" : "1px solid transparent",
    background: active ? "rgba(79,195,247,0.15)" : "transparent",
    color: active ? "#4fc3f7" : "#667788",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    transition: "all 0.2s",
  }),
  presetBtn: (active) => ({
    padding: "6px 14px",
    borderRadius: "8px",
    border: active ? "1px solid rgba(79,195,247,0.4)" : "1px solid rgba(100,140,200,0.2)",
    background: active ? "rgba(79,195,247,0.15)" : "transparent",
    color: active ? "#4fc3f7" : "#8899aa",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: active ? 600 : 400,
    transition: "all 0.2s",
  }),
  slider: {
    width: "100%",
    height: "4px",
    borderRadius: "4px",
    appearance: "none",
    background: "rgba(100,140,200,0.2)",
    outline: "none",
    cursor: "pointer",
    accentColor: "#4fc3f7",
  },
  runBtn: {
    padding: "12px 32px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #4fc3f7, #2196f3)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 4px 15px rgba(33,150,243,0.3)",
  },
  runBtnDisabled: {
    padding: "12px 32px",
    borderRadius: "10px",
    border: "none",
    background: "rgba(100,140,200,0.2)",
    color: "#556677",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "not-allowed",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "12px",
  },
  th: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(100,140,200,0.2)",
    color: "#8899aa",
    fontWeight: 600,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(100,140,200,0.08)",
    textAlign: "center",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
  },
  badge: (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "4px",
    background: `${color}22`,
    color: color,
    fontSize: "11px",
    fontWeight: 600,
  }),
  progressBar: {
    width: "100%",
    height: "6px",
    borderRadius: "3px",
    background: "rgba(100,140,200,0.15)",
    overflow: "hidden",
  },
  progressFill: (pct) => ({
    width: `${pct}%`,
    height: "100%",
    borderRadius: "3px",
    background: "linear-gradient(90deg, #4fc3f7, #2196f3)",
    transition: "width 0.3s",
  }),
  stockTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 10px",
    borderRadius: "6px",
    background: "rgba(79,195,247,0.1)",
    border: "1px solid rgba(79,195,247,0.2)",
    color: "#4fc3f7",
    fontSize: "12px",
    marginRight: "6px",
    marginBottom: "4px",
  },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  positive: { color: "#ff5252" },
  negative: { color: "#4488ff" },
  dimText: { color: "#556677", fontSize: "11px" },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 자산곡선 SVG 차트 / Equity Curve SVG Chart
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function EquityCurveChart({ strategies }) {
  if (!strategies || Object.keys(strategies).length === 0) return null;

  const W = 700, H = 220, PAD = { t: 20, r: 20, b: 30, l: 60 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  // 모든 전략의 일별 자산 데이터 수집
  const lines = [];
  let allVals = [];
  let maxDays = 0;

  Object.entries(strategies).forEach(([key, data]) => {
    const assets = data.daily_assets || [];
    if (assets.length === 0) return;
    const preset = PRESETS.find(p => p.key === key);
    const vals = assets.map(a => a.total_asset);
    allVals.push(...vals);
    if (assets.length > maxDays) maxDays = assets.length;
    lines.push({ key, color: preset?.color || "#888", vals, name: data.strategy_name });
  });

  if (allVals.length === 0) return null;

  const minVal = Math.min(...allVals) * 0.998;
  const maxVal = Math.max(...allVals) * 1.002;
  const valRange = maxVal - minVal || 1;

  const toX = (i, total) => PAD.l + (i / Math.max(total - 1, 1)) * chartW;
  const toY = (v) => PAD.t + (1 - (v - minVal) / valRange) * chartH;

  // 그리드 라인
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const v = minVal + (valRange * i) / 4;
    const y = toY(v);
    gridLines.push(
      <g key={`grid-${i}`}>
        <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(50,70,100,0.25)" strokeDasharray="3,3" />
        <text x={PAD.l - 6} y={y + 4} fill="#556677" fontSize="9" fontFamily="JetBrains Mono" textAnchor="end">
          {Math.round(v).toLocaleString()}
        </text>
      </g>
    );
  }

  // X축 라벨
  const xLabels = [];
  for (let i = 0; i < maxDays; i += Math.max(1, Math.floor(maxDays / 8))) {
    xLabels.push(
      <text key={`xl-${i}`} x={toX(i, maxDays)} y={H - 5} fill="#556677" fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle">
        D{i + 1}
      </text>
    );
  }

  // 라인 패스
  const linePaths = lines.map(({ key, color, vals, name }) => {
    const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i, vals.length)},${toY(v)}`).join(" ");
    return (
      <g key={key}>
        <path d={d} fill="none" stroke={color} strokeWidth="2" opacity="0.85" />
        {/* 마지막 점에 라벨 */}
        <circle cx={toX(vals.length - 1, vals.length)} cy={toY(vals[vals.length - 1])} r="3" fill={color} />
        <text
          x={toX(vals.length - 1, vals.length) + 6}
          y={toY(vals[vals.length - 1]) + 4}
          fill={color}
          fontSize="9"
          fontFamily="Noto Sans KR"
        >
          {name}
        </text>
      </g>
    );
  });

  // 기준선 (초기 자본금)
  const baseLine = lines[0]?.vals[0];

  return (
    <svg width={W} height={H} style={{ display: "block", margin: "0 auto" }}>
      <rect x="0" y="0" width={W} height={H} fill="rgba(8,15,30,0.6)" rx="8" />
      {gridLines}
      {xLabels}
      {baseLine && (
        <line
          x1={PAD.l} y1={toY(baseLine)} x2={W - PAD.r} y2={toY(baseLine)}
          stroke="#ffd54f" strokeWidth="1" strokeDasharray="5,3" opacity="0.4"
        />
      )}
      {linePaths}
    </svg>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 컴포넌트 / Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function VirtualInvestTab({ recommendations = [], backtestRecommendations = [], selectedRecStocks, setSelectedRecStocks, newRtSessionId, setNewRtSessionId }) {
  // 서브탭: backtest | realtime
  const [subTab, setSubTab] = useState("backtest");

  // 매매 파라미터 (5개 프리셋 각각 독립)
  const [presetParams, setPresetParams] = useState({
    aggressive:   { tp: 10, sl: 5, days: 5 },
    standard:     { tp: 7,  sl: 3, days: 10 },
    conservative: { tp: 5,  sl: 2, days: 15 },
    longterm:     { tp: 15, sl: 5, days: 30 },
    custom:       { tp: 7,  sl: 3, days: 10 },
  });

  // 실행 상태
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  // 결과
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 종목별 상세 열기
  const [expandedStrategy, setExpandedStrategy] = useState(null);
  const [tradeSortKey, setTradeSortKey] = useState(null);
  const [tradeSortDir, setTradeSortDir] = useState('desc');
  const handleTradeSort = (key) => {
    if (tradeSortKey === key) { setTradeSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }
    else { setTradeSortKey(key); setTradeSortDir('desc'); }
  };
  // 전략 비교표 정렬
  const [stratSortKey, setStratSortKey] = useState(null);
  const [stratSortDir, setStratSortDir] = useState('desc');
  const handleStratSort = (key) => {
    if (stratSortKey === key) { setStratSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }
    else { setStratSortKey(key); setStratSortDir('desc'); }
  };
  const sortRankings = (rankings) => {
    if (!rankings || !stratSortKey) return rankings;
    const sorted = [...rankings];
    const dir = stratSortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      if (stratSortKey === 'return_pct') return dir * ((a.total_return_pct||0) - (b.total_return_pct||0));
      if (stratSortKey === 'return_won') return dir * ((a.total_return_won||0) - (b.total_return_won||0));
      if (stratSortKey === 'win_rate') return dir * ((a.win_rate||0) - (b.win_rate||0));
      if (stratSortKey === 'win_loss') return dir * ((a.win_count||0) - (b.win_count||0));
      if (stratSortKey === 'mdd') return dir * ((a.mdd_pct||0) - (b.mdd_pct||0));
      if (stratSortKey === 'rr_ratio') return dir * (parseFloat(a.risk_reward_ratio||0) - parseFloat(b.risk_reward_ratio||0));
      return 0;
    });
    return sorted;
  };
  // 같은 종목 그룹핑: 1종목 1행, 수익률/수익금 합산, 마지막 거래 날짜/가격 표시
  const groupTrades = (trades) => {
    if (!trades) return [];
    const map = {};
    for (const t of trades) {
      const key = t.stock_code || t.stock_name;
      if (!map[key]) {
        map[key] = {
          stock_code: t.stock_code, stock_name: t.stock_name,
          trades: [], total_profit_pct: 0, total_profit_won: 0, total_hold_days: 0,
          trade_count: 0, last_trade: t,
        };
      }
      const g = map[key];
      g.trades.push(t);
      g.total_profit_pct += (t.profit_pct || 0);
      g.total_profit_won += (t.profit_won || 0);
      g.total_hold_days += (t.hold_days || 0);
      g.trade_count += 1;
      // 마지막 거래 (매수일 기준 최신)
      if ((t.buy_date || '') >= (g.last_trade.buy_date || '')) g.last_trade = t;
    }
    return Object.values(map);
  };
  const sortGrouped = (grouped) => {
    if (!grouped || !tradeSortKey) return grouped;
    const sorted = [...grouped];
    const dir = tradeSortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      if (tradeSortKey === 'name') return dir * (a.stock_name||'').localeCompare(b.stock_name||'');
      if (tradeSortKey === 'trade_count') return dir * (a.trade_count - b.trade_count);
      if (tradeSortKey === 'buy_date') return dir * (a.last_trade.buy_date||'').localeCompare(b.last_trade.buy_date||'');
      if (tradeSortKey === 'buy_price') return dir * ((a.last_trade.buy_price||0) - (b.last_trade.buy_price||0));
      if (tradeSortKey === 'sell_date') return dir * (a.last_trade.sell_date||'').localeCompare(b.last_trade.sell_date||'');
      if (tradeSortKey === 'sell_price') return dir * ((a.last_trade.sell_price||0) - (b.last_trade.sell_price||0));
      if (tradeSortKey === 'profit_pct') return dir * (a.total_profit_pct - b.total_profit_pct);
      if (tradeSortKey === 'profit_won') return dir * (a.total_profit_won - b.total_profit_won);
      if (tradeSortKey === 'hold_days') return dir * (a.total_hold_days - b.total_hold_days);
      if (tradeSortKey === 'result') return dir * (a.last_trade.result||'').localeCompare(b.last_trade.result||'');
      return 0;
    });
    return sorted;
  };

  // ★ 메모이제이션: 렌더링마다 정렬/그룹핑 재계산 방지
  const sortedRankings = useMemo(() => {
    return sortRankings(result?.rankings || []);
  }, [result?.rankings, stratSortKey, stratSortDir]);

  const sortedGroupedTrades = useMemo(() => {
    if (!expandedStrategy || !result?.strategies?.[expandedStrategy]?.trades) return [];
    return sortGrouped(groupTrades(result.strategies[expandedStrategy].trades || []));
  }, [result?.strategies, expandedStrategy, tradeSortKey, tradeSortDir]);

  // 종목 봉차트
  const [chartTrade, setChartTrade] = useState(null);  // 선택된 종목 매매 정보
  const [chartCandles, setChartCandles] = useState([]); // 일봉 데이터
  const [chartLoading, setChartLoading] = useState(false);

  // 실시간 모의투자 — 단일 세션 (레거시)
  const [rtSessionId, setRtSessionId] = useState(null);
  const [rtStatus, setRtStatus] = useState(null);

  // ━━━ 실시간 세션 목록 (신규) ━━━
  const [rtSessions, setRtSessions] = useState([]);
  const [rtSessionsLoading, setRtSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);  // 세션 클릭 시 상세

  const pollRef = useRef(null);

  // ── 프리셋 파라미터 변경 ──
  const updateParam = (presetKey, field, value) => {
    setPresetParams(prev => ({
      ...prev,
      [presetKey]: { ...prev[presetKey], [field]: value },
    }));
  };

  // ── 프리셋 초기값으로 리셋 ──
  const resetPreset = (presetKey) => {
    const p = PRESETS.find(x => x.key === presetKey);
    if (p) updateParam(presetKey, "tp", p.tp);
    if (p) updateParam(presetKey, "sl", p.sl);
    if (p) updateParam(presetKey, "days", p.days);
  };

  // ── 손익비 계산 (커스텀 기준) ──
  const riskReward = presetParams.custom.sl > 0 ? (presetParams.custom.tp / presetParams.custom.sl).toFixed(2) : "∞";

  // ── 투자 대상 종목 (매수추천에서 선택된 종목 우선, 없으면 전체) ──
  const stocks = (() => {
    if (selectedRecStocks && selectedRecStocks.size > 0) {
      return recommendations.filter(r => selectedRecStocks.has(r.code || r.stock_code)).slice(0, 10);
    }
    return recommendations.length > 0 ? recommendations.slice(0, 10) : [];
  })();

  // ── ★ 백테스트용 종목 (과거 signal_date + buy_price 사용) ──
  // 버그수정: recommendations의 signal_date=오늘 → backtest 데이터와 매핑하여 역사적 날짜 사용
  const backtestStocks = (() => {
    // backtestRecommendations 코드별 룩업
    const btMap = {};
    (backtestRecommendations || []).forEach(bt => {
      if (bt.code) btMap[bt.code] = bt;
    });

    // Case 1: 사용자가 매수추천에서 종목 선택한 경우 → 선택된 종목에 과거 데이터 매핑
    if (selectedRecStocks && selectedRecStocks.size > 0 && stocks.length > 0) {
      return stocks.map(s => {
        const code = s.code || s.stock_code || "";
        const bt = btMap[code];
        if (bt && bt.signal_date) {
          // 1순위: backtestRecommendations에서 정확한 과거 데이터 가져오기
          return { ...s, signal_date: bt.signal_date, buy_price: bt.buy_price || s.current_price || 0 };
        }
        if (s.backtest_signal_date) {
          // 2순위: 백엔드에서 보강된 backtest_signal_date 사용
          return { ...s, signal_date: s.backtest_signal_date, buy_price: s.backtest_buy_price || s.current_price || 0 };
        }
        // 3순위: 원본 유지 (signal_date=오늘 — 비이상적이지만 fallback)
        return s;
      });
    }

    // Case 2: 선택 없음 + backtestRecommendations 있음 → 과거 급상승 종목 직접 사용
    if (backtestRecommendations && backtestRecommendations.length > 0) {
      return backtestRecommendations.slice(0, 10);
    }

    // Case 3: 둘 다 없음 → recommendations에서 backtest_signal_date 보강 시도
    return stocks.map(s => {
      const code = s.code || s.stock_code || "";
      const bt = btMap[code];
      if (bt && bt.signal_date) return { ...s, signal_date: bt.signal_date, buy_price: bt.buy_price || s.current_price || 0 };
      if (s.backtest_signal_date) return { ...s, signal_date: s.backtest_signal_date, buy_price: s.backtest_buy_price || s.current_price || 0 };
      return s;
    });
  })();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 백테스트 비교 실행
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const runCompare = async () => {
    if (backtestStocks.length === 0) {
      setError("백테스트할 종목이 없습니다. 먼저 🎯매수추천 탭에서 분석을 실행해주세요.");
      return;
    }

    setRunning(true);
    setProgress(0);
    setProgressMsg("시작 중...");
    setResult(null);
    setError(null);

    try {
      // ★ backtestStocks 사용 (과거 signal_date + buy_price)
      const body = {
        stocks: backtestStocks.map(s => ({
          code: s.code || s.stock_code || "",
          name: s.name || s.stock_name || "",
          buy_price: s.buy_price || s.current_price || 0,
          signal_date: s.signal_date || s.date || "",
        })),
        capital: 1000000,
        custom_params: {
          take_profit_pct: presetParams.custom.tp,
          stop_loss_pct: presetParams.custom.sl,
          max_hold_days: presetParams.custom.days,
        },
      };

      const res = await fetch(`${API_BASE}/api/virtual-invest/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`API 오류: ${res.status}`);

      // 폴링 시작
      pollRef.current = setInterval(async () => {
        try {
          const pRes = await fetch(`${API_BASE}/api/virtual-invest/compare/progress`);
          const pData = await pRes.json();
          setProgress(pData.progress || 0);
          setProgressMsg(pData.message || "");

          if (!pData.running) {
            clearInterval(pollRef.current);
            pollRef.current = null;

            if (pData.has_result) {
              const rRes = await fetch(`${API_BASE}/api/virtual-invest/compare/result`);
              const rData = await rRes.json();
              if (rData.error) {
                setError(rData.error);
              } else {
                setResult(rData);
              }
            } else if (pData.error) {
              setError(pData.error);
            }
            setRunning(false);
          }
        } catch (e) {
          console.error("Poll error:", e);
        }
      }, 1500);

    } catch (e) {
      setError(e.message);
      setRunning(false);
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 실시간 모의투자 시작
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const startRealtime = async () => {
    if (stocks.length === 0) {
      setError("매수추천 종목이 없습니다.");
      return;
    }

    try {
      const body = {
        stocks: stocks.map(s => ({
          code: s.code || s.stock_code || "",
          name: s.name || s.stock_name || "",
          buy_price: s.buy_price || s.current_price || 0,
        })),
        capital: 1000000,
        take_profit_pct: presetParams.custom.tp,
        stop_loss_pct: presetParams.custom.sl,
        max_hold_days: presetParams.custom.days,
      };

      const res = await fetch(`${API_BASE}/api/virtual-invest/realtime/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setRtSessionId(data.session_id);
        fetchRtStatus(data.session_id);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const fetchRtStatus = async (sid) => {
    try {
      const res = await fetch(`${API_BASE}/api/virtual-invest/realtime/status/${sid}`);
      const data = await res.json();
      setRtStatus(data);
    } catch (e) {
      console.error("RT status error:", e);
    }
  };

  // 클린업
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ━━━ 세션 목록 로드 ━━━
  const fetchRtSessions = useCallback(async () => {
    setRtSessionsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/virtual-invest/realtime/sessions`);
      const data = await res.json();
      setRtSessions(data.sessions || data || []);
    } catch (e) {
      console.error("세션 목록 로드 실패:", e);
    } finally {
      setRtSessionsLoading(false);
    }
  }, []);

  // 실시간 서브탭 활성화 시 세션 목록 로드
  useEffect(() => {
    if (subTab === "realtime") {
      fetchRtSessions();
    }
  }, [subTab, fetchRtSessions]);

  // 모달에서 새 세션 등록 후 자동 전환
  useEffect(() => {
    if (newRtSessionId) {
      setSubTab("realtime");
      fetchRtSessions();
      if (setNewRtSessionId) setNewRtSessionId(null);  // 소비 후 초기화
    }
  }, [newRtSessionId]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 종목 클릭 → 봉차트 로드
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const openChart = async (trade, rowKey) => {
    const key = rowKey || trade.stock_code || trade.stock_name;
    if (chartTrade?._rowKey === key) {
      setChartTrade(null); setChartCandles([]); return; // 토글
    }
    setChartTrade({ ...trade, _rowKey: key });
    setChartLoading(true);
    setChartCandles([]);
    try {
      const res = await fetch(`${API_BASE}/api/virtual-invest/candles/${trade.stock_code}?count=200`);
      const data = await res.json();
      setChartCandles(data.candles || []);
    } catch (e) {
      console.error("차트 로드 실패:", e);
    }
    setChartLoading(false);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 숫자 포맷 유틸
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const fmt = (n) => n?.toLocaleString() ?? "0";
  const fmtPct = (n) => {
    if (n == null) return "0%";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  };
  const fmtWon = (n) => {
    if (n == null) return "0원";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toLocaleString()}원`;
  };
  const pctColor = (n) => (n > 0 ? "#ff5252" : n < 0 ? "#4488ff" : "#e0e6f0");
  const fmtDate = (d) => {
    if (!d) return "-";
    // "20260220" → "02/20" or "2026-02-20" → "02/20"
    const s = d.replace(/-/g, "");
    if (s.length >= 8) return `${s.slice(4,6)}/${s.slice(6,8)}`;
    return d;
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div style={S.container}>

      {/* 투자 대상 종목 */}
      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600 }}>
            📋 투자 대상 종목 ({stocks.length}개)
            {selectedRecStocks && selectedRecStocks.size > 0 && (
              <span style={{ fontSize:11, color:'#10b981', marginLeft:8, fontWeight:400 }}>
                ✅ 매수추천에서 선택됨
              </span>
            )}
            {backtestRecommendations.length > 0 && (
              <span style={{ fontSize:10, color:'#ce93d8', marginLeft:8, fontWeight:400 }}>
                🔬 백테스트: 과거 급상승 시점 기준
              </span>
            )}
          </div>
          {selectedRecStocks && selectedRecStocks.size > 0 && setSelectedRecStocks && (
            <button onClick={() => setSelectedRecStocks(new Set())} style={{
              padding:'4px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
              background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)',
              color:'#f59e0b', fontFamily:'inherit',
            }}>선택 초기화</button>
          )}
        </div>
        {stocks.length === 0 ? (
          <div style={{ ...S.dimText, padding: "12px 0" }}>
            🎯 매수추천 탭에서 종목을 선택한 후 "💰 가상투자 등록" 버튼을 클릭하세요.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {stocks.map((s, i) => {
              const code = s.code || s.stock_code;
              const bt = backtestRecommendations.find(b => b.code === code);
              // ★ 수정: 3단계 fallback으로 signal_date 탐색
              const sigDate = bt?.signal_date || s.backtest_signal_date || "";
              const fmtSigDate = sigDate.length >= 8 ? `${sigDate.slice(0,4)}.${sigDate.slice(4,6)}.${sigDate.slice(6,8)}` : "";
              return (
                <span key={i} style={S.stockTag}>
                  {s.name || s.stock_name || code}
                  {s.similarity && <span style={{ color: "#ffd54f", marginLeft: 4, fontSize: 11 }}>
                    {s.similarity}%
                  </span>}
                  {fmtSigDate && <span style={{ color: "#ce93d8", marginLeft: 4, fontSize: 10 }}>
                    {fmtSigDate}
                  </span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 매매 설정 — 5개 전략 동시 표시 */}
      <div style={S.card}>
        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "14px" }}>
          ⚙️ 매매 설정 — 전략별 파라미터
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {PRESETS.filter(p => p.key !== "smart").map(preset => {
            const params = presetParams[preset.key] || { tp: preset.tp, sl: preset.sl, days: preset.days };
            const rr = params.sl > 0 ? (params.tp / params.sl).toFixed(2) : "0";

            return (
              <div key={preset.key} style={{
                background: "rgba(15,22,48,0.7)", borderRadius: 10, padding: "14px 16px",
                border: `1px solid ${preset.color}33`,
              }}>
                {/* 전략 헤더 */}
                <div style={{
                  fontSize: 13, fontWeight: 700, color: preset.color, marginBottom: 14,
                  paddingBottom: 8, borderBottom: `1px solid ${preset.color}22`,
                }}>
                  {preset.name}
                </div>

                {/* 파라미터 3개 */}
                {[
                  { label: "익절", en: "Take Profit", field: "tp", value: params.tp, unit: "%", color: "#FF0000",
                    min: 3, max: 20, step: 1 },
                  { label: "손절", en: "Stop Loss", field: "sl", value: params.sl, unit: "%", color: "#0050FF", neg: true,
                    min: 1, max: 10, step: 0.5 },
                  { label: "보유일", en: "Max Hold", field: "days", value: params.days, unit: "일", color: "#ffd54f",
                    min: 3, max: 30, step: 1 },
                ].map((p, pi) => (
                  <div key={pi} style={{ marginBottom: pi < 2 ? 14 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ color: "#8899aa", fontSize: 12 }}>
                        {p.label} <span style={{ color: "#556677", fontSize: 10 }}>{p.en}</span>
                      </span>
                      <span style={{ fontFamily: "monospace", color: p.color, fontSize: 15, fontWeight: 700 }}>
                        {p.neg ? "-" : ""}{p.value}{p.unit}
                      </span>
                    </div>
                    <input type="range" min={p.min} max={p.max} step={p.step} value={p.value}
                      style={{
                        ...S.slider, height: 5, borderRadius: 5,
                        background: `linear-gradient(to right, ${p.color}60 ${((p.value - p.min) / (p.max - p.min)) * 100}%, rgba(100,140,200,0.2) ${((p.value - p.min) / (p.max - p.min)) * 100}%)`,
                        accentColor: p.color,
                      }}
                      onChange={e => updateParam(preset.key, p.field, Number(e.target.value))} />
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#556677", fontSize: 9, marginTop: 3 }}>
                      <span>{p.neg ? `-${p.max}` : p.min}{p.unit}</span>
                      <span>{p.neg ? `-${p.min}` : p.max}{p.unit}</span>
                    </div>
                  </div>
                ))}

                {/* 손익비 */}
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid rgba(100,140,200,0.1)`,
                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#556677", fontSize: 11 }}>손익비</span>
                  <span style={{ fontFamily: "monospace", color: "#e0e6f0", fontSize: 13, fontWeight: 600 }}>{rr} : 1</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 서브탭 + 실행 버튼 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={S.subTabBar}>
          <button style={S.subTab(subTab === "backtest")} onClick={() => setSubTab("backtest")}>
            📊 백테스트 검증
          </button>
        </div>
        <button
          style={running || stocks.length === 0 ? S.runBtnDisabled : S.runBtn}
          disabled={running || stocks.length === 0}
          onClick={subTab === "backtest" ? runCompare : startRealtime}
        >
          {running ? "⏳ 실행 중..." : "▶ 전체 비교 실행"}
        </button>
      </div>

      {/* 진행률 */}
      {running && (
        <div style={{ ...S.card, padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12 }}>⏳ {progressMsg}</span>
            <span style={{ ...S.mono, fontSize: 12, color: "#4fc3f7" }}>{progress}%</span>
          </div>
          <div style={S.progressBar}>
            <div style={S.progressFill(progress)} />
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div style={{ ...S.card, borderColor: "rgba(255,82,82,0.3)", padding: "12px 16px" }}>
          <span style={{ color: "#ff5252", fontSize: 13 }}>❌ {error}</span>
        </div>
      )}

      {/* ━━━━ 백테스트 결과 ━━━━ */}
      {subTab === "backtest" && result && (
        <>
          {/* ② 비교표 */}
          <div style={S.card}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>
              📊 전략 비교표 / Strategy Comparison
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>순위</th>
                    <th style={S.th}>전략</th>
                    {[{k:'return_pct',l:'수익률'},{k:'return_won',l:'수익금'},{k:'win_rate',l:'승률'},{k:'win_loss',l:'승/패'},{k:'mdd',l:'MDD'},{k:'rr_ratio',l:'손익비'}].map(col => (
                      <th key={col.k} style={{ ...S.th, cursor:'pointer', userSelect:'none' }} onClick={() => handleStratSort(col.k)}>
                        {col.l}{stratSortKey===col.k ? (stratSortDir==='desc'?' ▼':' ▲') : ''}
                      </th>
                    ))}
                    <th style={S.th}>설정</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRankings.map((r, i) => (
                    <tr key={r.strategy} style={{
                      background: i === 0 ? "rgba(79,195,247,0.05)" : "transparent",
                      cursor: "pointer",
                    }} onClick={() => { setChartTrade(null); setChartCandles([]); setExpandedStrategy(expandedStrategy === r.strategy ? null : r.strategy); }}>
                      <td style={S.td}>
                        {r.ranking === 1 ? "🥇" : r.ranking === 2 ? "🥈" : r.ranking === 3 ? "🥉" : r.ranking}
                      </td>
                      <td style={{ ...S.td, textAlign: "left" }}>
                        <span style={S.badge(r.color)}>{r.strategy_name}</span>
                      </td>
                      <td style={{ ...S.td, color: pctColor(r.total_return_pct), fontWeight: 700 }}>
                        {fmtPct(r.total_return_pct)}
                      </td>
                      <td style={{ ...S.td, color: pctColor(r.total_return_won) }}>
                        {fmtWon(r.total_return_won)}
                      </td>
                      <td style={{ ...S.td, color: "#ffd54f" }}>{r.win_rate}%</td>
                      <td style={S.td}>
                        <span style={{ color: "#ff5252" }}>{r.win_count}승</span>
                        {" / "}
                        <span style={{ color: "#4488ff" }}>{r.loss_count}패</span>
                      </td>
                      <td style={{ ...S.td, color: "#ff5252" }}>{r.mdd_pct}%</td>
                      <td style={S.td}>{r.risk_reward_ratio}:1</td>
                      <td style={{ ...S.td, ...S.dimText }}>
                        {r.strategy === 'smart' ? `추적${r.trailing_stop_pct||3}%/${r.stop_loss_pct}%/${r.max_hold_days}일` : `${r.take_profit_pct}/${r.stop_loss_pct}/${r.max_hold_days}일`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ ...S.dimText, marginTop: 6 }}>
              * 행을 클릭하면 종목별 상세 결과를 확인할 수 있습니다
            </div>
          </div>

          {/* ③ 자산곡선 차트 */}
          <div style={S.card}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>
              📈 자산곡선 비교 / Equity Curve Comparison
            </div>
            <EquityCurveChart strategies={result.strategies} />
            <div style={{ display: "flex", gap: "14px", justifyContent: "center", marginTop: "10px", flexWrap: "wrap" }}>
              {PRESETS.map(p => (
                <span key={p.key} style={{ fontSize: 11, color: p.color }}>
                  ● {p.name}
                </span>
              ))}
            </div>
          </div>

          {/* ④ 종목별 상세 */}
          {expandedStrategy && result.strategies[expandedStrategy] && (
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>
                  📋 종목별 상세 — {result.strategies[expandedStrategy].strategy_name}
                  <span style={{ ...S.dimText, marginLeft: 8 }}>
                    ({expandedStrategy === 'smart'
                      ? `추적${result.strategies[expandedStrategy].trailing_stop_pct||3}% / 손절${result.strategies[expandedStrategy].stop_loss_pct}% / ${result.strategies[expandedStrategy].max_hold_days}일`
                      : `${result.strategies[expandedStrategy].take_profit_pct}% / ${result.strategies[expandedStrategy].stop_loss_pct}% / ${result.strategies[expandedStrategy].max_hold_days}일`
                    })
                  </span>
                </div>
                <button style={{ ...S.dimText, background: "none", border: "none", cursor: "pointer", fontSize: 14 }}
                  onClick={() => { setChartTrade(null); setChartCandles([]); setExpandedStrategy(null); }}>✕</button>
              </div>

              {/* 요약 */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: 12,
                background: "rgba(8,15,30,0.5)", borderRadius: 8, padding: "12px",
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={S.dimText}>총수익률</div>
                  <div style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: pctColor(result.strategies[expandedStrategy].total_return_pct) }}>
                    {fmtPct(result.strategies[expandedStrategy].total_return_pct)}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={S.dimText}>수익금</div>
                  <div style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: pctColor(result.strategies[expandedStrategy].total_return_won) }}>
                    {fmtWon(result.strategies[expandedStrategy].total_return_won)}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={S.dimText}>승률</div>
                  <div style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: "#ffd54f" }}>
                    {result.strategies[expandedStrategy].win_rate}%
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={S.dimText}>MDD</div>
                  <div style={{ ...S.mono, fontSize: 16, fontWeight: 700, color: "#ff5252" }}>
                    {result.strategies[expandedStrategy].mdd_pct}%
                  </div>
                </div>
              </div>

              {/* 종목별 테이블 */}
              <div style={{ fontSize: 11, color: "#8899aa", marginBottom: 6 }}>* 종목을 클릭하면 봉차트를 확인할 수 있습니다</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    {[{k:'name',l:'종목'},{k:'trade_count',l:'매매횟수'},{k:'buy_date',l:'매수일'},{k:'buy_price',l:'매수가'},{k:'sell_date',l:'매도일'},{k:'sell_price',l:'매도가'},{k:'profit_pct',l:'수익률'},{k:'profit_won',l:'수익금'},{k:'hold_days',l:'보유일'},{k:'result',l:'결과'}].map(col => (
                      <th key={col.k} style={{ ...S.th, cursor:'pointer', userSelect:'none' }} onClick={() => handleTradeSort(col.k)}>
                        {col.l}{tradeSortKey===col.k ? (tradeSortDir==='desc'?' ▼':' ▲') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedGroupedTrades.map((g, i) => {
                    const lt = g.last_trade;
                    const rowKey = g.stock_code;
                    const isOpen = chartTrade?._rowKey === rowKey;
                    return (
                    <React.Fragment key={g.stock_code}>
                      <tr onClick={() => openChart(lt, rowKey)}
                        style={{ cursor: "pointer", background: isOpen ? "rgba(79,195,247,0.1)" : "transparent" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(79,195,247,0.07)"}
                        onMouseLeave={e => e.currentTarget.style.background = isOpen ? "rgba(79,195,247,0.1)" : "transparent"}>
                        <td style={{ ...S.td, textAlign: "left", color: "#4fc3f7" }}>
                          📈 {g.stock_name}
                          <span style={{ fontSize: 10, color: "#667788", marginLeft: 4 }}>{g.stock_code}</span>
                        </td>
                        <td style={{ ...S.td, color: g.trade_count > 1 ? "#ffd54f" : "#8899aa" }}>{g.trade_count}회</td>
                        <td style={{ ...S.td, fontSize: 11 }}>{fmtDate(lt.buy_date)}</td>
                        <td style={S.td}>{fmt(lt.buy_price)}</td>
                        <td style={{ ...S.td, fontSize: 11 }}>{fmtDate(lt.sell_date)}</td>
                        <td style={S.td}>{fmt(lt.sell_price)}</td>
                        <td style={{ ...S.td, color: pctColor(g.total_profit_pct), fontWeight: 600 }}>
                          {fmtPct(g.total_profit_pct)}
                        </td>
                        <td style={{ ...S.td, color: pctColor(g.total_profit_won), fontWeight: 600 }}>
                          {fmtWon(g.total_profit_won)}
                        </td>
                        <td style={S.td}>{g.total_hold_days}일</td>
                        <td style={S.td}>{lt.result}{g.trade_count > 1 ? ` (${g.trade_count}차)` : ''}</td>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={10} style={{ padding: 0, border: "none" }}>
                          <div style={{ background: "rgba(8,15,30,0.7)", borderRadius: 8, padding: 14, margin: "4px 0 8px" }}>
                            {chartLoading ? (
                              <div style={{ textAlign: "center", padding: 20, color: "#8899aa" }}>⏳ 일봉 데이터 로딩 중...</div>
                            ) : chartCandles.length === 0 ? (
                              <div style={{ textAlign: "center", padding: 20, color: "#8899aa" }}>일봉 데이터를 불러올 수 없습니다.</div>
                            ) : (
                              <TradeCandleChart candles={chartCandles} trades={g.trades} />
                            )}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ━━━━ 실시간 가상투자 추적 ━━━━ */}
      {subTab === "realtime" && (
        <div>
          {/* 헤더 */}
          <div style={{ ...S.card, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📊 실시간 가상투자 추적</div>
            <div style={S.dimText}>매수추천 종목으로 가상 포트폴리오를 만들고 실시간으로 수익을 추적합니다</div>
          </div>

          {/* 요약 카드 */}
          {(() => {
            const total = rtSessions.length;
            const tracking = rtSessions.filter(s => s.status === 'active' || s.status === 'tracking').length;
            const ended = rtSessions.filter(s => s.status === 'ended' || s.status === 'completed').length;
            const totalProfit = rtSessions.reduce((sum, s) => sum + (s.total_profit || s.profit || 0), 0);
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
                <div style={{ ...S.card, textAlign: "center", padding: 14 }}>
                  <div style={S.dimText}>전체</div>
                  <div style={{ ...S.mono, fontSize: 22, fontWeight: 700 }}>{total}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>개</div>
                </div>
                <div style={{ ...S.card, textAlign: "center", padding: 14 }}>
                  <div style={S.dimText}>추적중</div>
                  <div style={{ ...S.mono, fontSize: 22, fontWeight: 700, color: '#4fc3f7' }}>{tracking}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>개</div>
                </div>
                <div style={{ ...S.card, textAlign: "center", padding: 14 }}>
                  <div style={S.dimText}>종료</div>
                  <div style={{ ...S.mono, fontSize: 22, fontWeight: 700 }}>{ended}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>개</div>
                </div>
                <div style={{ ...S.card, textAlign: "center", padding: 14 }}>
                  <div style={S.dimText}>총 수익</div>
                  <div style={{ ...S.mono, fontSize: 18, fontWeight: 700, color: pctColor(totalProfit) }}>
                    {fmtWon(totalProfit)}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 세션 목록 */}
          {rtSessionsLoading ? (
            <div style={{ ...S.card, textAlign: "center", padding: 30, ...S.dimText }}>⏳ 세션 목록 로드 중...</div>
          ) : rtSessions.length === 0 ? (
            <div style={{ ...S.card, textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>등록된 가상투자 세션이 없습니다</div>
              <div style={S.dimText}>
                🎯 매수추천 탭에서 종목을 선택한 후<br />
                "💰 가상투자 등록" 버튼을 클릭하세요.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rtSessions.map((session, idx) => {
                const profitPct = session.total_profit_pct || session.profit_pct || 0;
                const profit = session.total_profit || session.profit || 0;
                const isActive = session.status === 'active' || session.status === 'tracking';
                const stocks = session.stocks || session.stock_names || [];
                const stockCount = session.stock_count || stocks.length || 0;
                const dateStr = session.created_at ? fmtDate(session.created_at.split('T')[0]) : '-';
                const presetLabel = {
                  smart: '🧠 스마트형', aggressive: '🔥 공격형',
                  standard: '⚖️ 기본형', conservative: '🛡️ 보수형',
                  longterm: '🐢 장기형',
                }[session.preset] || session.preset || '';

                return (
                  <div key={session.session_id || session.id || idx}
                    style={{
                      ...S.card, padding: '16px 20px', cursor: 'pointer',
                      border: selectedSession === (session.session_id || session.id)
                        ? '1px solid rgba(79,195,247,0.5)' : '1px solid rgba(100,140,200,0.15)',
                    }}
                    onClick={() => {
                      const sid = session.session_id || session.id;
                      if (selectedSession === sid) {
                        setSelectedSession(null); setRtStatus(null);
                      } else {
                        setSelectedSession(sid);
                        // 세션 목록 응답에 이미 positions 포함 — API 재호출 불필요
                        setRtStatus({
                          cash: session.cash || 0,
                          holding_value: session.holding_value || 0,
                          holding_count: session.holding_count || 0,
                          total_asset: session.total_asset || session.capital || 0,
                          positions: session.positions || [],
                        });
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: isActive ? 'rgba(79,195,247,0.15)' : 'rgba(107,114,128,0.15)',
                          color: isActive ? '#4fc3f7' : '#6b7280',
                        }}>{dateStr}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{session.title || `세션 ${idx + 1}`}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {stockCount}종목 · 투자금 {fmt(session.capital || 1000000)}원 · {presetLabel}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div>
                          <div style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: pctColor(profitPct) }}>
                            {profitPct > 0 ? '+' : ''}{profitPct.toFixed(2)}%
                          </div>
                          <div style={{ ...S.mono, fontSize: 11, color: pctColor(profit) }}>
                            {fmtWon(profit)}
                          </div>
                        </div>
                        <div style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 8,
                          background: isActive ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
                          color: isActive ? '#10b981' : '#6b7280',
                        }}>● {isActive ? '추적중' : '종료'}</div>
                      </div>
                    </div>

                    {/* 종목 태그 */}
                    {stocks.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                        {(typeof stocks[0] === 'string' ? stocks : stocks.map(s => s.name || s.stock_name || s.code)).map((name, si) => (
                          <span key={si} style={{
                            fontSize: 11, padding: '3px 10px', borderRadius: 6,
                            background: 'rgba(79,195,247,0.1)', color: '#4fc3f7',
                          }}>{name}</span>
                        ))}
                      </div>
                    )}

                    {/* 선택된 세션 상세 */}
                    {selectedSession === (session.session_id || session.id) && rtStatus && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(100,140,200,0.15)' }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: 12 }}>
                          <div style={{ textAlign: "center", background: "rgba(8,15,30,0.5)", borderRadius: 8, padding: 10 }}>
                            <div style={S.dimText}>가용 현금</div>
                            <div style={{ ...S.mono, fontWeight: 600 }}>{fmt(rtStatus.cash || 0)}원</div>
                          </div>
                          <div style={{ textAlign: "center", background: "rgba(8,15,30,0.5)", borderRadius: 8, padding: 10 }}>
                            <div style={S.dimText}>보유 평가</div>
                            <div style={{ ...S.mono, fontWeight: 600 }}>{fmt(rtStatus.holding_value || 0)}원</div>
                          </div>
                          <div style={{ textAlign: "center", background: "rgba(8,15,30,0.5)", borderRadius: 8, padding: 10 }}>
                            <div style={S.dimText}>보유 종목</div>
                            <div style={{ ...S.mono, fontWeight: 600 }}>{rtStatus.holding_count || 0} / {stockCount}</div>
                          </div>
                        </div>

                        {rtStatus.positions && rtStatus.positions.length > 0 && (
                          <table style={S.table}>
                            <thead>
                              <tr>
                                <th style={S.th}>종목</th>
                                <th style={S.th}>매수가</th>
                                <th style={S.th}>현재가</th>
                                <th style={S.th}>수익률</th>
                                <th style={S.th}>보유일</th>
                                <th style={S.th}>상태</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rtStatus.positions.map((p, i) => {
                                const pct = p.buy_price > 0 ? ((p.current_price - p.buy_price) / p.buy_price * 100) : 0;
                                return (
                                  <tr key={i} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openChart(p); }}>
                                    <td style={{ ...S.td, textAlign: "left" }}>{p.stock_name}</td>
                                    <td style={S.td}>{fmt(p.buy_price)}</td>
                                    <td style={S.td}>{fmt(p.current_price)}</td>
                                    <td style={{ ...S.td, color: pctColor(pct), fontWeight: 600 }}>{fmtPct(pct)}</td>
                                    <td style={S.td}>{p.hold_days || 0}일</td>
                                    <td style={S.td}>
                                      {p.status === "holding" ? "📈 보유중" :
                                        p.status === "sold_profit" ? "익절✅" :
                                          p.status === "sold_loss" ? "손절❌" : "만기⏰"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 새로고침 버튼 */}
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <button onClick={fetchRtSessions} style={{
              padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
              background: 'transparent', border: '1px solid rgba(100,140,200,0.15)',
              color: '#9ca3af', fontFamily: 'inherit',
            }}>🔄 새로고침</button>
          </div>
        </div>
      )}

      {/* 결과 없음 안내 */}
      {subTab === "backtest" && !result && !running && !error && (
        <div style={{ ...S.card, textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>백테스트 비교 대기</div>
          <div style={S.dimText}>
            위 ▶ 전체 비교 실행 버튼을 클릭하면<br />
            5가지 전략의 수익률을 동시에 비교합니다.
          </div>
        </div>
      )}
    </div>
  );
}




// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 종목별 일봉 차트 v2 (개선판)
// - 매수/매도 마커 (날짜+가격+인덱스 폴백 매칭)
// - 이동평균선 MA5, MA20
// - 거래량 바 차트
// - DTW 패턴 감지 구간 표시
// - 축 라벨 흰색 + 크게
// - 앞뒤 30일 여유
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TradeCandleChart({ candles, trades: tradesProp, trade: tradeProp }) {
  if (!candles || candles.length === 0) return null;

  // ── 복수 trades 지원 (하위 호환) ──
  const allTrades = tradesProp || (tradeProp ? [tradeProp] : []);
  if (allTrades.length === 0) return null;
  const trade = allTrades[0]; // 대표 trade (종목명, 코드 등)

  // ── 날짜 유틸 ──
  const norm = (d) => d ? d.replace(/-/g, "").replace(/'/g, "").trim() : "";
  const fDate = (d) => { const s = norm(d); return s.length >= 8 ? `${s.slice(4,6)}/${s.slice(6,8)}` : d || "-"; };
  const fDateFull = (d) => { const s = norm(d); return s.length >= 8 ? `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}` : d || "-"; };

  // ── 모든 trade의 매수/매도 인덱스 찾기 ──
  const tradeIndices = allTrades.map(t => {
    const buyDateN = norm(t.buy_date);
    const sellDateN = norm(t.sell_date);
    let buyIdx = -1, sellIdx = -1;

    // 1차: 날짜 정확 매칭
    if (buyDateN) buyIdx = candles.findIndex(c => norm(c.date) === buyDateN);
    if (sellDateN) sellIdx = candles.findIndex(c => norm(c.date) === sellDateN);

    // 2차: 날짜 없으면 → 매수가에 가장 가까운 종가 (후반 60%에서)
    if (buyIdx < 0 && t.buy_price > 0) {
      const searchFrom = Math.floor(candles.length * 0.3);
      let minDiff = Infinity;
      for (let i = searchFrom; i < candles.length; i++) {
        const diff = Math.abs(candles[i].close - t.buy_price);
        if (diff < minDiff) { minDiff = diff; buyIdx = i; }
        if (diff === 0) break;
      }
    }

    // 3차: 매도 인덱스 = 매수 + 보유일수
    if (sellIdx < 0 && buyIdx >= 0 && t.hold_days > 0) {
      sellIdx = Math.min(buyIdx + t.hold_days, candles.length - 1);
    }

    return { buyIdx, sellIdx, trade: t };
  });

  // ── 전체 범위 계산: 모든 trade를 포함하는 범위 ──
  const allBuyIdxs = tradeIndices.map(ti => ti.buyIdx).filter(i => i >= 0);
  const allSellIdxs = tradeIndices.map(ti => ti.sellIdx).filter(i => i >= 0);
  const minBuyIdx = allBuyIdxs.length > 0 ? Math.min(...allBuyIdxs) : Math.floor(candles.length * 0.5);
  const maxSellIdx = allSellIdxs.length > 0 ? Math.max(...allSellIdxs) : minBuyIdx + (trade.hold_days || 5);

  const PAD_BEFORE = 60, PAD_AFTER = 30;
  const startIdx = Math.max(0, minBuyIdx - PAD_BEFORE);
  const endIdx = Math.min(candles.length - 1, maxSellIdx + PAD_AFTER);
  const vis = candles.slice(startIdx, endIdx + 1);
  if (vis.length < 5) return null;

  // 차트 내 인덱스 재계산 (모든 trade)
  const chartTradeIndices = tradeIndices.map(ti => ({
    chartBuyIdx: ti.buyIdx >= 0 ? ti.buyIdx - startIdx : -1,
    chartSellIdx: ti.sellIdx >= 0 ? ti.sellIdx - startIdx : -1,
    trade: ti.trade,
  }));
  // 대표 (첫 번째 trade) 인덱스
  const chartBuyIdx = chartTradeIndices[0].chartBuyIdx;
  const chartSellIdx = chartTradeIndices[0].chartSellIdx;

  // ── 차트 사이즈 ──
  const W = 740, H_CHART = 260, H_VOL = 60, GAP = 18;
  const PAD = { t: 24, b: 38, l: 68, r: 20 };
  const TOTAL_H = PAD.t + H_CHART + GAP + H_VOL + PAD.b;
  const plotW = W - PAD.l - PAD.r;
  const cw = plotW / vis.length;

  // ── 가격 범위: 매매 구간 중심으로 Y축 설정 ──
  // 세력주는 30일 범위에서 주가가 수배 급변 → 전체 범위 쓰면 매매 구간 봉이 안 보임
  // 해결: 모든 매매 구간 ±10일의 가격으로 Y축 계산
  let focusCandles = vis;
  if (chartTradeIndices.some(ti => ti.chartBuyIdx >= 0)) {
    const allFocusBuys = chartTradeIndices.map(ti => ti.chartBuyIdx).filter(i => i >= 0);
    const allFocusSells = chartTradeIndices.map(ti => ti.chartSellIdx).filter(i => i >= 0);
    const fs = Math.max(0, Math.min(...allFocusBuys) - 10);
    const fe = Math.min(vis.length - 1, Math.max(...(allFocusSells.length > 0 ? allFocusSells : allFocusBuys)) + 10);
    const focused = vis.slice(fs, fe + 1);
    if (focused.length >= 3) focusCandles = focused;
  }
  const allP = focusCandles.flatMap(c => [c.high, c.low]).filter(p => p > 0);
  const pMin = Math.min(...allP), pMax = Math.max(...allP);
  const pPad = (pMax - pMin) * 0.08 || 100;
  const pLow = pMin - pPad, pHigh = pMax + pPad, pRange = pHigh - pLow || 1;
  const maxVol = Math.max(...vis.map(c => c.volume || 0), 1);

  const toX = (i) => PAD.l + i * cw;
  const toY = (p) => PAD.t + (1 - (p - pLow) / pRange) * H_CHART;
  const volBase = PAD.t + H_CHART + GAP + H_VOL;

  // ── 이동평균선 계산 (원본 candles 기준 → vis에 투영) ──
  const calcMA = (period) => {
    return vis.map((_, i) => {
      const gi = startIdx + i;
      if (gi < period - 1) return null;
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[gi - j].close;
      return sum / period;
    });
  };
  const ma5 = calcMA(5);
  const ma20 = calcMA(20);

  const svg = [];

  // ── 배경 ──
  svg.push(<rect key="bg" x={0} y={0} width={W} height={TOTAL_H} fill="rgba(8,15,30,0.95)" rx={8} />);

  // ── 클리핑 영역 (차트 밖 넘침 방지) ──
  const clipId = `chart-clip-${trade.stock_code || "x"}-${startIdx}`;
  svg.push(
    <defs key="clip-defs">
      <clipPath id={clipId}>
        <rect x={PAD.l} y={PAD.t} width={plotW} height={H_CHART} />
      </clipPath>
    </defs>
  );

  // ── DTW 패턴 감지 구간 (매수 30일 전 ~ 매수일) ──
  if (chartBuyIdx >= 0) {
    const dtwStart = Math.max(0, chartBuyIdx - 30);
    const dtwEnd = chartBuyIdx;
    const dx1 = toX(dtwStart);
    const dx2 = toX(dtwEnd) + cw;
    svg.push(<rect key="dtw-bg" x={dx1} y={PAD.t} width={dx2 - dx1} height={H_CHART}
      fill="rgba(206,147,216,0.04)" stroke="rgba(206,147,216,0.15)" strokeDasharray="5,3" rx={3} />);
    svg.push(<rect key="dtw-bar" x={dx1} y={PAD.t + H_CHART - 5} width={dx2 - dx1} height={5}
      fill="rgba(206,147,216,0.5)" rx={2} />);
    svg.push(<text key="dtw-lbl" x={(dx1 + dx2) / 2} y={PAD.t + 14} fill="rgba(206,147,216,0.6)" fontSize={10}
      fontFamily="sans-serif" textAnchor="middle">DTW 패턴 감지 구간</text>);
  }

  // ── 매매 구간 하이라이트 (각 trade별) ──
  chartTradeIndices.forEach((ti, idx) => {
    if (ti.chartBuyIdx >= 0) {
      const hStart = toX(ti.chartBuyIdx);
      const hEnd = ti.chartSellIdx >= 0 ? toX(ti.chartSellIdx) + cw : toX(Math.min(ti.chartBuyIdx + (ti.trade.hold_days || 5), vis.length - 1)) + cw;
      svg.push(<rect key={`zone-${idx}`} x={hStart} y={PAD.t} width={Math.max(hEnd - hStart, cw)} height={H_CHART}
        fill="rgba(79,195,247,0.07)" stroke="rgba(79,195,247,0.2)" strokeDasharray="4,4" rx={2} />);
      if (idx === 0) {
        svg.push(<text key="zone-lbl" x={(hStart + hEnd) / 2} y={PAD.t + H_CHART - 8} fill="rgba(79,195,247,0.5)" fontSize={10}
          fontFamily="sans-serif" textAnchor="middle">매매 구간{allTrades.length > 1 ? ` (${allTrades.length}회)` : ""}</text>);
      }
    }
  });

  // ── 가격 눈금 (5단계, 흰색 크게) ──
  for (let i = 0; i <= 5; i++) {
    const p = pLow + pRange * (i / 5);
    const y = toY(p);
    svg.push(<line key={`pg-${i}`} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(50,70,100,0.25)" strokeDasharray="3,3" />);
    svg.push(<text key={`pl-${i}`} x={PAD.l - 8} y={y + 4} fill="#d0d8e8" fontSize={11}
      fontFamily="monospace" textAnchor="end" fontWeight={500}>{Math.round(p).toLocaleString()}</text>);
  }

  // ── X축 날짜 라벨 (흰색 크게) ──
  const allChartBuyIdxs = new Set(chartTradeIndices.map(ti => ti.chartBuyIdx).filter(i => i >= 0));
  const allChartSellIdxs = new Set(chartTradeIndices.map(ti => ti.chartSellIdx).filter(i => i >= 0));
  const dateStep = Math.max(1, Math.floor(vis.length / 12));
  vis.forEach((c, i) => {
    const isBuy = allChartBuyIdxs.has(i);
    const isSell = allChartSellIdxs.has(i);
    if (i % dateStep === 0 || isBuy || isSell) {
      const x = toX(i) + cw / 2;
      svg.push(<text key={`dt-${i}`} x={x} y={TOTAL_H - 8}
        fill={isBuy ? "#00E676" : isSell ? "#FFD600" : "#c0c8d8"} fontSize={isBuy || isSell ? 11 : 10}
        fontFamily="monospace" textAnchor="middle" fontWeight={isBuy || isSell ? 700 : 400}>{fDate(c.date)}</text>);
    }
  });

  // ── 거래량 구분선 + 라벨 ──
  svg.push(<line key="vol-sep" x1={PAD.l} y1={PAD.t + H_CHART + GAP / 2} x2={W - PAD.r} y2={PAD.t + H_CHART + GAP / 2}
    stroke="rgba(50,70,100,0.3)" />);
  svg.push(<text key="vol-lbl" x={PAD.l - 8} y={volBase - H_VOL + 12} fill="#8899aa" fontSize={9} fontFamily="monospace" textAnchor="end">VOL</text>);

  // ── 거래량 바 (영웅문 색상) ──
  vis.forEach((c, i) => {
    const x = toX(i);
    const isUp = c.close >= c.open;
    const color = isUp ? "#FF0000" : "#0050FF";
    const barH = Math.max(((c.volume || 0) / maxVol) * H_VOL, 1);
    svg.push(<rect key={`vol-${i}`} x={x + 1} y={volBase - barH}
      width={Math.max(cw - 2, 2)} height={barH} fill={color} opacity={0.75} rx={1} />);
  });

  // ── 캔들 (영웅문 색상: 양봉 빨강 / 음봉 파랑) ──
  const candleElements = [];
  vis.forEach((c, i) => {
    const x = toX(i);
    const isUp = c.close >= c.open;
    const color = isUp ? "#FF0000" : "#0050FF";
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(bodyBot - bodyTop, 1.5);
    const cx = x + cw / 2;
    candleElements.push(
      <g key={`c-${i}`}>
        <line x1={cx} y1={toY(c.high)} x2={cx} y2={toY(c.low)} stroke={color} strokeWidth={1} />
        <rect x={x + 2} y={bodyTop} width={Math.max(cw - 4, 3)} height={bodyH} fill={color} rx={1} />
      </g>
    );
  });

  // ── MA5 (노란색) ──
  let ma5d = "";
  ma5.forEach((v, i) => { if (v !== null) ma5d += (ma5d ? "L" : "M") + `${toX(i) + cw / 2},${toY(v)} `; });
  if (ma5d) candleElements.push(<path key="ma5" d={ma5d} fill="none" stroke="#ffcc00" strokeWidth={1.5} opacity={0.8} />);

  // ── MA20 (핑크) ──
  let ma20d = "";
  ma20.forEach((v, i) => { if (v !== null) ma20d += (ma20d ? "L" : "M") + `${toX(i) + cw / 2},${toY(v)} `; });
  if (ma20d) candleElements.push(<path key="ma20" d={ma20d} fill="none" stroke="#ff6699" strokeWidth={1.5} opacity={0.7} />);

  // 클리핑 그룹으로 감싸서 차트 영역 밖 넘침 방지
  svg.push(<g key="clipped-chart" clipPath={`url(#${clipId})`}>{candleElements}</g>);

  // ── 매수가 수평선 (각 trade별) ──
  const drawnBuyPrices = new Set();
  allTrades.forEach((t, idx) => {
    const bp = Math.round(t.buy_price);
    if (t.buy_price > 0 && t.buy_price >= pLow && t.buy_price <= pHigh && !drawnBuyPrices.has(bp)) {
      drawnBuyPrices.add(bp);
      const bpY = toY(t.buy_price);
      svg.push(<line key={`bp-line-${idx}`} x1={PAD.l} y1={bpY} x2={W - PAD.r} y2={bpY}
        stroke="#00E676" strokeWidth={1} strokeDasharray="8,4" opacity={0.3} />);
    }
  });

  // ── 현재가 수평선 ──
  const lastPrice = vis[vis.length - 1].close;
  const lastY = toY(lastPrice);
  svg.push(<line key="cur-line" x1={PAD.l} y1={lastY} x2={W - PAD.r} y2={lastY}
    stroke="#ffd54f" strokeWidth={1} strokeDasharray="5,3" opacity={0.5} />);
  svg.push(<rect key="cur-bg" x={W - PAD.r - 72} y={lastY - 10} width={70} height={20}
    fill="rgba(255,213,79,0.2)" rx={3} />);
  svg.push(<text key="cur-txt" x={W - PAD.r - 37} y={lastY + 4} fill="#ffd54f" fontSize={11}
    fontFamily="monospace" textAnchor="middle" fontWeight={600}>{Math.round(lastPrice).toLocaleString()}</text>);

  // ── 매수 마커 (▲ 밝은 초록) — 모든 trade ──
  chartTradeIndices.forEach((ti, idx) => {
    if (ti.chartBuyIdx >= 0 && ti.chartBuyIdx < vis.length) {
      const bx = toX(ti.chartBuyIdx) + cw / 2;
      const by = toY(vis[ti.chartBuyIdx].low) + 18 + idx * 22;
      svg.push(
        <g key={`buy-m-${idx}`}>
          <line x1={bx} y1={PAD.t} x2={bx} y2={PAD.t + H_CHART} stroke="#00E676" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.4} />
          <polygon points={`${bx},${by - 14} ${bx - 8},${by} ${bx + 8},${by}`} fill="#00E676" />
          <rect x={bx - 44} y={by + 4} width={88} height={18} fill="rgba(0,230,118,0.15)" rx={4} />
          <text x={bx} y={by + 16} fill="#00E676" fontSize={10} fontFamily="sans-serif" textAnchor="middle" fontWeight={700}>
            매수{allTrades.length > 1 ? `${idx + 1}` : ""} {Math.round(ti.trade.buy_price).toLocaleString()}
          </text>
        </g>
      );
    }
  });

  // ── 매도 마커 (▼ 금색) — 모든 trade ──
  chartTradeIndices.forEach((ti, idx) => {
    if (ti.chartSellIdx >= 0 && ti.chartSellIdx < vis.length) {
      const sx = toX(ti.chartSellIdx) + cw / 2;
      const sy = toY(vis[ti.chartSellIdx].high) - 8 - idx * 22;
      const sellColor = "#FFD600";
      const rLabel = ti.trade.result === "익절✅" ? "익절" : ti.trade.result === "추적✅" ? "추적" : ti.trade.result === "손절❌" ? "손절" : "만기";
      svg.push(
        <g key={`sell-m-${idx}`}>
          <line x1={sx} y1={PAD.t} x2={sx} y2={PAD.t + H_CHART} stroke={sellColor} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.4} />
          <polygon points={`${sx},${sy + 14} ${sx - 8},${sy} ${sx + 8},${sy}`} fill={sellColor} />
          <rect x={sx - 44} y={sy - 22} width={88} height={18} fill="rgba(255,214,0,0.15)" rx={4} />
          <text x={sx} y={sy - 9} fill={sellColor} fontSize={10} fontFamily="sans-serif" textAnchor="middle" fontWeight={700}>
            {rLabel}{allTrades.length > 1 ? `${idx + 1}` : ""} {Math.round(ti.trade.sell_price).toLocaleString()}
          </text>
        </g>
      );
    }
  });

  // ── 헤더 ──
  const totalProfitPct = allTrades.reduce((s, t) => s + (t.profit_pct || 0), 0);
  const avgProfitPct = allTrades.length > 0 ? totalProfitPct / allTrades.length : 0;
  const profitColor = avgProfitPct >= 0 ? "#FF0000" : "#0050FF";
  const profitSign = avgProfitPct >= 0 ? "+" : "";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          🕯️ {trade.stock_name}
          <span style={{ color: "#778899", fontSize: 11, marginLeft: 6 }}>({trade.stock_code})</span>
          {allTrades.length > 1 ? (
            <span style={{ color: "#4FC3F7", fontSize: 11, marginLeft: 10 }}>{allTrades.length}회 매매</span>
          ) : (
            <>
              <span style={{ color: "#00E676", fontSize: 11, marginLeft: 10 }}>매수 {chartBuyIdx >= 0 ? fDateFull(vis[chartBuyIdx].date) : fDateFull(trade.buy_date) || "-"}</span>
              <span style={{ color: "#8899aa", fontSize: 11, marginLeft: 4 }}>→</span>
              <span style={{ color: "#FFD600", fontSize: 11, marginLeft: 4 }}>매도 {chartSellIdx >= 0 ? fDateFull(vis[chartSellIdx].date) : fDateFull(trade.sell_date) || "-"}</span>
            </>
          )}
          <span style={{ color: profitColor, fontSize: 11, marginLeft: 8, fontWeight: 700 }}>
            {allTrades.length > 1 ? "평균 " : ""}{profitSign}{avgProfitPct.toFixed(1)}%
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, flexWrap: "wrap" }}>
          <span><span style={{ color: "#FF0000" }}>■</span> 양봉</span>
          <span><span style={{ color: "#0050FF" }}>■</span> 음봉</span>
          <span style={{ color: "#ffcc00" }}>── MA5</span>
          <span style={{ color: "#ff6699" }}>── MA20</span>
          <span><span style={{ color: "#00E676" }}>▲</span> 매수</span>
          <span><span style={{ color: "#FFD600" }}>▼</span> 매도</span>
          <span style={{ color: "#ce93d8" }}>■ DTW</span>
        </div>
      </div>
      <svg width={W} height={TOTAL_H} style={{ display: "block", maxWidth: "100%" }}>
        {svg}
      </svg>
    </div>
  );
}
