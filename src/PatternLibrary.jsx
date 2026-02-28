/**
 * 눌림목 패턴 라이브러리 UI / Dip Pattern Library Page
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * - 패턴 목록 조회 + 활성화/비활성화 토글
 * - ★ 전종목 눌림목 스캔 (신규)
 * - 종목별 패턴 평가 테스트
 * - 시장 상태 (KOSPI/KOSDAQ) 실시간 표시
 *
 * 파일경로: src/PatternLibrary.jsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = "https://web-production-139e9.up.railway.app";

const C = {
  bg: '#0a0e1a', card: '#111827', cardBorder: '#1e293b',
  accent: '#3b82f6', accentDim: 'rgba(59,130,246,0.15)',
  green: '#10b981', greenDim: 'rgba(16,185,129,0.15)',
  red: '#ef4444', redDim: 'rgba(239,68,68,0.15)',
  yellow: '#f59e0b', yellowDim: 'rgba(245,158,11,0.15)',
  purple: '#8b5cf6', purpleDim: 'rgba(139,92,246,0.15)',
  cyan: '#06b6d4', cyanDim: 'rgba(6,182,212,0.15)',
  orange: '#f97316', orangeDim: 'rgba(249,115,22,0.15)',
  text: '#e5e7eb', textDim: '#9ca3af', white: '#f9fafb',
};

const RISK_COLORS = { low: C.green, medium: C.yellow, high: C.red };
const RISK_LABELS = { low: '저위험', medium: '중위험', high: '고위험' };
const PATTERN_ICONS = { P001: '🏛️', P002: '📐', P003: '⚡' };
const PATTERN_NAMES = { P001: '기준봉 중심가 지지', P002: '이평선 수렴 돌파', P003: '세이크아웃' };
const fmt = (n) => n?.toLocaleString() ?? '-';

export default function PatternLibrary() {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);
  const [market, setMarket] = useState(null);
  const [marketLoading, setMarketLoading] = useState(false);

  // 종목 테스트
  const [testCode, setTestCode] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');
  const [requireGates, setRequireGates] = useState(true);

  // ★ 전종목 스캔
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanGates, setScanGates] = useState(true);
  const scanPollRef = useRef(null);

  // ── 패턴 목록 로드 ──
  const loadPatterns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/pattern-library/list`);
      const data = await res.json();
      if (data.success) setPatterns(data.patterns || []);
    } catch (e) {
      console.error('패턴 목록 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 시장 상태 로드 ──
  const loadMarket = useCallback(async () => {
    try {
      setMarketLoading(true);
      const res = await fetch(`${API}/api/pattern-library/market-status`);
      const data = await res.json();
      if (data.success) setMarket(data.market);
    } catch (e) {
      console.error('시장 상태 로드 실패:', e);
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatterns();
    loadMarket();
    _checkPreviousResult();
  }, [loadPatterns, loadMarket]);

  // 이전 스캔 결과 복원
  const _checkPreviousResult = async () => {
    try {
      const res = await fetch(`${API}/api/pattern-library/scan-progress`);
      const prog = await res.json();
      if (prog.running) {
        setScanning(true);
        setScanProgress(prog);
        _startPolling();
      } else if (prog.progress === 100) {
        const resR = await fetch(`${API}/api/pattern-library/scan-result`);
        const data = await resR.json();
        if (data.status === 'done') {
          setScanResult(data);
          setScanProgress({ ...prog, running: false });
        }
      }
    } catch (e) { /* ignore */ }
  };

  useEffect(() => () => {
    if (scanPollRef.current) clearInterval(scanPollRef.current);
  }, []);

  // ── 패턴 토글 ──
  const togglePattern = async (code) => {
    try {
      setToggling(code);
      const res = await fetch(`${API}/api/pattern-library/${code}/toggle`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        setPatterns(prev => prev.map(p =>
          p.pattern_code === code ? { ...p, is_active: data.is_active } : p
        ));
      }
    } catch (e) {
      console.error('토글 실패:', e);
    } finally {
      setToggling(null);
    }
  };

  // ── 종목 테스트 ──
  const runTest = async () => {
    if (!testCode.trim()) return;
    try {
      setTesting(true);
      setTestError('');
      setTestResult(null);
      const res = await fetch(`${API}/api/pattern-library/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_code: testCode.trim(), require_gates: requireGates }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(data);
      } else {
        setTestError(data.detail || '평가 실패');
      }
    } catch (e) {
      setTestError(e.message);
    } finally {
      setTesting(false);
    }
  };

  // ── ★ 전종목 스캔 ──
  const startScan = async () => {
    try {
      setScanning(true);
      setScanResult(null);
      setScanProgress({ running: true, progress: 0, scanned: 0, total: 0, found: 0, deactivated: 0, message: '시작 중...' });
      const res = await fetch(`${API}/api/pattern-library/scan-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ require_gates: scanGates, min_score: 55 }),
      });
      const data = await res.json();
      if (data.success) {
        _startPolling();
      } else {
        setScanning(false);
        setScanProgress({ message: data.message || '스캔 시작 실패' });
      }
    } catch (e) {
      setScanning(false);
      setScanProgress({ message: `오류: ${e.message}` });
    }
  };

  const stopScan = async () => {
    try { await fetch(`${API}/api/pattern-library/scan-stop`, { method: 'POST' }); } catch (e) { /* ignore */ }
  };

  const _startPolling = () => {
    if (scanPollRef.current) clearInterval(scanPollRef.current);
    scanPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/pattern-library/scan-progress`);
        const prog = await res.json();
        setScanProgress(prog);
        if (!prog.running) {
          clearInterval(scanPollRef.current);
          scanPollRef.current = null;
          setScanning(false);
          const resR = await fetch(`${API}/api/pattern-library/scan-result`);
          const data = await resR.json();
          if (data.status === 'done') setScanResult(data);
        }
      } catch (e) { console.error('진행률 조회 실패:', e); }
    }, 2000);
  };

  // ════════════════════════════════════════════
  // 렌더링
  // ════════════════════════════════════════════

  const MarketStatus = () => {
    if (!market) return null;
    const k = market.kospi || {};
    const q = market.kosdaq || {};
    const canBuy = market.can_buy;
    return (
      <div style={{ background: canBuy ? C.greenDim : C.redDim, border: `1px solid ${canBuy ? C.green : C.red}40`, borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{canBuy ? '🟢' : '🔴'}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: canBuy ? C.green : C.red }}>{canBuy ? '매수 허용' : '매수 차단'}</span>
          </div>
          <button onClick={loadMarket} disabled={marketLoading}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.textDim, cursor: 'pointer' }}>
            {marketLoading ? '조회 중...' : '🔄 새로고침'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <IndexCard label="KOSPI" data={k} />
          <IndexCard label="KOSDAQ" data={q} />
        </div>
        {!canBuy && market.reason && (
          <div style={{ marginTop: 10, fontSize: 11, color: C.red, lineHeight: 1.5, padding: '6px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>⚠️ {market.reason}</div>
        )}
      </div>
    );
  };

  const IndexCard = ({ label, data }) => {
    const pct = data.change_pct || 0;
    const color = pct >= 0 ? C.red : C.accent;
    const trend = data.trend || '—';
    const trendColor = trend === '상승' ? C.red : trend === '하락' ? C.accent : C.textDim;
    return (
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{data.close ? fmt(Math.round(data.close)) : '—'}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color }}>{pct >= 0 ? '+' : ''}{pct}%</span>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: C.textDim }}>
          <span>MA5 <b style={{ color: '#ffcc00' }}>{data.ma5 ? fmt(Math.round(data.ma5)) : '—'}</b></span>
          <span>MA20 <b style={{ color: '#ff6699' }}>{data.ma20 ? fmt(Math.round(data.ma20)) : '—'}</b></span>
          <span style={{ color: trendColor, fontWeight: 600 }}>{trend}</span>
        </div>
      </div>
    );
  };

  const PatternCard = ({ p }) => {
    const risk = RISK_COLORS[p.risk_level] || C.yellow;
    const riskLabel = RISK_LABELS[p.risk_level] || p.risk_level;
    const icon = PATTERN_ICONS[p.pattern_code] || '📊';
    return (
      <div style={{ background: p.is_active ? C.card : 'rgba(17,24,39,0.5)', border: `1px solid ${p.is_active ? C.cardBorder : 'rgba(30,41,59,0.4)'}`, borderRadius: 12, padding: 16, opacity: p.is_active ? 1 : 0.6, transition: 'all 0.2s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: p.is_active ? C.text : C.textDim }}>{p.pattern_name}</div>
              <div style={{ fontSize: 11, color: C.textDim, fontFamily: 'JetBrains Mono, monospace' }}>{p.pattern_code}</div>
            </div>
          </div>
          <button onClick={() => togglePattern(p.pattern_code)} disabled={toggling === p.pattern_code}
            style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: p.is_active ? C.green : '#374151', position: 'relative', transition: 'background 0.2s' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: C.white, position: 'absolute', top: 3, left: p.is_active ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6, marginBottom: 12, minHeight: 48 }}>{p.description}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: `${risk}20`, color: risk, fontWeight: 600 }}>{riskLabel}</span>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: C.accentDim, color: C.accent, fontWeight: 600 }}>기대수익 {p.expected_return}</span>
          {p.has_engine && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: C.greenDim, color: C.green, fontWeight: 600 }}>✓ 엔진 연결</span>}
        </div>
      </div>
    );
  };

  // ── ★ 전종목 스캔 섹션 ──
  const ScanSection = () => {
    const prog = scanProgress;
    const hasResult = scanResult && scanResult.stocks && scanResult.stocks.length > 0;
    return (
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>🔍 전종목 눌림목 스캔</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => !scanning && setScanGates(!scanGates)}
              style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: `1px solid ${scanGates ? C.cyan : '#374151'}40`, background: scanGates ? C.cyanDim : 'transparent', color: scanGates ? C.cyan : C.textDim, cursor: scanning ? 'default' : 'pointer' }}>
              Gate {scanGates ? 'ON' : 'OFF'}
            </button>
            {scanning ? (
              <button onClick={stopScan}
                style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: C.red, color: C.white, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                ⏹ 중지
              </button>
            ) : (
              <button onClick={startScan}
                style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: C.orange, color: C.white, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                🚀 전종목 스캔
              </button>
            )}
          </div>
        </div>

        {/* 진행률 */}
        {prog && (scanning || prog.progress > 0) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: C.textDim }}>{prog.message || '...'}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: C.orange }}>{prog.progress || 0}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(249,115,22,0.1)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: scanning ? `linear-gradient(90deg, ${C.orange}, #fb923c)` : C.green, width: `${prog.progress || 0}%`, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 10, color: C.textDim }}>
              <span>스캔: <b style={{ color: C.text }}>{fmt(prog.scanned)}</b>/{fmt(prog.total)}</span>
              <span>발견: <b style={{ color: C.green }}>{prog.found || 0}</b></span>
              {(prog.deactivated || 0) > 0 && <span>비활성화: <b style={{ color: C.red }}>{prog.deactivated}</b></span>}
            </div>
          </div>
        )}

        {/* 결과 테이블 */}
        {hasResult && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.green, marginBottom: 8 }}>
              ✅ {scanResult.stocks.length}개 눌림목 종목 발견
              <span style={{ fontSize: 10, fontWeight: 400, color: C.textDim, marginLeft: 8 }}>
                {scanResult.scan_date ? new Date(scanResult.scan_date).toLocaleString('ko-KR') : ''}
              </span>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto', borderRadius: 8, border: `1px solid ${C.cardBorder}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.3)', position: 'sticky', top: 0 }}>
                    <th style={thStyle}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>종목</th>
                    <th style={thStyle}>현재가</th>
                    <th style={thStyle}>등락</th>
                    <th style={thStyle}>패턴</th>
                    <th style={thStyle}>점수</th>
                    <th style={thStyle}>Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {scanResult.stocks.map((s, idx) => {
                    const pctColor = s.change_pct >= 0 ? C.red : C.accent;
                    const scoreColor = s.score >= 80 ? C.green : s.score >= 65 ? C.yellow : C.orange;
                    return (
                      <tr key={s.code} style={{ borderTop: `1px solid ${C.cardBorder}`, cursor: 'pointer' }}
                        onClick={() => { setTestCode(s.code); }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={tdStyle}>{idx + 1}</td>
                        <td style={{ ...tdStyle, textAlign: 'left' }}>
                          <div style={{ fontWeight: 600 }}>{s.name}</div>
                          <div style={{ fontSize: 10, color: C.textDim, fontFamily: 'JetBrains Mono, monospace' }}>{s.code}</div>
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{fmt(s.price)}</td>
                        <td style={{ ...tdStyle, color: pctColor, fontWeight: 600 }}>{s.change_pct >= 0 ? '+' : ''}{s.change_pct}%</td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: C.purpleDim, color: C.purple }}>
                            {PATTERN_ICONS[s.best_pattern] || '📊'} {PATTERN_NAMES[s.best_pattern] || s.best_pattern}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: scoreColor, fontFamily: 'JetBrains Mono, monospace' }}>{s.score}</td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 10, color: s.gates_passed ? C.green : C.yellow }}>{s.gates_passed ? '✓' : '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!scanning && prog && prog.progress === 100 && (!scanResult || !scanResult.stocks || scanResult.stocks.length === 0) && (
          <div style={{ textAlign: 'center', padding: 20, color: C.textDim, fontSize: 12 }}>
            스캔 완료 — 현재 눌림목 조건에 부합하는 종목이 없습니다
          </div>
        )}
        {!scanning && (!prog || prog.progress === 0) && !hasResult && (
          <div style={{ textAlign: 'center', padding: 16, color: C.textDim, fontSize: 12 }}>
            활성화된 패턴(P001/P002/P003)으로 전종목을 일괄 체크합니다
          </div>
        )}
      </div>
    );
  };

  // ── 테스트 결과 ──
  const TestResult = () => {
    if (!testResult) return null;
    const ev = testResult.evaluation;
    const isDip = ev.is_dip;
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ background: isDip ? C.greenDim : 'rgba(107,114,128,0.1)', border: `1px solid ${isDip ? C.green : '#6b7280'}40`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 20 }}>{isDip ? '✅' : '❌'}</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: isDip ? C.green : C.textDim }}>{isDip ? '눌림목 감지!' : '눌림목 미감지'}</span>
            {testResult.stock_name && testResult.stock_name !== testResult.stock_code && (
              <span style={{ fontSize: 12, color: C.textDim }}>{testResult.stock_name} ({testResult.stock_code})</span>
            )}
            {ev.best_pattern && (
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: C.purpleDim, color: C.purple, fontWeight: 600 }}>{ev.best_pattern}</span>
            )}
          </div>
          {ev.total_score > 0 && (
            <div style={{ fontSize: 12, color: C.textDim }}>종합 점수: <b style={{ color: C.text }}>{ev.total_score}점</b> / 분석 캔들: {testResult.candle_count}일</div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <GateBox label="Gate 1: 거래량 절벽" gate={ev.gates.volume_cliff} />
          <GateBox label="Gate 2: 변동성 스퀴즈" gate={ev.gates.volatility_squeeze} />
        </div>
        {ev.matched_patterns && ev.matched_patterns.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>매칭된 패턴</div>
            {ev.matched_patterns.map((mp, i) => (
              <div key={i} style={{ padding: '8px 0', borderTop: i > 0 ? `1px solid ${C.cardBorder}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{PATTERN_ICONS[mp.code] || '📊'} {mp.name} <span style={{ color: C.textDim, fontSize: 11 }}>({mp.code})</span></span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: mp.score >= 70 ? C.green : C.yellow }}>{mp.score}점</span>
                </div>
                <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>{mp.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const GateBox = ({ label, gate }) => {
    const passed = gate?.passed;
    return (
      <div style={{ background: passed ? 'rgba(16,185,129,0.06)' : 'rgba(107,114,128,0.06)', border: `1px solid ${passed ? C.green : '#6b7280'}30`, borderRadius: 8, padding: '8px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: passed ? C.green : C.textDim, marginBottom: 3 }}>{passed ? '✓' : '✗'} {label}</div>
        <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.4 }}>{gate?.detail || '—'}</div>
      </div>
    );
  };

  // ── 메인 렌더 ──
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 16px 60px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>📚 눌림목 패턴 라이브러리</h2>
        <p style={{ fontSize: 12, color: C.textDim, margin: '4px 0 0' }}>세력 매집 패턴 자동 감지 — Gate 2개 + 패턴 3개 복합 판정</p>
      </div>

      <MarketStatus />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.textDim }}>패턴 목록 로딩 중...</div>
      ) : patterns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.textDim }}>❌ 패턴 정의가 없습니다.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
          {patterns.map(p => <PatternCard key={p.pattern_code} p={p} />)}
        </div>
      )}

      <ScanSection />

      {/* 게이트 설명 */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.text }}>🚪 공통 필수 게이트</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: 10, background: 'rgba(6,182,212,0.06)', borderRadius: 8, border: `1px solid ${C.cyan}20` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.cyan, marginBottom: 4 }}>Gate 1: 거래량 절벽</div>
            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>전일 대비 거래량 20% 이하 <b>또는</b> 최근 5일 평균 대비 30% 이하</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(6,182,212,0.06)', borderRadius: 8, border: `1px solid ${C.cyan}20` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.cyan, marginBottom: 4 }}>Gate 2: 변동성 스퀴즈</div>
            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>일중 변동률이 20일 평균의 50% 이하, <b>연속 2일 이상</b> 유지</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 8 }}>→ 두 게이트 모두 통과한 종목만 패턴 체크 진행</div>
      </div>

      {/* 종목 테스트 */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>🧪 종목 패턴 테스트</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input value={testCode} onChange={e => setTestCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && runTest()}
            placeholder="종목명 또는 코드 (예: 삼성전자, 005930)"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#0d1321', border: `1px solid ${C.cardBorder}`, color: C.text, fontSize: 13, outline: 'none' }} />
          <button onClick={runTest} disabled={testing || !testCode.trim()}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: testing ? '#6b7280' : C.accent, color: C.white, fontWeight: 600, fontSize: 13, cursor: testing ? 'default' : 'pointer' }}>
            {testing ? '분석 중...' : '🔍 평가'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <button onClick={() => setRequireGates(!requireGates)}
            style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: requireGates ? C.cyan : '#374151', position: 'relative', transition: 'background 0.2s' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: C.white, position: 'absolute', top: 3, left: requireGates ? 19 : 3, transition: 'left 0.2s' }} />
          </button>
          <span style={{ fontSize: 11, color: C.textDim }}>게이트 필수 {requireGates ? '(Gate 1+2 통과 필요)' : '(게이트 무시, 패턴만 체크)'}</span>
        </div>
        {testError && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: C.redDim, color: C.red, fontSize: 12 }}>❌ {testError}</div>
        )}
        <TestResult />
      </div>
    </div>
  );
}

const thStyle = { padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textAlign: 'center', whiteSpace: 'nowrap' };
const tdStyle = { padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' };
