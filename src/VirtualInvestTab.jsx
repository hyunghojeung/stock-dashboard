/**
 * 가상투자 시뮬레이터 탭 / Virtual Investment Simulator Tab
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 파일경로: src/components/VirtualInvestTab.jsx
 *
 * PatternDetector.jsx의 4번째 탭으로 통합.
 * 매수추천 종목을 5가지 전략으로 동시 비교 백테스트 + 실시간 모의투자.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";

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
export default function VirtualInvestTab({ recommendations = [] }) {
  // 서브탭: backtest | realtime
  const [subTab, setSubTab] = useState("backtest");

  // 매매 파라미터
  const [takeProfit, setTakeProfit] = useState(7);
  const [stopLoss, setStopLoss] = useState(3);
  const [maxHoldDays, setMaxHoldDays] = useState(10);
  const [activePreset, setActivePreset] = useState("standard");

  // 실행 상태
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  // 결과
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 종목별 상세 열기
  const [expandedStrategy, setExpandedStrategy] = useState(null);

  // 실시간 모의투자
  const [rtSessionId, setRtSessionId] = useState(null);
  const [rtStatus, setRtStatus] = useState(null);

  const pollRef = useRef(null);

  // ── 프리셋 클릭 ──
  const applyPreset = (preset) => {
    setActivePreset(preset.key);
    if (preset.key !== "custom") {
      setTakeProfit(preset.tp);
      setStopLoss(preset.sl);
      setMaxHoldDays(preset.days);
    }
  };

  // ── 슬라이더 변경 시 커스텀으로 전환 ──
  const handleSlider = (setter, value) => {
    setter(value);
    setActivePreset("custom");
  };

  // ── 손익비 계산 ──
  const riskReward = stopLoss > 0 ? (takeProfit / stopLoss).toFixed(2) : "∞";

  // ── 투자 대상 종목 (매수추천에서 전달받은 종목) ──
  const stocks = recommendations.length > 0
    ? recommendations.slice(0, 5)
    : [];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 백테스트 비교 실행
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const runCompare = async () => {
    if (stocks.length === 0) {
      setError("매수추천 종목이 없습니다. 먼저 🎯매수추천 탭에서 분석을 실행해주세요.");
      return;
    }

    setRunning(true);
    setProgress(0);
    setProgressMsg("시작 중...");
    setResult(null);
    setError(null);

    try {
      const body = {
        stocks: stocks.map(s => ({
          code: s.code || s.stock_code || "",
          name: s.name || s.stock_name || "",
          buy_price: s.buy_price || s.current_price || 0,
          signal_date: s.signal_date || s.date || "",
        })),
        capital: 1000000,
        custom_params: {
          take_profit_pct: takeProfit,
          stop_loss_pct: stopLoss,
          max_hold_days: maxHoldDays,
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
        take_profit_pct: takeProfit,
        stop_loss_pct: stopLoss,
        max_hold_days: maxHoldDays,
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div style={S.container}>

      {/* 투자 대상 종목 */}
      <div style={S.card}>
        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
          📋 투자 대상 종목 ({stocks.length}개)
        </div>
        {stocks.length === 0 ? (
          <div style={{ ...S.dimText, padding: "12px 0" }}>
            🎯 매수추천 탭에서 분석을 실행하면 추천 종목이 여기에 표시됩니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {stocks.map((s, i) => (
              <span key={i} style={S.stockTag}>
                {s.name || s.stock_name || s.code}
                {s.similarity && <span style={{ color: "#ffd54f", marginLeft: 4, fontSize: 11 }}>
                  {s.similarity}%
                </span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 매매 설정 */}
      <div style={S.card}>
        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>
          ⚙️ 매매 설정
        </div>

        {/* 프리셋 버튼 */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
          {PRESETS.filter(p => p.key !== "custom").map(p => (
            <button key={p.key} style={S.presetBtn(activePreset === p.key)} onClick={() => applyPreset(p)}>
              {p.name}
            </button>
          ))}
          <button style={S.presetBtn(activePreset === "custom")} onClick={() => setActivePreset("custom")}>
            🎛️ 커스텀
          </button>
        </div>

        {/* 슬라이더 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={S.dimText}>익절 / Take Profit</span>
              <span style={{ ...S.mono, color: "#ff5252", fontSize: 14, fontWeight: 700 }}>{takeProfit}%</span>
            </div>
            <input type="range" min="3" max="20" step="1" value={takeProfit} style={S.slider}
              onChange={e => handleSlider(setTakeProfit, Number(e.target.value))} />
            <div style={{ display: "flex", justifyContent: "space-between", ...S.dimText, fontSize: 9 }}>
              <span>3%</span><span>20%</span>
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={S.dimText}>손절 / Stop Loss</span>
              <span style={{ ...S.mono, color: "#4488ff", fontSize: 14, fontWeight: 700 }}>{stopLoss}%</span>
            </div>
            <input type="range" min="1" max="10" step="0.5" value={stopLoss} style={S.slider}
              onChange={e => handleSlider(setStopLoss, Number(e.target.value))} />
            <div style={{ display: "flex", justifyContent: "space-between", ...S.dimText, fontSize: 9 }}>
              <span>1%</span><span>10%</span>
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={S.dimText}>최대 보유일</span>
              <span style={{ ...S.mono, color: "#ffd54f", fontSize: 14, fontWeight: 700 }}>{maxHoldDays}일</span>
            </div>
            <input type="range" min="3" max="30" step="1" value={maxHoldDays} style={S.slider}
              onChange={e => handleSlider(setMaxHoldDays, Number(e.target.value))} />
            <div style={{ display: "flex", justifyContent: "space-between", ...S.dimText, fontSize: 9 }}>
              <span>3일</span><span>30일</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
          <span style={{ ...S.dimText }}>
            손익비: <span style={{ ...S.mono, color: "#e0e6f0", fontWeight: 600 }}>{riskReward} : 1</span>
          </span>
        </div>
      </div>

      {/* 서브탭 + 실행 버튼 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={S.subTabBar}>
          <button style={S.subTab(subTab === "backtest")} onClick={() => setSubTab("backtest")}>
            📊 백테스트 검증
          </button>
          <button style={S.subTab(subTab === "realtime")} onClick={() => setSubTab("realtime")}>
            🔴 실시간 모의투자
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
          {/* ① 최적 전략 배너 */}
          {result.best_strategy && (
            <div style={{
              ...S.card,
              background: "linear-gradient(135deg, rgba(79,195,247,0.1), rgba(33,150,243,0.05))",
              border: "1px solid rgba(79,195,247,0.3)",
              textAlign: "center",
              padding: "14px",
            }}>
              <div style={{ fontSize: 11, color: "#8899aa", marginBottom: 4 }}>🏆 최적 전략 / Best Strategy</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#4fc3f7" }}>
                {result.best_strategy_name}
              </div>
              <div style={{ fontSize: 12, color: "#8899aa", marginTop: 4 }}>
                {result.best_reason}
              </div>
            </div>
          )}

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
                    <th style={S.th}>수익률</th>
                    <th style={S.th}>수익금</th>
                    <th style={S.th}>승률</th>
                    <th style={S.th}>승/패</th>
                    <th style={S.th}>MDD</th>
                    <th style={S.th}>손익비</th>
                    <th style={S.th}>설정</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.rankings || []).map((r, i) => (
                    <tr key={r.strategy} style={{
                      background: i === 0 ? "rgba(79,195,247,0.05)" : "transparent",
                      cursor: "pointer",
                    }} onClick={() => setExpandedStrategy(expandedStrategy === r.strategy ? null : r.strategy)}>
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
                        {r.take_profit_pct}/{r.stop_loss_pct}/{r.max_hold_days}일
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
                    ({result.strategies[expandedStrategy].take_profit_pct}% / {result.strategies[expandedStrategy].stop_loss_pct}% / {result.strategies[expandedStrategy].max_hold_days}일)
                  </span>
                </div>
                <button style={{ ...S.dimText, background: "none", border: "none", cursor: "pointer", fontSize: 14 }}
                  onClick={() => setExpandedStrategy(null)}>✕</button>
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
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>종목</th>
                    <th style={S.th}>매수가</th>
                    <th style={S.th}>매도가</th>
                    <th style={S.th}>수익률</th>
                    <th style={S.th}>수익금</th>
                    <th style={S.th}>보유일</th>
                    <th style={S.th}>결과</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.strategies[expandedStrategy].trades || []).map((t, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, textAlign: "left" }}>{t.stock_name}</td>
                      <td style={S.td}>{fmt(t.buy_price)}</td>
                      <td style={S.td}>{fmt(t.sell_price)}</td>
                      <td style={{ ...S.td, color: pctColor(t.profit_pct), fontWeight: 600 }}>
                        {fmtPct(t.profit_pct)}
                      </td>
                      <td style={{ ...S.td, color: pctColor(t.profit_won) }}>
                        {fmtWon(t.profit_won)}
                      </td>
                      <td style={S.td}>{t.hold_days}일</td>
                      <td style={S.td}>{t.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 전략별 탭 버튼 (종목 상세 빠른 전환) */}
          {!expandedStrategy && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(result.rankings || []).map(r => (
                <button key={r.strategy} style={S.presetBtn(false)}
                  onClick={() => setExpandedStrategy(r.strategy)}>
                  {r.strategy_name} 상세보기
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ━━━━ 실시간 모의투자 ━━━━ */}
      {subTab === "realtime" && (
        <div style={S.card}>
          {!rtSessionId ? (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🔴</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>실시간 모의투자</div>
              <div style={S.dimText}>
                매수추천 종목을 지금부터 가상 매수하고<br />
                매일 장 마감 후 수익률을 자동 업데이트합니다.
              </div>
              <div style={{ ...S.dimText, marginTop: 12 }}>
                위 ▶ 전체 비교 실행 버튼을 클릭하면 시작됩니다.
              </div>
            </div>
          ) : rtStatus ? (
            <>
              {/* 실시간 현황 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>🔴 모의투자 진행 중</span>
                  <span style={{ ...S.dimText, marginLeft: 8 }}>세션: {rtSessionId}</span>
                </div>
                <div style={{ ...S.mono, fontSize: 18, fontWeight: 700, color: pctColor((rtStatus.total_asset || 1000000) - 1000000) }}>
                  {fmt(rtStatus.total_asset || 1000000)}원
                </div>
              </div>

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
                  <div style={{ ...S.mono, fontWeight: 600 }}>{rtStatus.holding_count || 0} / {5}</div>
                </div>
              </div>

              {/* 포지션 목록 */}
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
                        <tr key={i}>
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
            </>
          ) : (
            <div style={{ textAlign: "center", padding: 20, ...S.dimText }}>로딩 중...</div>
          )}
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
