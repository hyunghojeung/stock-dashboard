/**
 * 급상승 패턴 탐지기 — DTW 기반
 * Pattern Surge Detector — DTW-based
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 파일경로: src/pages/PatternDetector.jsx
 *
 * - 종목 검색 & 추가
 * - 비동기 분석 (진행률 표시)
 * - 프리셋: 우량주 / 작전주 / 사용자정의
 * - 3 탭: 📊 공통패턴 | 📈 차트오버레이 | 🎯 매수추천
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = "https://web-production-139e9.up.railway.app";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 프리셋 정의 / Preset Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PRESETS = {
  bluechip: {
    key: 'bluechip',
    label: '🏢 우량주 모드',
    desc: '대형주 실적·눌림목 기반 급상승 탐지',
    color: '#3b82f6',
    params: {
      periodDays: 365,
      preRiseDays: 10,
      risePct: 30,
      riseWindow: 5,
      weightReturns: 0.5,
      weightCandle: 0.2,
      weightVolume: 0.3,
    },
  },
  manipulation: {
    key: 'manipulation',
    label: '⚡ 작전주 모드',
    desc: '세력 매집기 패턴 탐지 (거래량 중심)',
    color: '#ef4444',
    params: {
      periodDays: 730,
      preRiseDays: 30,
      risePct: 50,
      riseWindow: 10,
      weightReturns: 0.3,
      weightCandle: 0.2,
      weightVolume: 0.5,
    },
  },
  custom: {
    key: 'custom',
    label: '🔧 사용자 정의',
    desc: '직접 파라미터를 설정합니다',
    color: '#f59e0b',
    params: null, // 사용자가 직접 설정
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 스타일 상수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const COLORS = {
  bg: '#0a0e1a',
  card: '#111827',
  cardBorder: '#1e293b',
  accent: '#3b82f6',
  accentDim: 'rgba(59,130,246,0.15)',
  green: '#10b981',
  greenDim: 'rgba(16,185,129,0.15)',
  red: '#ef4444',
  redDim: 'rgba(239,68,68,0.15)',
  yellow: '#f59e0b',
  yellowDim: 'rgba(245,158,11,0.15)',
  gray: '#6b7280',
  grayLight: '#9ca3af',
  text: '#e5e7eb',
  textDim: '#9ca3af',
  white: '#f9fafb',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 유틸 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const fmt = (n) => n?.toLocaleString() ?? '-';
const fmtPct = (n) => n != null ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '-';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function PatternDetector() {
  // ── 종목 관리 ──
  const [stocks, setStocks] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);
  const searchTimerRef = useRef(null);

  // ── 프리셋 ──
  const [activePreset, setActivePreset] = useState('bluechip');

  // ── 설정 ──
  const [periodDays, setPeriodDays] = useState(365);
  const [preRiseDays, setPreRiseDays] = useState(10);
  const [risePct, setRisePct] = useState(30);
  const [riseWindow, setRiseWindow] = useState(5);
  const [weightReturns, setWeightReturns] = useState(0.5);
  const [weightCandle, setWeightCandle] = useState(0.2);
  const [weightVolume, setWeightVolume] = useState(0.3);
  const [showSettings, setShowSettings] = useState(false);

  // ── 분석 상태 ──
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // ── 탭 ──
  const [activeTab, setActiveTab] = useState(0);

  // ── 프리셋 변경 시 파라미터 자동 적용 ──
  const applyPreset = (presetKey) => {
    setActivePreset(presetKey);
    const preset = PRESETS[presetKey];
    if (preset.params) {
      setPeriodDays(preset.params.periodDays);
      setPreRiseDays(preset.params.preRiseDays);
      setRisePct(preset.params.risePct);
      setRiseWindow(preset.params.riseWindow);
      setWeightReturns(preset.params.weightReturns);
      setWeightCandle(preset.params.weightCandle);
      setWeightVolume(preset.params.weightVolume);
    }
    // 사용자정의 선택 시 설정 패널 자동 열기
    if (presetKey === 'custom') {
      setShowSettings(true);
    }
  };

  // ── 종목 검색 (디바운스) ──
  useEffect(() => {
    if (!searchKeyword.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/pattern/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: searchKeyword.trim() }),
        });
        const data = await resp.json();
        setSearchResults(data.results || []);
        setShowDropdown(true);
      } catch (e) {
        console.error('검색 실패:', e);
      }
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchKeyword]);

  // ── 외부 클릭 시 드롭다운 닫기 ──
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── 종목 추가 ──
  const addStock = (code, name) => {
    if (stocks.find(s => s.code === code)) return;
    if (stocks.length >= 20) { alert('최대 20개까지 추가 가능합니다.'); return; }
    setStocks(prev => [...prev, { code, name }]);
    setSearchKeyword('');
    setShowDropdown(false);
  };

  const removeStock = (code) => {
    setStocks(prev => prev.filter(s => s.code !== code));
  };

  // ── 분석 시작 ──
  const startAnalysis = async () => {
    if (stocks.length === 0) { setError('종목을 1개 이상 추가하세요.'); return; }
    setError('');
    setResult(null);
    setAnalyzing(true);
    setProgress(0);
    setProgressMsg('분석 요청 중...');

    try {
      const names = {};
      stocks.forEach(s => { names[s.code] = s.name; });

      const resp = await fetch(`${API_BASE}/api/pattern/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codes: stocks.map(s => s.code),
          names,
          period_days: periodDays,
          pre_rise_days: preRiseDays,
          rise_pct: risePct,
          rise_window: riseWindow,
          weight_returns: weightReturns,
          weight_candle: weightCandle,
          weight_volume: weightVolume,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || '분석 요청 실패');
      }

      pollProgress();
    } catch (e) {
      setError(e.message);
      setAnalyzing(false);
    }
  };

  // ── 진행률 폴링 ──
  const pollProgress = useCallback(() => {
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/pattern/progress`);
        const data = await resp.json();

        setProgress(data.progress || 0);
        setProgressMsg(data.message || '');

        if (!data.running) {
          clearInterval(interval);
          if (data.error) {
            setError(data.error);
            setAnalyzing(false);
          } else if (data.has_result) {
            const resResp = await fetch(`${API_BASE}/api/pattern/result`);
            const resData = await resResp.json();
            if (resData.status === 'done') {
              setResult(resData);
              setActiveTab(0);
            } else if (resData.status === 'error') {
              setError(resData.error);
            }
            setAnalyzing(false);
          }
        }
      } catch (e) {
        clearInterval(interval);
        setError('진행률 조회 실패');
        setAnalyzing(false);
      }
    }, 1000);
  }, []);

  // 현재 프리셋 정보
  const currentPreset = PRESETS[activePreset];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'Pretendard', -apple-system, sans-serif",
      padding: '20px',
      maxWidth: 1100,
      margin: '0 auto',
    }}>
      {/* ── 헤더 ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: 22, fontWeight: 700, margin: 0,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 26 }}>🔍</span>
          급상승 패턴 탐지기
          <span style={{
            fontSize: 11, background: COLORS.accentDim, color: COLORS.accent,
            padding: '3px 10px', borderRadius: 20, fontWeight: 500,
          }}>DTW Engine</span>
        </h1>
        <p style={{ color: COLORS.textDim, fontSize: 13, marginTop: 6 }}>
          여러 종목의 급상승 직전 일봉 패턴을 DTW로 비교 분석합니다
        </p>
      </div>

      {/* ── 프리셋 선택 ── */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap',
      }}>
        {Object.values(PRESETS).map(preset => {
          const isActive = activePreset === preset.key;
          return (
            <button
              key={preset.key}
              onClick={() => applyPreset(preset.key)}
              disabled={analyzing}
              style={{
                flex: '1 1 auto', minWidth: 180,
                padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
                background: isActive ? `${preset.color}15` : COLORS.card,
                border: `2px solid ${isActive ? preset.color : COLORS.cardBorder}`,
                textAlign: 'left', transition: 'all 0.2s',
                opacity: analyzing ? 0.5 : 1,
              }}
            >
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: isActive ? preset.color : COLORS.text,
                marginBottom: 4,
              }}>
                {preset.label}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4 }}>
                {preset.desc}
              </div>
              {isActive && preset.params && (
                <div style={{
                  marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap',
                }}>
                  <span style={tagStyle(preset.color)}>분석 {preset.params.preRiseDays}일</span>
                  <span style={tagStyle(preset.color)}>급상승 +{preset.params.risePct}%</span>
                  <span style={tagStyle(preset.color)}>기간 {preset.params.riseWindow}일</span>
                  <span style={tagStyle(preset.color)}>거래량 {(preset.params.weightVolume * 100).toFixed(0)}%</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 종목 검색 & 추가 ── */}
      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12, padding: 18, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* 검색창 */}
          <div ref={searchRef} style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <input
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="종목명 또는 코드 검색..."
              disabled={analyzing}
              style={{
                width: '100%', padding: '10px 14px', fontSize: 14,
                background: '#1a2234', border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 8, color: COLORS.text, outline: 'none',
              }}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            />
            {showDropdown && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#1a2234', border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 8, marginTop: 4, maxHeight: 240, overflowY: 'auto',
                zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {searchResults.map((r, i) => (
                  <div
                    key={r.code}
                    onClick={() => addStock(r.code, r.name)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                      borderBottom: i < searchResults.length - 1 ? `1px solid ${COLORS.cardBorder}` : 'none',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span style={{ color: COLORS.textDim, fontSize: 12 }}>{r.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 설정 토글 */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '10px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
              background: showSettings ? COLORS.accentDim : 'transparent',
              color: showSettings ? COLORS.accent : COLORS.textDim,
              border: `1px solid ${showSettings ? COLORS.accent : COLORS.cardBorder}`,
              transition: 'all 0.2s',
            }}
          >⚙️ 상세설정</button>

          {/* 분석 버튼 */}
          <button
            onClick={startAnalysis}
            disabled={analyzing || stocks.length === 0}
            style={{
              padding: '10px 24px', fontSize: 14, fontWeight: 600,
              borderRadius: 8, border: 'none', cursor: analyzing ? 'wait' : 'pointer',
              background: analyzing ? COLORS.gray :
                stocks.length === 0 ? '#374151' : currentPreset.color,
              color: stocks.length === 0 ? COLORS.textDim : COLORS.white,
              transition: 'all 0.2s',
              opacity: analyzing ? 0.7 : 1,
            }}
          >
            {analyzing ? '분석 중...' : '🔍 분석 시작'}
          </button>
        </div>

        {/* 설정 패널 */}
        {showSettings && (
          <div style={{
            marginTop: 14, padding: 14, background: '#0d1321', borderRadius: 8,
          }}>
            {/* 기본 파라미터 */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12,
              marginBottom: 14,
            }}>
              {[
                { label: '조회 기간', value: periodDays, setter: setPeriodDays,
                  options: [{ v: 180, l: '6개월' }, { v: 365, l: '1년' }, { v: 730, l: '2년' }, { v: 1095, l: '3년' }] },
                { label: '사전 분석일', value: preRiseDays, setter: setPreRiseDays,
                  options: [{ v: 5, l: '5일' }, { v: 10, l: '10일' }, { v: 20, l: '20일' }, { v: 30, l: '30일' }, { v: 40, l: '40일' }] },
                { label: '급상승 기준', value: risePct, setter: setRisePct,
                  options: [{ v: 15, l: '+15%' }, { v: 20, l: '+20%' }, { v: 30, l: '+30%' }, { v: 50, l: '+50%' }, { v: 100, l: '+100%' }] },
                { label: '상승 기간', value: riseWindow, setter: setRiseWindow,
                  options: [{ v: 3, l: '3일' }, { v: 5, l: '5일' }, { v: 10, l: '10일' }, { v: 15, l: '15일' }] },
              ].map(cfg => (
                <div key={cfg.label}>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>{cfg.label}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {cfg.options.map(opt => (
                      <button
                        key={opt.v}
                        onClick={() => { cfg.setter(opt.v); setActivePreset('custom'); }}
                        style={{
                          flex: '1 1 auto', padding: '5px 4px', fontSize: 11, borderRadius: 6,
                          border: `1px solid ${cfg.value === opt.v ? COLORS.accent : COLORS.cardBorder}`,
                          background: cfg.value === opt.v ? COLORS.accentDim : 'transparent',
                          color: cfg.value === opt.v ? COLORS.accent : COLORS.textDim,
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >{opt.l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* DTW 가중치 슬라이더 */}
            <div style={{
              borderTop: `1px solid ${COLORS.cardBorder}`, paddingTop: 14,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 10 }}>
                📊 DTW 비교 가중치 (합계 100%)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { label: '📈 등락률', value: weightReturns, setter: setWeightReturns, color: '#3b82f6' },
                  { label: '🕯️ 봉모양', value: weightCandle, setter: setWeightCandle, color: '#f59e0b' },
                  { label: '📊 거래량', value: weightVolume, setter: setWeightVolume, color: '#10b981' },
                ].map(w => (
                  <div key={w.label}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: 11, color: COLORS.textDim, marginBottom: 6,
                    }}>
                      <span>{w.label}</span>
                      <span style={{ color: w.color, fontWeight: 700 }}>
                        {(w.value * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0} max={80} step={5}
                      value={w.value * 100}
                      onChange={e => {
                        const newVal = parseInt(e.target.value) / 100;
                        w.setter(newVal);
                        setActivePreset('custom');
                        // 나머지 두 가중치 자동 조정
                        const others = [
                          { label: '📈 등락률', value: weightReturns, setter: setWeightReturns },
                          { label: '🕯️ 봉모양', value: weightCandle, setter: setWeightCandle },
                          { label: '📊 거래량', value: weightVolume, setter: setWeightVolume },
                        ].filter(x => x.label !== w.label);
                        const remaining = 1 - newVal;
                        const otherSum = others[0].value + others[1].value;
                        if (otherSum > 0) {
                          others[0].setter(Math.round(others[0].value / otherSum * remaining * 100) / 100);
                          others[1].setter(Math.round(others[1].value / otherSum * remaining * 100) / 100);
                        } else {
                          others[0].setter(remaining / 2);
                          others[1].setter(remaining / 2);
                        }
                      }}
                      style={{
                        width: '100%', height: 6, borderRadius: 3,
                        accentColor: w.color, cursor: 'pointer',
                      }}
                    />
                  </div>
                ))}
              </div>
              {/* 가중치 시각 바 */}
              <div style={{
                display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10,
              }}>
                <div style={{ width: `${weightReturns * 100}%`, background: '#3b82f6' }} />
                <div style={{ width: `${weightCandle * 100}%`, background: '#f59e0b' }} />
                <div style={{ width: `${weightVolume * 100}%`, background: '#10b981' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>
                <span>등락률 {(weightReturns*100).toFixed(0)}%</span>
                <span>봉모양 {(weightCandle*100).toFixed(0)}%</span>
                <span>거래량 {(weightVolume*100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* 선택된 종목 태그 */}
        {stocks.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stocks.map(s => (
              <span key={s.code} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', background: '#1a2234', borderRadius: 20,
                fontSize: 13, border: `1px solid ${COLORS.cardBorder}`,
              }}>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{ color: COLORS.textDim, fontSize: 11 }}>{s.code}</span>
                <span
                  onClick={() => !analyzing && removeStock(s.code)}
                  style={{
                    cursor: analyzing ? 'default' : 'pointer',
                    color: COLORS.red, fontSize: 14, marginLeft: 2,
                    opacity: analyzing ? 0.3 : 0.7,
                  }}
                >✕</span>
              </span>
            ))}
            <span style={{ fontSize: 12, color: COLORS.textDim, alignSelf: 'center' }}>
              {stocks.length}개 종목
            </span>
          </div>
        )}
      </div>

      {/* ── 진행률 바 ── */}
      {analyzing && (
        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12, padding: 18, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>⏳ 분석 진행 중</span>
            <span style={{ fontSize: 13, color: currentPreset.color, fontWeight: 700 }}>{progress}%</span>
          </div>
          <div style={{
            height: 8, background: '#1a2234', borderRadius: 4, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: `linear-gradient(90deg, ${currentPreset.color}, ${COLORS.green})`,
              borderRadius: 4, transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 6 }}>
            {progressMsg}
          </div>
        </div>
      )}

      {/* ── 에러 ── */}
      {error && (
        <div style={{
          background: COLORS.redDim, border: `1px solid ${COLORS.red}`,
          borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13, color: COLORS.red,
        }}>
          ❌ {error}
          <span
            onClick={() => setError('')}
            style={{ float: 'right', cursor: 'pointer', fontWeight: 700 }}
          >✕</span>
        </div>
      )}

      {/* ── 결과 영역 ── */}
      {result && (
        <>
          {/* 요약 카드 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12, marginBottom: 16,
          }}>
            {[
              { label: '분석 종목', value: result.total_stocks, unit: '개', color: COLORS.accent },
              { label: '급상승 발견', value: result.total_surges, unit: '건', color: COLORS.green },
              { label: '패턴 추출', value: result.total_patterns, unit: '개', color: COLORS.yellow },
              { label: '패턴 그룹', value: result.clusters?.length || 0, unit: '개', color: COLORS.accent },
              { label: '평균 상승률', value: result.summary?.avg_rise_pct, unit: '%', color: COLORS.red },
              { label: '평균 상승일', value: result.summary?.avg_rise_days, unit: '일', color: COLORS.grayLight },
            ].map((item, i) => (
              <div key={i} style={{
                background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 10, padding: 14, textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>
                  {typeof item.value === 'number' ? item.value.toLocaleString() : '-'}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>{item.unit}</div>
              </div>
            ))}
          </div>

          {/* 탭 헤더 */}
          <div style={{
            display: 'flex', gap: 4, marginBottom: 16,
            background: COLORS.card, borderRadius: 10, padding: 4,
            border: `1px solid ${COLORS.cardBorder}`,
          }}>
            {['📊 공통 패턴', '📈 차트 오버레이', '🎯 매수 추천'].map((tab, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                style={{
                  flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600,
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  background: activeTab === i ? COLORS.accentDim : 'transparent',
                  color: activeTab === i ? COLORS.accent : COLORS.textDim,
                  transition: 'all 0.2s',
                }}
              >{tab}</button>
            ))}
          </div>

          {/* 탭 내용 */}
          {activeTab === 0 && <TabSummary result={result} />}
          {activeTab === 1 && <TabChart result={result} preRiseDays={preRiseDays} />}
          {activeTab === 2 && <TabRecommend result={result} />}
        </>
      )}

      {/* ── 초기 안내 ── */}
      {!result && !analyzing && (
        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12, padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔬</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            급상승 직전 패턴을 찾아보세요
          </h3>
          <p style={{ fontSize: 13, color: COLORS.textDim, lineHeight: 1.8 }}>
            종목을 추가하고 분석을 시작하면<br />
            DTW 알고리즘이 과거 급상승 직전 일봉 패턴을 자동으로 비교합니다
          </p>
          <div style={{
            marginTop: 20, display: 'inline-flex', gap: 24,
            fontSize: 12, color: COLORS.textDim,
          }}>
            <span>① 모드 선택</span>
            <span>→</span>
            <span>② 종목 추가</span>
            <span>→</span>
            <span>③ 분석 시작</span>
            <span>→</span>
            <span>④ 패턴 발견</span>
          </div>
        </div>
      )}
    </div>
  );
}

// 프리셋 태그 스타일
function tagStyle(color) {
  return {
    fontSize: 10, padding: '2px 8px', borderRadius: 10,
    background: `${color}20`, color: color, fontWeight: 500,
  };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tab 0: 공통 패턴 요약
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TabSummary({ result }) {
  const clusters = result.clusters || [];
  const summary = result.summary || {};

  return (
    <div>
      {summary.common_features?.length > 0 && (
        <div style={{
          background: COLORS.accentDim, border: `1px solid rgba(59,130,246,0.3)`,
          borderRadius: 10, padding: 16, marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: COLORS.accent }}>
            💡 공통 패턴 특징
          </div>
          {summary.common_features.map((f, i) => (
            <div key={i} style={{ fontSize: 13, color: COLORS.text, marginBottom: 4, paddingLeft: 12 }}>
              • {f}
            </div>
          ))}
        </div>
      )}

      {clusters.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: COLORS.textDim }}>
          유의미한 공통 패턴이 발견되지 않았습니다.
        </div>
      ) : (
        clusters.map((cluster, ci) => (
          <div key={ci} style={{
            background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 12, padding: 18, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <span style={{
                  fontSize: 11, background: COLORS.accentDim, color: COLORS.accent,
                  padding: '2px 10px', borderRadius: 12, fontWeight: 600,
                }}>패턴 #{ci + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 10 }}>
                  {cluster.pattern_count}건 발견
                </span>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textDim }}>
                유사도 {cluster.avg_similarity?.toFixed(1)}%
              </div>
            </div>

            <div style={{
              fontSize: 13, color: COLORS.text, marginBottom: 14,
              padding: 10, background: '#0d1321', borderRadius: 6, lineHeight: 1.6,
            }}>
              {cluster.description || '패턴 분석 중'}
            </div>

            {cluster.avg_return_flow?.length > 0 && (
              <MiniReturnChart returns={cluster.avg_return_flow} label="평균 등락률 흐름" />
            )}

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>소속 종목</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cluster.members?.map((m, mi) => (
                  <span key={mi} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 12,
                    background: '#1a2234', border: `1px solid ${COLORS.cardBorder}`,
                  }}>
                    {m.name}
                    <span style={{ color: COLORS.green, marginLeft: 4 }}>+{m.rise_pct}%</span>
                    <span style={{ color: COLORS.textDim, marginLeft: 4 }}>{m.surge_date}</span>
                  </span>
                ))}
              </div>
            </div>

            <div style={{
              display: 'flex', gap: 20, marginTop: 12, paddingTop: 12,
              borderTop: `1px solid ${COLORS.cardBorder}`, fontSize: 12,
            }}>
              <span>평균 상승: <b style={{ color: COLORS.red }}>+{cluster.avg_rise_pct}%</b></span>
              <span>평균 기간: <b>{cluster.avg_rise_days}일</b></span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tab 1: 차트 오버레이
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TabChart({ result, preRiseDays }) {
  const patterns = result.all_patterns || [];

  if (patterns.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: COLORS.textDim }}>
        차트를 표시할 패턴이 없습니다.
      </div>
    );
  }

  return (
    <div>
      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12, padding: 18, marginBottom: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
          📈 등락률 흐름 오버레이 (정규화)
        </div>
        <OverlayChart patterns={patterns} dataKey="returns" yLabel="등락률 (%)" />
      </div>

      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12, padding: 18, marginBottom: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
          📊 거래량 비율 오버레이 (20일 평균 대비)
        </div>
        <OverlayChart patterns={patterns} dataKey="volume_ratios" yLabel="거래량 배율" />
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
        🕯️ 개별 패턴 일봉
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        {patterns.slice(0, 12).map((p, i) => (
          <div key={i} style={{
            background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 10, padding: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {p.name} <span style={{ color: COLORS.textDim }}>({p.code})</span>
              </span>
              <span style={{ fontSize: 11, color: COLORS.green }}>
                +{p.surge?.rise_pct}% ({p.surge?.start_date})
              </span>
            </div>
            <MiniCandleChart candles={p.candles || []} />
          </div>
        ))}
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tab 2: 매수 추천
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TabRecommend({ result }) {
  const recs = result.recommendations || [];

  return (
    <div>
      {recs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: COLORS.textDim }}>
          매수 추천 데이터가 없습니다.
        </div>
      ) : (
        <div style={{
          background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 100px 80px',
            padding: '12px 18px', fontSize: 11, color: COLORS.textDim, fontWeight: 600,
            borderBottom: `1px solid ${COLORS.cardBorder}`, background: '#0d1321',
          }}>
            <span>종목</span>
            <span style={{ textAlign: 'right' }}>현재가</span>
            <span style={{ textAlign: 'center' }}>유사도</span>
            <span style={{ textAlign: 'center' }}>시그널</span>
          </div>

          {recs.map((rec, i) => {
            const simColor = rec.similarity >= 65 ? COLORS.green :
                            rec.similarity >= 50 ? COLORS.yellow :
                            rec.similarity >= 40 ? COLORS.grayLight : COLORS.gray;
            const sigBg = rec.signal_code === 'strong_buy' ? COLORS.greenDim :
                         rec.signal_code === 'watch' ? COLORS.yellowDim :
                         'transparent';

            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 100px 80px',
                padding: '12px 18px', alignItems: 'center',
                borderBottom: `1px solid ${COLORS.cardBorder}`,
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{rec.name}</div>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{rec.code}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
                  {fmt(rec.current_price)}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                    <div style={{
                      width: 50, height: 6, background: '#1a2234', borderRadius: 3, overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.min(rec.similarity, 100)}%`, height: '100%',
                        background: simColor, borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: simColor }}>
                      {rec.similarity}%
                    </span>
                  </div>
                </div>
                <div style={{
                  textAlign: 'center', fontSize: 11, fontWeight: 600,
                  padding: '3px 6px', borderRadius: 6, background: sigBg,
                }}>
                  {rec.signal}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: 16, padding: 12, borderRadius: 8,
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
        fontSize: 11, color: COLORS.yellow, lineHeight: 1.6,
      }}>
        ⚠️ 패턴 유사도는 과거 데이터 기반 통계이며, 미래 수익을 보장하지 않습니다.
        반드시 자체 판단과 리스크 관리를 병행하세요.
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 차트 컴포넌트: 미니 등락률 바 차트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MiniReturnChart({ returns, label }) {
  if (!returns || returns.length === 0) return null;

  const maxAbs = Math.max(...returns.map(Math.abs), 1);
  const W = 300, H = 60;
  const barW = Math.max(4, (W - 20) / returns.length - 2);

  return (
    <div>
      {label && <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 4 }}>{label}</div>}
      <svg width={W} height={H} style={{ display: 'block' }}>
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke={COLORS.cardBorder} strokeWidth={1} />
        {returns.map((r, i) => {
          const x = 10 + i * (barW + 2);
          const barH = (Math.abs(r) / maxAbs) * (H / 2 - 4);
          const y = r >= 0 ? H / 2 - barH : H / 2;
          const color = r >= 0 ? COLORS.red : COLORS.accent;
          return (
            <rect key={i} x={x} y={y} width={barW} height={Math.max(barH, 1)}
              fill={color} rx={1} opacity={0.8} />
          );
        })}
        <text x={10} y={H - 1} fontSize={8} fill={COLORS.textDim}>D-{returns.length}</text>
        <text x={W - 20} y={H - 1} fontSize={8} fill={COLORS.textDim}>D-1</text>
      </svg>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 차트 컴포넌트: 오버레이 라인 차트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OverlayChart({ patterns, dataKey, yLabel }) {
  if (!patterns || patterns.length === 0) return null;

  const W = 700, H = 220, PAD = 40;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  const palette = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4',
    '#84cc16', '#e11d48',
  ];

  const allSeries = patterns.map(p => p[dataKey] || []);
  const maxLen = Math.max(...allSeries.map(s => s.length));
  const allVals = allSeries.flat();
  if (allVals.length === 0) return null;

  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;

  const toX = (i, len) => PAD + (i / Math.max(len - 1, 1)) * plotW;
  const toY = (v) => PAD + (1 - (v - minVal) / range) * plotH;

  return (
    <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
      <rect x={PAD} y={PAD} width={plotW} height={plotH}
        fill="rgba(13,19,33,0.5)" rx={4} />

      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = PAD + pct * plotH;
        const val = maxVal - pct * range;
        return (
          <g key={i}>
            <line x1={PAD} y1={y} x2={PAD + plotW} y2={y}
              stroke={COLORS.cardBorder} strokeDasharray="3,3" />
            <text x={PAD - 4} y={y + 4} fontSize={9} fill={COLORS.textDim}
              textAnchor="end">{val.toFixed(1)}</text>
          </g>
        );
      })}

      {dataKey === 'returns' && minVal < 0 && maxVal > 0 && (
        <line x1={PAD} y1={toY(0)} x2={PAD + plotW} y2={toY(0)}
          stroke={COLORS.grayLight} strokeWidth={1} opacity={0.5} />
      )}

      {Array.from({ length: Math.min(maxLen, 10) }, (_, i) => {
        const idx = Math.floor(i * (maxLen - 1) / Math.max(9, 1));
        return (
          <text key={i} x={toX(idx, maxLen)} y={H - 8} fontSize={9}
            fill={COLORS.textDim} textAnchor="middle">D-{maxLen - idx}</text>
        );
      })}

      {allSeries.slice(0, 12).map((series, si) => {
        if (series.length < 2) return null;
        const path = series.map((v, i) =>
          `${i === 0 ? 'M' : 'L'}${toX(i, series.length).toFixed(1)},${toY(v).toFixed(1)}`
        ).join(' ');
        return (
          <path key={si} d={path} fill="none"
            stroke={palette[si % palette.length]}
            strokeWidth={1.5} opacity={0.7} />
        );
      })}

      <text x={12} y={PAD + plotH / 2} fontSize={10} fill={COLORS.textDim}
        textAnchor="middle" transform={`rotate(-90, 12, ${PAD + plotH / 2})`}>
        {yLabel}
      </text>

      {patterns.slice(0, 8).map((p, i) => (
        <g key={i} transform={`translate(${PAD + 8 + (i % 4) * 160}, ${PAD + 8 + Math.floor(i / 4) * 14})`}>
          <rect width={10} height={3} fill={palette[i % palette.length]} rx={1} />
          <text x={14} y={4} fontSize={9} fill={COLORS.textDim}>{p.name}</text>
        </g>
      ))}
    </svg>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 차트 컴포넌트: 미니 캔들차트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MiniCandleChart({ candles }) {
  if (!candles || candles.length === 0) return null;

  const W = 300, H = 80;
  const allPrices = candles.flatMap(c => [c.high, c.low]).filter(p => p > 0);
  if (allPrices.length === 0) return null;

  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const rangeP = maxP - minP || 1;

  const cw = (W - 10) / candles.length;
  const toY = (p) => 5 + (1 - (p - minP) / rangeP) * (H - 10);

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {candles.map((c, i) => {
        const x = 5 + i * cw;
        const isUp = c.close >= c.open;
        const color = isUp ? COLORS.red : COLORS.accent;
        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyBot = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(bodyBot - bodyTop, 1);

        return (
          <g key={i}>
            <line x1={x + cw / 2} y1={toY(c.high)} x2={x + cw / 2} y2={toY(c.low)}
              stroke={color} strokeWidth={0.8} />
            <rect x={x + 1} y={bodyTop} width={Math.max(cw - 2, 2)} height={bodyH}
              fill={color} rx={0.5} />
          </g>
        );
      })}
    </svg>
  );
}
