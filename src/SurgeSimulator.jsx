/**
 * 급등패턴 매매 시뮬레이터 — 프론트엔드
 * Surge Pattern Trade Simulator — Frontend
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 파일경로: src/pages/SurgeSimulator.jsx
 *
 * DTW 패턴 분석 → 매매 시뮬레이션 → 성과 리포트
 * 
 * ※ App.jsx 등록:
 *   import SurgeSimulator from './pages/SurgeSimulator';
 *   사이드바: { id: 'surge-sim', label: '시뮬레이터', icon: '🎯' }
 *   라우팅:  case 'surge-sim': return <SurgeSimulator />;
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상수 정의 / Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PERIODS = [
  { label: '3개월', days: 90 },
  { label: '6개월', days: 180 },
  { label: '1년', days: 365 },
  { label: '2년', days: 730 },
];

const DEFAULT_CONFIG = {
  period_days: 365,
  pre_rise_days: 10,
  rise_pct: 30,
  rise_window: 5,
  initial_capital: 10000000,
  take_profit_pct: 7,
  stop_loss_pct: 3,
  max_hold_days: 10,
  max_positions: 5,
  similarity_threshold: 65,
  trailing_stop: false,
  trailing_pct: 3,
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 컴포넌트 / Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function SurgeSimulator() {
  // 종목 관리
  const [stocks, setStocks] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // 시뮬레이션 설정
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 실행 상태
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');

  // 결과
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');

  // 가이드
  const [showGuide, setShowGuide] = useState(false);

  const pollRef = useRef(null);
  const searchTimerRef = useRef(null);


  // ── 종목 검색 ──
  const searchStock = useCallback(async (keyword) => {
    if (!keyword || keyword.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/pattern/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (e) {
      console.error('검색 오류:', e);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchStock(searchKeyword), 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchKeyword, searchStock]);

  const addStock = (stock) => {
    if (!stocks.find(s => s.code === stock.code)) {
      setStocks(prev => [...prev, stock]);
    }
    setSearchKeyword('');
    setSearchResults([]);
  };

  const removeStock = (code) => {
    setStocks(prev => prev.filter(s => s.code !== code));
  };


  // ── 시뮬레이션 실행 ──
  const startSimulation = async () => {
    if (stocks.length === 0) {
      alert('종목을 1개 이상 추가해주세요');
      return;
    }

    setRunning(true);
    setProgress(0);
    setProgressMsg('시뮬레이션 요청 중...');
    setResult(null);

    try {
      const names = {};
      stocks.forEach(s => { names[s.code] = s.name; });

      const res = await fetch(`${API_BASE}/api/simulation/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codes: stocks.map(s => s.code),
          names,
          ...config,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '시뮬레이션 시작 실패');
      }

      // 폴링 시작
      startPolling();
    } catch (e) {
      alert('시뮬레이션 오류: ' + e.message);
      setRunning(false);
    }
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/simulation/progress`);
        const data = await res.json();

        setProgress(data.progress || 0);
        setProgressMsg(data.message || '');

        if (!data.running) {
          clearInterval(pollRef.current);
          pollRef.current = null;

          if (data.error) {
            alert('시뮬레이션 실패: ' + data.error);
            setRunning(false);
          } else if (data.has_result) {
            // 결과 가져오기
            const resultRes = await fetch(`${API_BASE}/api/simulation/result`);
            const resultData = await resultRes.json();
            if (resultData.status === 'completed') {
              setResult(resultData.result);
              setActiveTab('summary');
            }
            setRunning(false);
          }
        }
      } catch (e) {
        console.error('폴링 오류:', e);
      }
    }, 1500);
  };

  const stopSimulation = async () => {
    try {
      await fetch(`${API_BASE}/api/simulation/stop`, { method: 'POST' });
    } catch (e) { /* ignore */ }
    if (pollRef.current) clearInterval(pollRef.current);
    setRunning(false);
  };

  useEffect(() => {
    // 페이지 진입 시 이전 진행 상태 확인
    fetch(`${API_BASE}/api/simulation/progress`)
      .then(r => r.json())
      .then(data => {
        if (data.running) {
          setRunning(true);
          setProgress(data.progress);
          setProgressMsg(data.message);
          startPolling();
        } else if (data.has_result) {
          fetch(`${API_BASE}/api/simulation/result`)
            .then(r => r.json())
            .then(d => {
              if (d.status === 'completed') setResult(d.result);
            });
        }
      })
      .catch(() => {});

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);


  // ── 렌더링 ──
  return (
    <div style={styles.container}>
      {/* 헤더 */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🎯 급등패턴 시뮬레이터</h1>
          <p style={styles.subtitle}>
            DTW 패턴 분석 → 매매 시뮬레이션 → 수익성 검증
          </p>
        </div>
        <button
          style={styles.guideBtn}
          onClick={() => setShowGuide(!showGuide)}
        >
          {showGuide ? '✕ 닫기' : '📖 사용 가이드'}
        </button>
      </div>

      {/* 가이드 */}
      {showGuide && <GuidePanel />}

      {/* 설정 패널 */}
      <div style={styles.configPanel}>
        {/* 종목 검색 & 추가 */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>📌 분석 종목 선택</h3>
          <div style={styles.searchBox}>
            <input
              style={styles.searchInput}
              type="text"
              placeholder="종목명 또는 코드 검색..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              disabled={running}
            />
            {searching && <span style={styles.searchSpinner}>🔍</span>}
          </div>
          {searchResults.length > 0 && (
            <div style={styles.searchDropdown}>
              {searchResults.map(r => (
                <div
                  key={r.code}
                  style={styles.searchItem}
                  onClick={() => addStock(r)}
                >
                  <span style={styles.searchName}>{r.name}</span>
                  <span style={styles.searchCode}>{r.code}</span>
                </div>
              ))}
            </div>
          )}
          {/* 선택된 종목 태그 */}
          <div style={styles.stockTags}>
            {stocks.map(s => (
              <span key={s.code} style={styles.stockTag}>
                {s.name}
                <span
                  style={styles.tagRemove}
                  onClick={() => removeStock(s.code)}
                >×</span>
              </span>
            ))}
            {stocks.length === 0 && (
              <span style={styles.noStocks}>종목을 검색하여 추가하세요</span>
            )}
          </div>
        </div>

        {/* 기간 & 기본 설정 */}
        <div style={styles.configRow}>
          <div style={styles.configGroup}>
            <label style={styles.label}>분석 기간</label>
            <div style={styles.periodBtns}>
              {PERIODS.map(p => (
                <button
                  key={p.days}
                  style={{
                    ...styles.periodBtn,
                    ...(config.period_days === p.days ? styles.periodBtnActive : {}),
                  }}
                  onClick={() => setConfig({ ...config, period_days: p.days })}
                  disabled={running}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.configGroup}>
            <label style={styles.label}>
              초기 자금: {(config.initial_capital / 10000).toLocaleString()}만원
            </label>
            <input
              type="range"
              min={1000000}
              max={100000000}
              step={1000000}
              value={config.initial_capital}
              onChange={e => setConfig({ ...config, initial_capital: Number(e.target.value) })}
              style={styles.slider}
              disabled={running}
            />
          </div>
        </div>

        {/* 매매 조건 */}
        <div style={styles.configRow}>
          <ConfigSlider
            label={`익절: +${config.take_profit_pct}%`}
            min={3} max={20} step={0.5}
            value={config.take_profit_pct}
            onChange={v => setConfig({ ...config, take_profit_pct: v })}
            disabled={running}
            color="#ff4444"
          />
          <ConfigSlider
            label={`손절: -${config.stop_loss_pct}%`}
            min={1} max={10} step={0.5}
            value={config.stop_loss_pct}
            onChange={v => setConfig({ ...config, stop_loss_pct: v })}
            disabled={running}
            color="#4488ff"
          />
          <ConfigSlider
            label={`최대 보유: ${config.max_hold_days}일`}
            min={3} max={30} step={1}
            value={config.max_hold_days}
            onChange={v => setConfig({ ...config, max_hold_days: v })}
            disabled={running}
            color="#ffd54f"
          />
          <ConfigSlider
            label={`동시 보유: ${config.max_positions}종목`}
            min={1} max={10} step={1}
            value={config.max_positions}
            onChange={v => setConfig({ ...config, max_positions: v })}
            disabled={running}
            color="#66ccff"
          />
        </div>

        {/* 고급 설정 토글 */}
        <button
          style={styles.advancedToggle}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▲ 고급설정 접기' : '▼ 고급설정 펼치기'}
        </button>

        {showAdvanced && (
          <div style={styles.configRow}>
            <ConfigSlider
              label={`유사도 기준: ${config.similarity_threshold}%`}
              min={40} max={90} step={5}
              value={config.similarity_threshold}
              onChange={v => setConfig({ ...config, similarity_threshold: v })}
              disabled={running}
              color="#4cff8b"
            />
            <ConfigSlider
              label={`급상승 기준: +${config.rise_pct}%`}
              min={10} max={50} step={5}
              value={config.rise_pct}
              onChange={v => setConfig({ ...config, rise_pct: v })}
              disabled={running}
              color="#ff6699"
            />
            <ConfigSlider
              label={`상승 판단기간: ${config.rise_window}일`}
              min={3} max={10} step={1}
              value={config.rise_window}
              onChange={v => setConfig({ ...config, rise_window: v })}
              disabled={running}
              color="#ffcc00"
            />
            <ConfigSlider
              label={`분석 구간: ${config.pre_rise_days}일`}
              min={5} max={20} step={1}
              value={config.pre_rise_days}
              onChange={v => setConfig({ ...config, pre_rise_days: v })}
              disabled={running}
              color="#bb99ff"
            />
            <div style={styles.configGroup}>
              <label style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={config.trailing_stop}
                  onChange={e => setConfig({ ...config, trailing_stop: e.target.checked })}
                  disabled={running}
                />
                <span style={{ marginLeft: 6 }}>
                  트레일링 스톱 ({config.trailing_pct}%)
                </span>
              </label>
            </div>
          </div>
        )}

        {/* 실행 버튼 */}
        <div style={styles.actionRow}>
          {!running ? (
            <button style={styles.runBtn} onClick={startSimulation}>
              🚀 시뮬레이션 실행
            </button>
          ) : (
            <button style={styles.stopBtn} onClick={stopSimulation}>
              ⏹ 중단
            </button>
          )}
        </div>
      </div>

      {/* 진행률 바 */}
      {running && (
        <div style={styles.progressPanel}>
          <div style={styles.progressBar}>
            <div
              style={{ ...styles.progressFill, width: `${progress}%` }}
            />
          </div>
          <p style={styles.progressText}>{progress}% — {progressMsg}</p>
        </div>
      )}

      {/* 결과 */}
      {result && <ResultPanel result={result} activeTab={activeTab} setActiveTab={setActiveTab} />}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결과 패널 / Result Panel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ResultPanel({ result, activeTab, setActiveTab }) {
  const tabs = [
    { id: 'summary', label: '📊 성과 요약' },
    { id: 'trades', label: '📋 매매 내역' },
    { id: 'chart', label: '📈 자산 추이' },
    { id: 'pattern', label: '🔬 패턴별 성과' },
    { id: 'monthly', label: '📅 월별 성과' },
    { id: 'stocks', label: '📌 종목별 성과' },
  ];

  return (
    <div style={styles.resultPanel}>
      {/* 탭 헤더 */}
      <div style={styles.tabRow}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            style={{
              ...styles.tabBtn,
              ...(activeTab === tab.id ? styles.tabBtnActive : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      {activeTab === 'summary' && <SummaryTab result={result} />}
      {activeTab === 'trades' && <TradesTab trades={result.trades || []} />}
      {activeTab === 'chart' && <ChartTab snapshots={result.daily_snapshots || []} config={result.config || {}} />}
      {activeTab === 'pattern' && <PatternTab patterns={result.pattern_performance || []} />}
      {activeTab === 'monthly' && <MonthlyTab months={result.monthly_performance || []} />}
      {activeTab === 'stocks' && <StocksTab stocks={result.stock_performance || []} />}
    </div>
  );
}


// ── 성과 요약 탭 ──
function SummaryTab({ result }) {
  const r = result;
  const isProfit = r.total_return_pct >= 0;
  const exitStats = r.exit_stats || {};

  return (
    <div style={styles.tabContent}>
      {/* 핵심 성과 카드 */}
      <div style={styles.kpiGrid}>
        <KPICard
          label="총 수익률"
          value={`${r.total_return_pct >= 0 ? '+' : ''}${r.total_return_pct}%`}
          color={isProfit ? '#ff4444' : '#4488ff'}
          big
        />
        <KPICard
          label="최종 자산"
          value={`${(r.final_capital || 0).toLocaleString()}원`}
          color="#e0e6f0"
        />
        <KPICard
          label="승률"
          value={`${r.win_rate}%`}
          sub={`${r.win_count}승 ${r.lose_count}패 / ${r.total_trades}건`}
          color="#ffd54f"
        />
        <KPICard
          label="손익비"
          value={`${r.profit_loss_ratio} : 1`}
          sub={`수익 ${r.avg_profit_pct}% / 손실 ${r.avg_loss_pct}%`}
          color={r.profit_loss_ratio >= 1.5 ? '#4cff8b' : '#ff6699'}
        />
        <KPICard
          label="최대 낙폭 (MDD)"
          value={`-${r.max_drawdown_pct}%`}
          color="#ff6699"
        />
        <KPICard
          label="평균 보유일"
          value={`${r.avg_hold_days}일`}
          color="#66ccff"
        />
        <KPICard
          label="총 순수익"
          value={`${(r.total_profit || 0).toLocaleString()}원`}
          color={r.total_profit >= 0 ? '#ff4444' : '#4488ff'}
        />
        <KPICard
          label="총 비용"
          value={`${((r.total_commission || 0) + (r.total_tax || 0)).toLocaleString()}원`}
          sub={`수수료 ${(r.total_commission || 0).toLocaleString()} + 세금 ${(r.total_tax || 0).toLocaleString()}`}
          color="#888"
        />
      </div>

      {/* 매도 사유 통계 */}
      <div style={styles.exitStatsRow}>
        <h4 style={styles.subTitle}>매도 사유 분포</h4>
        <div style={styles.exitBars}>
          {Object.entries(exitStats).map(([reason, count]) => {
            const total = r.total_trades || 1;
            const pct = ((count / total) * 100).toFixed(1);
            const label = {
              'take_profit': '✅ 익절',
              'stop_loss': '❌ 손절',
              'time_exit': '⏰ 시간손절',
              'trailing_stop': '📉 트레일링',
              'simulation_end': '🔚 시뮬종료',
            }[reason] || reason;
            const color = {
              'take_profit': '#4cff8b',
              'stop_loss': '#ff4444',
              'time_exit': '#ffd54f',
              'trailing_stop': '#ff6699',
              'simulation_end': '#888',
            }[reason] || '#666';

            return (
              <div key={reason} style={styles.exitBarItem}>
                <span style={styles.exitLabel}>{label}</span>
                <div style={styles.exitBarBg}>
                  <div style={{ ...styles.exitBarFill, width: `${pct}%`, background: color }} />
                </div>
                <span style={{ ...styles.exitCount, color }}>{count}건 ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 전략 판정 */}
      <div style={styles.verdictBox}>
        {r.total_return_pct > 5 && r.win_rate > 45 && r.max_drawdown_pct < 20 ? (
          <p style={{ color: '#4cff8b' }}>
            ✅ <b>유효한 전략</b> — 수익률, 승률, MDD 모두 양호합니다. 파라미터 미세조정 후 실전 적용을 고려해보세요.
          </p>
        ) : r.total_return_pct > 0 ? (
          <p style={{ color: '#ffd54f' }}>
            ⚠️ <b>개선 필요</b> — 수익은 있으나 파라미터 조정이 필요합니다. 익절/손절 비율이나 유사도 기준을 변경해보세요.
          </p>
        ) : (
          <p style={{ color: '#ff4444' }}>
            ❌ <b>전략 재검토 필요</b> — 현재 설정으로는 손실이 발생합니다. 종목군이나 파라미터를 크게 변경해보세요.
          </p>
        )}
      </div>
    </div>
  );
}


// ── KPI 카드 ──
function KPICard({ label, value, sub, color, big }) {
  return (
    <div style={styles.kpiCard}>
      <span style={styles.kpiLabel}>{label}</span>
      <span style={{ ...styles.kpiValue, color, fontSize: big ? 28 : 20 }}>
        {value}
      </span>
      {sub && <span style={styles.kpiSub}>{sub}</span>}
    </div>
  );
}


// ── 매매 내역 탭 ──
function TradesTab({ trades }) {
  const [sortKey, setSortKey] = useState('sell_date');
  const [sortDir, setSortDir] = useState(-1);

  const sorted = [...trades].sort((a, b) => {
    const va = a[sortKey] || '';
    const vb = b[sortKey] || '';
    if (typeof va === 'number') return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb)) * sortDir;
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(-sortDir);
    else { setSortKey(key); setSortDir(-1); }
  };

  return (
    <div style={styles.tabContent}>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {[
                ['name', '종목'],
                ['buy_date', '매수일'],
                ['buy_price', '매수가'],
                ['sell_date', '매도일'],
                ['sell_price', '매도가'],
                ['profit_pct', '수익률'],
                ['profit', '수익금'],
                ['hold_days', '보유일'],
                ['exit_reason', '매도사유'],
                ['similarity', '유사도'],
              ].map(([key, label]) => (
                <th
                  key={key}
                  style={styles.th}
                  onClick={() => toggleSort(key)}
                >
                  {label} {sortKey === key ? (sortDir > 0 ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const isWin = t.profit_pct > 0;
              const color = isWin ? '#ff4444' : '#4488ff';
              const exitLabel = {
                'take_profit': '✅ 익절',
                'stop_loss': '❌ 손절',
                'time_exit': '⏰ 시간',
                'trailing_stop': '📉 트레일링',
                'simulation_end': '🔚 종료',
              }[t.exit_reason] || t.exit_reason;

              return (
                <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                  <td style={styles.td}>{t.name}</td>
                  <td style={styles.tdMono}>{t.buy_date}</td>
                  <td style={styles.tdMono}>{(t.buy_price || 0).toLocaleString()}</td>
                  <td style={styles.tdMono}>{t.sell_date}</td>
                  <td style={styles.tdMono}>{(t.sell_price || 0).toLocaleString()}</td>
                  <td style={{ ...styles.tdMono, color, fontWeight: 700 }}>
                    {t.profit_pct >= 0 ? '+' : ''}{t.profit_pct}%
                  </td>
                  <td style={{ ...styles.tdMono, color }}>
                    {(t.profit || 0).toLocaleString()}
                  </td>
                  <td style={styles.tdCenter}>{t.hold_days}일</td>
                  <td style={styles.td}>{exitLabel}</td>
                  <td style={styles.tdMono}>{t.similarity}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {trades.length === 0 && (
          <p style={styles.emptyMsg}>매매 기록이 없습니다</p>
        )}
      </div>
    </div>
  );
}


// ── 자산 추이 차트 탭 ──
function ChartTab({ snapshots, config }) {
  if (!snapshots || snapshots.length === 0) {
    return <div style={styles.tabContent}><p style={styles.emptyMsg}>자산 추이 데이터가 없습니다</p></div>;
  }

  const canvasRef = useRef(null);
  const initial = config.initial_capital || 10000000;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 30, right: 20, bottom: 40, left: 80 };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,15,30,0.9)';
    ctx.fillRect(0, 0, W, H);

    const assets = snapshots.map(s => s.total_asset);
    const minA = Math.min(...assets) * 0.98;
    const maxA = Math.max(...assets) * 1.02;
    const range = maxA - minA || 1;

    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const toX = (i) => PAD.left + (i / (snapshots.length - 1)) * chartW;
    const toY = (v) => PAD.top + (1 - (v - minA) / range) * chartH;

    // 기준선 (초기 자금)
    const baseY = toY(initial);
    ctx.strokeStyle = 'rgba(100,140,200,0.3)';
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, baseY);
    ctx.lineTo(W - PAD.right, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 기준선 라벨
    ctx.fillStyle = '#556677';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${(initial / 10000).toLocaleString()}만`, PAD.left - 8, baseY + 4);

    // 그리드
    for (let i = 0; i <= 4; i++) {
      const v = minA + range * (i / 4);
      const y = toY(v);
      ctx.strokeStyle = 'rgba(50,70,100,0.2)';
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.fillStyle = '#445566';
      ctx.fillText(`${(v / 10000).toFixed(0)}만`, PAD.left - 8, y + 4);
    }

    // 자산 라인 (그라데이션 fill)
    const lastAsset = assets[assets.length - 1];
    const lineColor = lastAsset >= initial ? '#ff4444' : '#4488ff';

    // Fill
    const gradient = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
    gradient.addColorStop(0, lastAsset >= initial ? 'rgba(255,68,68,0.15)' : 'rgba(68,136,255,0.15)');
    gradient.addColorStop(1, 'rgba(8,15,30,0)');

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(assets[0]));
    for (let i = 1; i < assets.length; i++) {
      ctx.lineTo(toX(i), toY(assets[i]));
    }
    ctx.lineTo(toX(assets.length - 1), PAD.top + chartH);
    ctx.lineTo(toX(0), PAD.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(assets[0]));
    for (let i = 1; i < assets.length; i++) {
      ctx.lineTo(toX(i), toY(assets[i]));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 마지막 값 표시
    const lastX = toX(assets.length - 1);
    const lastY = toY(lastAsset);
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = lineColor;
    ctx.font = 'bold 12px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${(lastAsset / 10000).toFixed(0)}만원`, lastX + 8, lastY + 4);

    // 날짜 라벨
    ctx.fillStyle = '#445566';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(snapshots.length / 8));
    for (let i = 0; i < snapshots.length; i += step) {
      ctx.fillText(snapshots[i].date?.slice(5) || '', toX(i), H - 10);
    }

  }, [snapshots, initial]);

  return (
    <div style={styles.tabContent}>
      <canvas ref={canvasRef} width={900} height={360} style={{ width: '100%', maxWidth: 900, borderRadius: 8 }} />
    </div>
  );
}


// ── 패턴별 성과 탭 ──
function PatternTab({ patterns }) {
  return (
    <div style={styles.tabContent}>
      <h4 style={styles.subTitle}>클러스터(패턴 그룹)별 매매 성과</h4>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>클러스터 ID</th>
              <th style={styles.th}>매매 수</th>
              <th style={styles.th}>승률</th>
              <th style={styles.th}>평균 수익률</th>
              <th style={styles.th}>총 수익</th>
            </tr>
          </thead>
          <tbody>
            {patterns.map((p, i) => (
              <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                <td style={styles.tdCenter}>패턴 #{p.cluster_id}</td>
                <td style={styles.tdCenter}>{p.trades}건</td>
                <td style={{ ...styles.tdCenter, color: (p.win_rate || 0) >= 50 ? '#4cff8b' : '#ff6699' }}>
                  {p.win_rate || 0}%
                </td>
                <td style={{ ...styles.tdMono, color: p.avg_profit_pct >= 0 ? '#ff4444' : '#4488ff' }}>
                  {p.avg_profit_pct >= 0 ? '+' : ''}{p.avg_profit_pct}%
                </td>
                <td style={{ ...styles.tdMono, color: p.total_profit >= 0 ? '#ff4444' : '#4488ff' }}>
                  {(p.total_profit || 0).toLocaleString()}원
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {patterns.length === 0 && <p style={styles.emptyMsg}>패턴 데이터가 없습니다</p>}
      </div>
    </div>
  );
}


// ── 월별 성과 탭 ──
function MonthlyTab({ months }) {
  return (
    <div style={styles.tabContent}>
      <h4 style={styles.subTitle}>월별 매매 성과</h4>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>월</th>
              <th style={styles.th}>매매 수</th>
              <th style={styles.th}>승/패</th>
              <th style={styles.th}>수익금</th>
              <th style={styles.th}>누적 수익률</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                <td style={styles.tdMono}>{m.month}</td>
                <td style={styles.tdCenter}>{m.trades}건</td>
                <td style={styles.tdCenter}>
                  <span style={{ color: '#4cff8b' }}>{m.wins}</span>
                  /
                  <span style={{ color: '#ff4444' }}>{m.trades - m.wins}</span>
                </td>
                <td style={{ ...styles.tdMono, color: m.profit >= 0 ? '#ff4444' : '#4488ff' }}>
                  {(m.profit || 0).toLocaleString()}원
                </td>
                <td style={{ ...styles.tdMono, color: m.profit_pct >= 0 ? '#ff4444' : '#4488ff' }}>
                  {m.profit_pct >= 0 ? '+' : ''}{m.profit_pct?.toFixed(2) || 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {months.length === 0 && <p style={styles.emptyMsg}>월별 데이터가 없습니다</p>}
      </div>
    </div>
  );
}


// ── 종목별 성과 탭 ──
function StocksTab({ stocks }) {
  return (
    <div style={styles.tabContent}>
      <h4 style={styles.subTitle}>종목별 매매 성과</h4>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>종목</th>
              <th style={styles.th}>매매 수</th>
              <th style={styles.th}>승률</th>
              <th style={styles.th}>총 수익</th>
              <th style={styles.th}>총 수익률</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s, i) => {
              const wr = s.trades > 0 ? ((s.wins / s.trades) * 100).toFixed(1) : 0;
              return (
                <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                  <td style={styles.td}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ color: '#556677', marginLeft: 6, fontSize: 11 }}>{s.code}</span>
                  </td>
                  <td style={styles.tdCenter}>{s.trades}건</td>
                  <td style={{ ...styles.tdCenter, color: wr >= 50 ? '#4cff8b' : '#ff6699' }}>
                    {wr}%
                  </td>
                  <td style={{ ...styles.tdMono, color: s.total_profit >= 0 ? '#ff4444' : '#4488ff' }}>
                    {(s.total_profit || 0).toLocaleString()}원
                  </td>
                  <td style={{ ...styles.tdMono, color: s.total_profit_pct >= 0 ? '#ff4444' : '#4488ff' }}>
                    {s.total_profit_pct >= 0 ? '+' : ''}{s.total_profit_pct?.toFixed(2) || 0}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {stocks.length === 0 && <p style={styles.emptyMsg}>종목 데이터가 없습니다</p>}
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 컴포넌트 / Shared Components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ConfigSlider({ label, min, max, step, value, onChange, disabled, color }) {
  return (
    <div style={styles.configGroup}>
      <label style={{ ...styles.label, color }}>{label}</label>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={styles.slider}
        disabled={disabled}
      />
    </div>
  );
}


function GuidePanel() {
  return (
    <div style={styles.guidePanel}>
      <h3 style={{ color: '#66ccff', marginBottom: 12 }}>📖 시뮬레이터 사용 가이드</h3>

      <div style={styles.guideStep}>
        <b>Step 1 — 종목 선택</b>
        <p>분석할 종목을 검색하여 추가합니다. 동일 업종이나 테마 종목을 묶어서 넣으면 패턴 공통점이 더 잘 드러납니다.</p>
      </div>

      <div style={styles.guideStep}>
        <b>Step 2 — 파라미터 설정</b>
        <p>기본값(익절 +7%, 손절 -3%, 보유 10일)은 급등주 매매에 가장 검증된 설정입니다. 고급설정에서 유사도 기준을 낮추면 더 많은 매매 신호가 발생합니다.</p>
      </div>

      <div style={styles.guideStep}>
        <b>Step 3 — 시뮬레이션 실행</b>
        <p>① 일봉 데이터 수집 → ② DTW 패턴 분석 → ③ 가상 매매 시뮬레이션 순서로 진행됩니다.</p>
      </div>

      <div style={styles.guideStep}>
        <b>Step 4 — 결과 분석</b>
        <p>
          <b>승률 50%+</b> & <b>손익비 1.5+</b> & <b>MDD -15% 이내</b>이면 유효한 전략입니다.
          파라미터를 바꿔가며 최적 조합을 찾으세요.
        </p>
      </div>

      <div style={{ marginTop: 10, padding: 10, background: 'rgba(255,68,68,0.1)', borderRadius: 8 }}>
        <b style={{ color: '#ff4444' }}>⚠️ 주의:</b> 과거 데이터 기반 시뮬레이션이므로 미래 수익을 보장하지 않습니다.
        실전에서는 반드시 소액으로 검증 후 투자하세요.
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 스타일 / Styles
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const styles = {
  container: {
    maxWidth: 1000,
    margin: '0 auto',
    padding: '20px 16px',
    fontFamily: "'Noto Sans KR', sans-serif",
    color: '#e0e6f0',
  },

  // 헤더
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#e0e6f0',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: '#6688aa',
    margin: '4px 0 0',
  },
  guideBtn: {
    background: 'rgba(102,204,255,0.15)',
    color: '#66ccff',
    border: '1px solid rgba(102,204,255,0.3)',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },

  // 가이드
  guidePanel: {
    background: 'rgba(25,35,65,0.8)',
    border: '1px solid rgba(100,140,200,0.15)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  guideStep: {
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 1.6,
    color: '#aabbcc',
  },

  // 설정 패널
  configPanel: {
    background: 'linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))',
    border: '1px solid rgba(100,140,200,0.15)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 10,
    color: '#aabbcc',
  },

  // 검색
  searchBox: {
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    background: 'rgba(8,15,30,0.6)',
    border: '1px solid rgba(100,140,200,0.2)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#e0e6f0',
    fontSize: 14,
    outline: 'none',
    fontFamily: "'Noto Sans KR', sans-serif",
  },
  searchSpinner: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
  },
  searchDropdown: {
    position: 'absolute',
    zIndex: 100,
    width: '100%',
    background: 'rgba(15,22,48,0.98)',
    border: '1px solid rgba(100,140,200,0.2)',
    borderRadius: '0 0 8px 8px',
    maxHeight: 200,
    overflow: 'auto',
  },
  searchItem: {
    padding: '8px 14px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    borderBottom: '1px solid rgba(100,140,200,0.1)',
  },
  searchName: { fontWeight: 500 },
  searchCode: { color: '#6688aa', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },

  // 종목 태그
  stockTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  stockTag: {
    background: 'rgba(79,195,247,0.15)',
    color: '#4fc3f7',
    border: '1px solid rgba(79,195,247,0.3)',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  tagRemove: {
    cursor: 'pointer',
    fontWeight: 700,
    color: '#ff6699',
    marginLeft: 4,
  },
  noStocks: {
    color: '#556677',
    fontSize: 13,
    fontStyle: 'italic',
  },

  // 설정 행
  configRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  configGroup: {
    flex: '1 1 200px',
    minWidth: 180,
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: '#aabbcc',
    marginBottom: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 13,
    color: '#aabbcc',
    cursor: 'pointer',
  },
  slider: {
    width: '100%',
    accentColor: '#4fc3f7',
  },

  // 기간 버튼
  periodBtns: {
    display: 'flex',
    gap: 6,
  },
  periodBtn: {
    background: 'transparent',
    color: '#556677',
    border: '1px solid rgba(100,140,200,0.2)',
    borderRadius: 6,
    padding: '5px 14px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: "'Noto Sans KR', sans-serif",
    transition: 'all 0.2s',
  },
  periodBtnActive: {
    background: 'rgba(79,195,247,0.2)',
    color: '#4fc3f7',
    borderColor: 'rgba(79,195,247,0.4)',
  },

  // 고급 설정
  advancedToggle: {
    background: 'transparent',
    color: '#6688aa',
    border: 'none',
    fontSize: 12,
    cursor: 'pointer',
    padding: '4px 0',
    marginBottom: 8,
  },

  // 실행 버튼
  actionRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: 16,
  },
  runBtn: {
    background: 'linear-gradient(135deg, #ff4444, #cc2222)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '12px 48px',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Noto Sans KR', sans-serif",
    boxShadow: '0 4px 15px rgba(255,68,68,0.3)',
    transition: 'transform 0.2s',
  },
  stopBtn: {
    background: 'rgba(100,140,200,0.2)',
    color: '#ff6699',
    border: '1px solid rgba(255,102,153,0.4)',
    borderRadius: 10,
    padding: '12px 48px',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Noto Sans KR', sans-serif",
  },

  // 진행률
  progressPanel: {
    background: 'rgba(25,35,65,0.8)',
    border: '1px solid rgba(100,140,200,0.15)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  progressBar: {
    background: 'rgba(8,15,30,0.6)',
    borderRadius: 8,
    height: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #4fc3f7, #4cff8b)',
    borderRadius: 8,
    transition: 'width 0.5s ease',
  },
  progressText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#88aacc',
    marginTop: 8,
    fontFamily: "'JetBrains Mono', monospace",
  },

  // 결과 패널
  resultPanel: {
    background: 'linear-gradient(135deg, rgba(25,35,65,0.9), rgba(15,22,48,0.95))',
    border: '1px solid rgba(100,140,200,0.15)',
    borderRadius: 12,
    padding: 20,
  },

  // 탭
  tabRow: {
    display: 'flex',
    gap: 4,
    marginBottom: 16,
    overflowX: 'auto',
    paddingBottom: 4,
  },
  tabBtn: {
    background: 'transparent',
    color: '#556677',
    border: '1px solid transparent',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: "'Noto Sans KR', sans-serif",
    transition: 'all 0.2s',
  },
  tabBtnActive: {
    background: 'rgba(79,195,247,0.15)',
    color: '#4fc3f7',
    borderColor: 'rgba(79,195,247,0.3)',
  },
  tabContent: {
    minHeight: 200,
  },

  // KPI 카드
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    background: 'rgba(8,15,30,0.5)',
    border: '1px solid rgba(100,140,200,0.1)',
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#6688aa',
    marginBottom: 4,
  },
  kpiValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
  },
  kpiSub: {
    fontSize: 11,
    color: '#556677',
    marginTop: 2,
    fontFamily: "'JetBrains Mono', monospace",
  },

  // 매도 사유
  exitStatsRow: {
    marginBottom: 20,
  },
  subTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#aabbcc',
    marginBottom: 10,
  },
  exitBars: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  exitBarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 13,
  },
  exitLabel: {
    minWidth: 100,
    textAlign: 'right',
  },
  exitBarBg: {
    flex: 1,
    height: 12,
    background: 'rgba(8,15,30,0.5)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  exitBarFill: {
    height: '100%',
    borderRadius: 6,
    transition: 'width 0.5s ease',
  },
  exitCount: {
    minWidth: 80,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
  },

  // 전략 판정
  verdictBox: {
    background: 'rgba(8,15,30,0.5)',
    border: '1px solid rgba(100,140,200,0.1)',
    borderRadius: 10,
    padding: '14px 18px',
    fontSize: 14,
    lineHeight: 1.6,
  },

  // 테이블
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
    fontFamily: "'Noto Sans KR', sans-serif",
  },
  th: {
    background: 'rgba(8,15,30,0.5)',
    color: '#6688aa',
    padding: '8px 10px',
    textAlign: 'left',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(100,140,200,0.15)',
    fontSize: 11,
  },
  td: {
    padding: '7px 10px',
    borderBottom: '1px solid rgba(100,140,200,0.05)',
    whiteSpace: 'nowrap',
  },
  tdMono: {
    padding: '7px 10px',
    borderBottom: '1px solid rgba(100,140,200,0.05)',
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: 'nowrap',
    textAlign: 'right',
  },
  tdCenter: {
    padding: '7px 10px',
    borderBottom: '1px solid rgba(100,140,200,0.05)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  trEven: {
    background: 'transparent',
  },
  trOdd: {
    background: 'rgba(25,35,65,0.3)',
  },

  emptyMsg: {
    textAlign: 'center',
    color: '#556677',
    padding: 40,
    fontSize: 14,
  },
};
