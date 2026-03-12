/**
 * 급상승 패턴 탐지기 — DTW 기반
 * Pattern Surge Detector — DTW-based
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 파일경로: src/pages/PatternDetector.jsx
 *
 * [v3.1] 브라우저 이탈 후 재진입 시 스캔 자동 재개
 * - 페이지 이탈/재진입 시 진행 중인 스캔 자동 감지 & 폴링 재개
 * - scanIntervalRef로 인터벌 관리 (메모리 누수 방지)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import VirtualInvestTab from "./VirtualInvestTab";
import { kisApi, getKisCredentials, loadKisCredentials, activateKisMode, refreshKisToken, setupAutoTradeAfterBuy } from "./KisTrading";
import { supabase } from "./supabaseClient";

const API_BASE = "https://web-production-139e9.up.railway.app";

const PRESETS = {
  bluechip: {
    key: 'bluechip', label: '🏢 우량주 모드',
    desc: '대형주 실적·눌림목 기반 급상승 탐지', color: '#3b82f6',
    params: { periodDays: 365, preRiseDays: 10, risePct: 30, riseWindow: 5,
              weightReturns: 0.5, weightCandle: 0.2, weightVolume: 0.3 },
  },
  manipulation: {
    key: 'manipulation', label: '⚡ 작전주 모드',
    desc: '세력 매집기 패턴 탐지 (거래량 중심)', color: '#ef4444',
    params: { periodDays: 730, preRiseDays: 30, risePct: 50, riseWindow: 10,
              weightReturns: 0.3, weightCandle: 0.2, weightVolume: 0.5 },
  },
  custom: {
    key: 'custom', label: '🔧 사용자 정의',
    desc: '직접 파라미터를 설정합니다', color: '#f59e0b', params: null,
  },
};

const COLORS = {
  bg: '#0a0e1a', card: '#111827', cardBorder: '#1e293b',
  accent: '#3b82f6', accentDim: 'rgba(59,130,246,0.15)',
  green: '#10b981', greenDim: 'rgba(16,185,129,0.15)',
  red: '#ef4444', redDim: 'rgba(239,68,68,0.15)',
  yellow: '#f59e0b', yellowDim: 'rgba(245,158,11,0.15)',
  purple: '#8b5cf6', purpleDim: 'rgba(139,92,246,0.15)',
  gray: '#6b7280', grayLight: '#9ca3af',
  text: '#e5e7eb', textDim: '#9ca3af', white: '#f9fafb',
};

const fmt = (n) => n?.toLocaleString() ?? '-';

export default function PatternDetector() {
  const [pageMode, setPageMode] = useState('scanner');

  // ━━━ 스캐너 상태 ━━━
  const [scanMarket, setScanMarket] = useState('ALL');
  const [scanPeriod, setScanPeriod] = useState(365);
  const [scanRisePct, setScanRisePct] = useState(30);
  const [scanRiseWindow, setScanRiseWindow] = useState(5);
  const [scanVolRatio, setScanVolRatio] = useState(2.0);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMsg, setScanMsg] = useState('');
  const [scanResult, setScanResult] = useState(null);

  // ━━━ localStorage 캐시 헬퍼 (스캔 결과 보존) ━━━
  // ★ debounce: 빈번한 JSON.stringify 방지 (2초 딜레이)
  const saveCacheTimerRef = useRef(null);
  const saveScanCache = useCallback((data) => {
    if (saveCacheTimerRef.current) clearTimeout(saveCacheTimerRef.current);
    saveCacheTimerRef.current = setTimeout(() => {
      try { localStorage.setItem('scanResultCache', JSON.stringify(data)); }
      catch (e) { console.log('스캔 캐시 저장 실패:', e); }
    }, 2000);
  }, []);
  const loadScanCache = () => {
    try {
      const cached = localStorage.getItem('scanResultCache');
      if (cached) return JSON.parse(cached);
    } catch (e) { console.log('스캔 캐시 로드 실패:', e); }
    return null;
  };
  // setScanResult를 래핑하여 자동 캐시
  const setScanResultWithCache = useCallback((data) => {
    setScanResult(data);
    if (data && data.stocks) saveScanCache(data);
  }, [saveScanCache]);
  const [scanError, setScanError] = useState('');
  const [scanSortKey, setScanSortKey] = useState('manip_score');
  const [scanSortDir, setScanSortDir] = useState('desc');
  const [scanFilterLevel, setScanFilterLevel] = useState('all');
  const [selectedScanStocks, setSelectedScanStocks] = useState(new Set());
  const [scanDate, setScanDate] = useState('');
  const [scanSource, setScanSource] = useState('');
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [scanToast, setScanToast] = useState(null);  // { message, type:'success'|'error' }

  // ━━━ 스캔 종목 차트 상태 ━━━
  const [scanChartCode, setScanChartCode] = useState(null);
  const [scanChartCandles, setScanChartCandles] = useState([]);
  const [scanChartLoading, setScanChartLoading] = useState(false);
  const [scanChartStock, setScanChartStock] = useState(null);

  // ━━━ 개별종목추가 상태 ━━━
  const [addStockKeyword, setAddStockKeyword] = useState('');
  const [addStockResults, setAddStockResults] = useState([]);
  const [addStockSearching, setAddStockSearching] = useState(false);
  const [addStockPrices, setAddStockPrices] = useState({}); // { code: { price, change, change_pct } }
  const [addStockPriceLoading, setAddStockPriceLoading] = useState({});
  const [addStockChartCode, setAddStockChartCode] = useState(null);
  const [addStockChartName, setAddStockChartName] = useState('');
  const [addStockCandles, setAddStockCandles] = useState([]);
  const [addStockChartLoading, setAddStockChartLoading] = useState(false);

  // ━━━ [v3.1] 폴링 인터벌 ref — 언마운트 시 정리용 ━━━
  const scanIntervalRef = useRef(null);
  const analyzerIntervalRef = useRef(null); // ★ 분석기 폴링 ref (메모리 누수 방지)

  // ━━━ [v3.1] 페이지 진입 시: 진행 중인 스캔 확인 → 자동 재개 ━━━
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 0) localStorage에서 캐시된 스캔 결과 즉시 복원
      const cached = loadScanCache();
      if (cached && cached.stocks && !cancelled) {
        setScanResult(cached);
        setScanDate(cached.scan_date || '');
        setScanSource('cache');
      }

      // 1) 먼저 서버에 진행 중인 스캔이 있는지 확인
      try {
        const progResp = await fetch(`${API_BASE}/api/scanner/progress`);
        const progData = await progResp.json();

        if (cancelled) return;

        if (progData.running) {
          // ✅ 스캔이 아직 진행 중 → 상태 복원 & 폴링 재개
          setScanning(true);
          setScanProgress(progData.progress || 0);
          setScanMsg(progData.message || '스캔 진행 중...');
          pollScanProgress();
          return;
        }

        // 스캔이 끝났는데 결과가 메모리에 있는 경우
        if (!progData.running && progData.has_result) {
          try {
            const resResp = await fetch(`${API_BASE}/api/scanner/result`);
            const resData = await resResp.json();
            if (!cancelled && resData.status === 'done') {
              setScanResultWithCache(resData);
              setScanDate(resData.scan_date || new Date().toISOString());
              setScanSource('memory');
              return;
            }
          } catch (e) { console.log('메모리 결과 로드 실패:', e); }
        }
      } catch (e) {
        console.log('진행 상태 확인 실패:', e);
      }

      if (cancelled) return;

      // 2) 진행 중이 아니면 → DB에서 이전 결과 로드 (캐시가 없을 때만)
      if (!cached) {
        setLoadingPrev(true);
        try {
          const resp = await fetch(`${API_BASE}/api/scanner/latest`);
          const data = await resp.json();
          if (!cancelled && data.status === 'done') {
            setScanResultWithCache(data);
            setScanDate(data.scan_date || '');
            setScanSource(data.source || 'db');
          }
        } catch (e) { console.log('이전 스캔 로드 실패:', e); }
        if (!cancelled) setLoadingPrev(false);
      }
    })();

    return () => {
      cancelled = true;
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, []);

  // ━━━ 분석기 상태 ━━━
  const [stocks, setStocks] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);
  const searchTimerRef = useRef(null);
  const [activePreset, setActivePreset] = useState('bluechip');
  const [periodDays, setPeriodDays] = useState(365);
  const [preRiseDays, setPreRiseDays] = useState(10);
  const [risePct, setRisePct] = useState(30);
  const [riseWindow, setRiseWindow] = useState(5);
  const [weightReturns, setWeightReturns] = useState(0.5);
  const [weightCandle, setWeightCandle] = useState(0.2);
  const [weightVolume, setWeightVolume] = useState(0.3);
  const [showSettings, setShowSettings] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [selectedRecStocks, setSelectedRecStocks] = useState(new Set());  // 매수추천 선택 종목
  const [filteredRecCodes, setFilteredRecCodes] = useState(new Set());  // 현재 필터 적용 후 보이는 종목 코드
  // ━━━ 가상투자 등록 모달 상태 ━━━
  const [showRegModal, setShowRegModal] = useState(false);
  const [regTitle, setRegTitle] = useState('');
  const [regPreset, setRegPreset] = useState(() => {
    try { return localStorage.getItem('kis_auto_trade_preset') || 'smart'; } catch { return 'smart'; }
  });
  const [regCapital, setRegCapital] = useState(1000000);
  const [regLoading, setRegLoading] = useState(false);
  const [newRtSessionId, setNewRtSessionId] = useState(null);
  const [regPatternId, setRegPatternId] = useState(null);   // 등록 시 선택한 패턴 ID
  const [regPatternName, setRegPatternName] = useState(''); // 등록 시 선택한 패턴명
  const [regActiveFilters, setRegActiveFilters] = useState([]);  // ★ 등록 모달에 표시할 적용된 필터 목록

  // ━━━ ★ 패턴 라이브러리 상태 ━━━
  const [savingPattern, setSavingPattern] = useState(null); // 저장 중 클러스터 인덱스
  const [savedPatterns, setSavedPatterns] = useState([]);
  const [savedPatternsLoading, setSavedPatternsLoading] = useState(false);
  const [editingPatternId, setEditingPatternId] = useState(null);
  const [editingPatternName, setEditingPatternName] = useState('');
  // ━━━ ★ 패턴 스캔 상태 ━━━
  const [showPatternScan, setShowPatternScan] = useState(false);
  const [selectedPatternIds, setSelectedPatternIds] = useState(new Set());
  const [patternScanResult, setPatternScanResult] = useState(null);
  const [patternScanning, setPatternScanning] = useState(false);
  const [patternMinSimilarity, setPatternMinSimilarity] = useState(60);
  const [selectedPatternStocks, setSelectedPatternStocks] = useState(new Set()); // 패턴 스캔 결과 선택 종목
  const [regSource, setRegSource] = useState('recommend'); // 'recommend' | 'patternScan'
  const [patternSortKey, setPatternSortKey] = useState('similarity'); // 정렬 키
  const [patternSortDir, setPatternSortDir] = useState('desc'); // 'asc' | 'desc'

  // ━━━ 매수 후보 풀 상태 ━━━
  const [buyCandidates, setBuyCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateSettings, setCandidateSettings] = useState(null);
  const [showCandidateSettings, setShowCandidateSettings] = useState(false);
  const [showCandidatePanel, setShowCandidatePanel] = useState(false);

  // ━━━ KIS 실전/모의 주문 모달 상태 ━━━
  const [showKisOrderModal, setShowKisOrderModal] = useState(false);
  const [kisOrderMode, setKisOrderMode] = useState('virtual'); // 'virtual' | 'real'
  const [kisOrderCapital, setKisOrderCapital] = useState(1000000);
  const [kisOrderType, setKisOrderType] = useState('01'); // '00'=지정가, '01'=시장가
  const [kisOrderLoading, setKisOrderLoading] = useState(false);
  const [kisOrderResults, setKisOrderResults] = useState(null);

  // regPreset 변경 시 localStorage에 전략값 저장 (자동매매 동기화용)
  useEffect(() => {
    const presetDefs = {
      aggressive:   { tp:10, sl:5, days:5, trailing:0, grace:0, activation:0 },
      standard:     { tp:7,  sl:3, days:10, trailing:0, grace:0, activation:0 },
      conservative: { tp:5,  sl:2, days:15, trailing:0, grace:0, activation:0 },
      longterm:     { tp:15, sl:5, days:30, trailing:0, grace:0, activation:0 },
      smart:        { tp:15, sl:12, days:30, trailing:5, grace:0, activation:15 },  // ★ 유예기간 보류
    };
    const p = presetDefs[regPreset] || presetDefs.smart;
    localStorage.setItem('kis_auto_trade_preset', regPreset);
    localStorage.setItem('kis_auto_trade_strategy', JSON.stringify({
      tp: p.tp, sl: p.sl, days: p.days,
      trailing: p.trailing || 0, grace: p.grace || 0, activation: p.activation || 15,
    }));
  }, [regPreset]);

  // ━━━ ★ 매수 후보 풀 함수 (Supabase 직접 호출) ━━━
  const fetchCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const { data, error } = await supabase
        .from('buy_candidates')
        .select('*')
        .eq('status', 'active')
        .order('composite_score', { ascending: false })
        .limit(50);
      if (!error) setBuyCandidates(data || []);
    } catch (e) { console.error('후보 목록 로드 실패:', e); }
    setCandidatesLoading(false);
  }, []);

  const fetchCandidateSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('candidate_settings')
        .select('*')
        .eq('id', 1)
        .single();
      if (!error && data) setCandidateSettings(data);
      else setCandidateSettings({
        auto_register: false, min_composite_score: 60, min_entry_score: 50,
        required_entry_grades: ['auto_buy'], max_candidates: 10, expire_days: 3,
        auto_buy_virtual: false, auto_buy_kis: false, capital_per_stock: 300000,
        exclude_ma5_down: true, exclude_rsi_overbought: true, min_trading_value: 500000000,
      });
    } catch (e) { console.error('후보 설정 로드 실패:', e); }
  }, []);

  const saveCandidateSettings = useCallback(async (settings) => {
    try {
      const { error } = await supabase
        .from('candidate_settings')
        .upsert({ id: 1, ...settings, updated_at: new Date().toISOString() });
      if (error) throw error;
      setCandidateSettings(settings);
      alert('설정이 저장되었습니다.');
    } catch (e) { alert('설정 저장 실패: ' + e.message); }
  }, []);

  const registerCandidates = useCallback(async (candidates, source = 'manual') => {
    try {
      const expireDays = candidateSettings?.expire_days || 3;
      const expiresAt = new Date(Date.now() + expireDays * 86400000).toISOString();

      // 기존 active 후보 코드 조회 (중복 방지)
      const { data: existing } = await supabase
        .from('buy_candidates').select('code').eq('status', 'active');
      const existingCodes = new Set((existing || []).map(r => r.code));

      const toInsert = candidates
        .filter(s => !existingCodes.has(s.code))
        .map(s => ({
          code: s.code,
          name: s.name,
          composite_score: s.composite_score || s.top_manip_score || 0,
          manip_score: s.top_manip_score || 0,
          entry_score: s.entry_signals?.entry_score || s.entry_score || 0,
          pattern_match_pct: s.pattern_match_pct || s.similarity || null,
          entry_grade: s.entry_signals?.entry_grade || s.entry_grade || null,
          current_price: s.current_price || null,
          recommended_buy_price: s.current_price || null,
          source,
          reason: [
            s.top_manip_score >= 80 ? `세력${s.top_manip_score}` : '',
            (s.entry_signals?.entry_score || s.entry_score || 0) >= 60 ? `진입${s.entry_signals?.entry_score || s.entry_score}` : '',
            (s.similarity || s.pattern_match_pct) ? `유사${s.similarity || s.pattern_match_pct}%` : '',
          ].filter(Boolean).join(', ') || null,
          status: 'active',
          expires_at: expiresAt,
        }));

      const skipped = candidates.length - toInsert.length;
      if (toInsert.length > 0) {
        const { error } = await supabase.from('buy_candidates').insert(toInsert);
        if (error) throw error;
      }
      alert(`후보 등록 완료: ${toInsert.length}개 추가, ${skipped}개 중복`);
      fetchCandidates();
      return { success: true, inserted: toInsert.length, skipped };
    } catch (e) {
      alert('후보 등록 실패: ' + e.message);
      return { success: false };
    }
  }, [candidateSettings, fetchCandidates]);

  const autoRegisterFromScan = useCallback(async (stocks, source = 'scan') => {
    try {
      if (!candidateSettings) return { success: false };
      const { min_composite_score = 60, min_entry_score = 50, max_candidates = 10,
        expire_days = 3, required_entry_grades = ['auto_buy'] } = candidateSettings;
      const expiresAt = new Date(Date.now() + expire_days * 86400000).toISOString();

      // 현재 active 후보
      const { data: existing } = await supabase
        .from('buy_candidates').select('code').eq('status', 'active');
      const existingCodes = new Set((existing || []).map(r => r.code));
      const remainingSlots = Math.max(0, max_candidates - existingCodes.size);
      if (remainingSlots === 0) return { success: true, inserted: 0 };

      // 필터링
      const filtered = stocks.filter(s => {
        if (existingCodes.has(s.code)) return false;
        const composite = s.composite_score || s.top_manip_score || 0;
        if (composite < min_composite_score) return false;
        const entryScore = s.entry_signals?.entry_score || 0;
        if (entryScore < min_entry_score) return false;
        const grade = s.entry_signals?.entry_grade || '';
        if (grade && !required_entry_grades.includes(grade)) return false;
        return true;
      }).sort((a, b) => (b.composite_score || b.top_manip_score || 0) - (a.composite_score || a.top_manip_score || 0))
        .slice(0, remainingSlots);

      if (filtered.length === 0) return { success: true, inserted: 0 };

      const toInsert = filtered.map(s => ({
        code: s.code, name: s.name,
        composite_score: s.composite_score || s.top_manip_score || 0,
        manip_score: s.top_manip_score || 0,
        entry_score: s.entry_signals?.entry_score || 0,
        entry_grade: s.entry_signals?.entry_grade || null,
        current_price: s.current_price || null,
        source, status: 'active', expires_at: expiresAt,
      }));

      const { error } = await supabase.from('buy_candidates').insert(toInsert);
      if (error) throw error;
      console.log(`[자동등록] ${toInsert.length}개 후보 등록됨`);
      fetchCandidates();
      return { success: true, inserted: toInsert.length };
    } catch (e) {
      console.error('자동 등록 실패:', e);
      return { success: false };
    }
  }, [candidateSettings, fetchCandidates]);

  const deleteCandidates = useCallback(async (ids) => {
    try {
      for (const id of ids) {
        await supabase.from('buy_candidates').delete().eq('id', id);
      }
      fetchCandidates();
    } catch (e) { console.error('후보 삭제 실패:', e); }
  }, [fetchCandidates]);

  const updateCandidateStatus = useCallback(async (ids, status) => {
    try {
      for (const id of ids) {
        await supabase.from('buy_candidates').update({ status }).eq('id', id);
      }
      fetchCandidates();
    } catch (e) { console.error('후보 상태 변경 실패:', e); }
  }, [fetchCandidates]);

  // 후보 풀 초기 로드
  useEffect(() => {
    fetchCandidates();
    fetchCandidateSettings();
  }, [fetchCandidates, fetchCandidateSettings]);

  // 스캔 완료 시 자동 후보 등록
  const prevScanStocksRef = useRef(null);
  useEffect(() => {
    if (!scanResult?.stocks || !candidateSettings?.auto_register) return;
    // 같은 스캔 결과에 대해 중복 실행 방지
    const key = scanResult.stocks.length + '_' + (scanResult.scan_date || '');
    if (prevScanStocksRef.current === key) return;
    prevScanStocksRef.current = key;
    autoRegisterFromScan(scanResult.stocks, 'scan');
  }, [scanResult, candidateSettings, autoRegisterFromScan]);

  // ━━━ ★ 패턴 라이브러리 함수 ━━━
  const fetchSavedPatterns = useCallback(async () => {
    setSavedPatternsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/pattern/library/list`);
      const data = await res.json();
      if (data.success) setSavedPatterns(data.patterns || []);
    } catch (e) { console.error('패턴 목록 로드 실패:', e); }
    setSavedPatternsLoading(false);
  }, []);

  const saveClusterPattern = async (cluster, clusterIndex) => {
    setSavingPattern(clusterIndex);
    try {
      // ★ v9: 서버에서 최신 패턴 목록을 가져와 최대 번호 추출 → +1 (종목 변경 시에도 번호 계속 증가)
      let maxNum = 0;
      try {
        const freshRes = await fetch(`${API_BASE}/api/pattern/library/list`);
        const freshData = await freshRes.json();
        if (freshData.success) {
          (freshData.patterns || []).forEach(p => {
            const m = (p.name || '').match(/패턴\s*#(\d+)/);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
          });
        }
      } catch (_) {
        // 서버 조회 실패 시 로컬 state fallback
        (savedPatterns || []).forEach(p => {
          const m = (p.name || '').match(/패턴\s*#(\d+)/);
          if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
        });
      }
      const nextNum = maxNum + 1;

      const body = {
        name: `패턴 #${nextNum} — ${(cluster.description || '').slice(0, 30) || '무제'}`,
        description: cluster.description || '',
        session_id: null,
        cluster_id: cluster.cluster_id ?? clusterIndex,
        avg_return_flow: cluster.avg_return_flow || [],
        avg_volume_flow: cluster.avg_volume_flow || [],
        avg_rsi_flow: cluster.avg_rsi_flow || [],
        avg_ma_dist_flow: cluster.avg_ma_dist_flow || [],
        avg_similarity: cluster.avg_similarity || 0,
        avg_rise_pct: cluster.avg_rise_pct || 0,
        avg_rise_days: cluster.avg_rise_days || 0,
        member_count: cluster.pattern_count || cluster.members?.length || 0,
        members: cluster.members || [],
        confidence: cluster.confidence || 0,
        tags: [],
      };
      const res = await fetch(`${API_BASE}/api/pattern/library/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ 패턴이 라이브러리에 저장되었습니다!');
        fetchSavedPatterns();
      } else {
        alert('저장 실패: ' + (data.message || ''));
      }
    } catch (e) { alert('저장 실패: ' + e.message); }
    setSavingPattern(null);
  };

  const deletePattern = async (id) => {
    if (!confirm('이 패턴을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/pattern/library/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchSavedPatterns();
    } catch (e) { console.error('패턴 삭제 실패:', e); }
  };

  const togglePatternActive = async (id, currentActive) => {
    try {
      await fetch(`${API_BASE}/api/pattern/library/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      fetchSavedPatterns();
    } catch (e) { console.error('패턴 토글 실패:', e); }
  };

  const savePatternName = async (id) => {
    try {
      await fetch(`${API_BASE}/api/pattern/library/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingPatternName }),
      });
      setEditingPatternId(null);
      fetchSavedPatterns();
    } catch (e) { console.error('이름 수정 실패:', e); }
  };

  // ★ 캐시된 스캔 결과 로드 (돋보기 클릭 시 사용)
  const loadPatternScanCache = async (patternId) => {
    try {
      const res = await fetch(`${API_BASE}/api/pattern/library/${patternId}/scan-cache`);
      const data = await res.json();
      if (data.success && data.cached && data.matches?.length > 0) {
        return data;
      }
    } catch (e) { console.warn('캐시 로드 실패:', e); }
    return null;
  };

  // ★ 돋보기 클릭: 캐시 우선 로드, 없으면 스캔 실행
  const scanOrLoadPattern = async (patternId) => {
    setSelectedPatternIds(new Set([patternId]));
    setShowPatternScan(true);
    setPageMode('scanner');
    setPatternScanning(true);
    setPatternScanResult(null);

    // 1) 캐시 확인
    const cached = await loadPatternScanCache(patternId);
    if (cached) {
      setPatternScanResult({ ...cached, fromCache: true });
      setPatternScanning(false);
      return;
    }

    // 2) 캐시 없으면 스캔 실행
    try {
      const res = await fetch(`${API_BASE}/api/pattern/library/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern_ids: [patternId], min_similarity: patternMinSimilarity, market: scanMarket, limit: 50 }),
      });
      const data = await res.json();
      if (data.success) {
        setPatternScanResult(data);
        setTimeout(() => fetchSavedPatterns(), 2000);
      } else {
        alert('스캔 실패: ' + (data.message || ''));
      }
    } catch (e) { alert('스캔 실패: ' + e.message); }
    setPatternScanning(false);
  };

  const runPatternScan = async (forceRescan = false) => {
    const ids = [...selectedPatternIds];
    if (ids.length === 0) { alert('스캔할 패턴을 선택하세요'); return; }
    setPatternScanning(true);
    setPatternScanResult(null);

    // 단일 패턴이고 forceRescan이 아니면 캐시 먼저 확인
    if (!forceRescan && ids.length === 1) {
      const cached = await loadPatternScanCache(ids[0]);
      if (cached) {
        setPatternScanResult({ ...cached, fromCache: true });
        setPatternScanning(false);
        return;
      }
    }

    // forceRescan이면 캐시 삭제
    if (forceRescan) {
      for (const pid of ids) {
        try { await fetch(`${API_BASE}/api/pattern/library/${pid}/scan-cache`, { method: 'DELETE' }); } catch (e) {}
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/pattern/library/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern_ids: ids, min_similarity: patternMinSimilarity, market: scanMarket, limit: 50 }),
      });
      const data = await res.json();
      if (data.success) {
        setPatternScanResult(data);
        setTimeout(() => fetchSavedPatterns(), 2000);
      } else {
        alert('스캔 실패: ' + (data.message || ''));
      }
    } catch (e) { alert('스캔 실패: ' + e.message); }
    setPatternScanning(false);
  };

  const openRegModal = async (source = 'recommend', filters = []) => {
    const hasStocks = source === 'patternScan' ? selectedPatternStocks.size > 0 : selectedRecStocks.size > 0;
    if (!hasStocks) return;
    setRegSource(source);
    setRegActiveFilters(filters);
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    setRegTitle(source === 'patternScan' ? `패턴스캔_${dateStr}` : dateStr);
    // 패턴 스캔에서 온 경우, 이미 매칭된 패턴명을 자동 선택
    if (source === 'patternScan') {
      const matches = (patternScanResult?.matches || []).filter(r => selectedPatternStocks.has(r.code));
      const firstPatternName = matches.find(m => m.matched_pattern_name)?.matched_pattern_name || '';
      const firstPatternId = matches.find(m => m.matched_pattern_id)?.matched_pattern_id || null;
      setRegPatternId(firstPatternId);
      setRegPatternName(firstPatternName);
    } else {
      setRegPatternId(null);
      setRegPatternName('');
    }
    setShowRegModal(true);
    // 패턴 라이브러리 로드
    try {
      if (savedPatterns.length === 0) await fetchSavedPatterns();
    } catch(e) { console.error('모달 데이터 로드 실패:', e); }
  };

  const doRegisterVirtual = async () => {
    // ★ 소스에 따라 선택된 종목 가져오기
    let selRecs;
    if (regSource === 'patternScan') {
      selRecs = (patternScanResult?.matches || []).filter(r => selectedPatternStocks.has(r.code));
    } else {
      const recs = result?.recommendations || [];
      selRecs = recs.filter(r => selectedRecStocks.has(r.code) && filteredRecCodes.has(r.code));
    }
    if (selRecs.length === 0) return;
    setRegLoading(true);
    try {
      const presetDefs = {
        aggressive:   { tp:10, sl:5, days:5, trailing:0, grace:0, activation:0 },
        standard:     { tp:7,  sl:3, days:10, trailing:0, grace:0, activation:0 },
        conservative: { tp:5,  sl:2, days:15, trailing:0, grace:0, activation:0 },
        longterm:     { tp:15, sl:5, days:30, trailing:0, grace:0, activation:0 },
        smart:        { tp:15, sl:12, days:30, trailing:5, grace:0, activation:15 },  // ★ 유예기간 보류
      };
      const p = presetDefs[regPreset] || presetDefs.smart;
      const filtersPayload = regActiveFilters.map(f => ({ label: f.label, color: f.color }));
      const stocksList = selRecs.map(s => ({
        code: s.code || '', name: s.name || '',
        buy_price: s.current_price || 0, current_price: s.current_price || 0,
        similarity: s.similarity || 0, signal: s.signal || '',
        pattern_id: s.matched_pattern_id || regPatternId || null,
        pattern_name: s.matched_pattern_name || regPatternName || null,
      }));

      let data;

      {
        // 독립 포트폴리오 등록
        const body = {
          title: regTitle || 'Untitled',
          stocks: stocksList,
          capital: regCapital,
          preset: regPreset,
          take_profit_pct: p.tp, stop_loss_pct: p.sl,
          max_hold_days: p.days, trailing_stop_pct: p.trailing, grace_days: p.grace,
          profit_activation_pct: p.activation ?? 15,
          filters: filtersPayload,
        };
        const res = await fetch(`${API_BASE}/api/virtual-invest/realtime/start`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(body),
        });
        data = await res.json();
      }

      if (data.error) { alert('등록 실패: ' + data.error); }
      else {
        // ★ 필터 정보를 localStorage에 저장 (포트폴리오 ID 기반)
        const pfId = data.session_id || data.portfolio_id || null;
        if (pfId && filtersPayload.length > 0) {
          try {
            const saved = JSON.parse(localStorage.getItem('portfolioFilters') || '{}');
            saved[pfId] = filtersPayload;
            localStorage.setItem('portfolioFilters', JSON.stringify(saved));
          } catch(e) { console.log('필터 캐시 저장 실패:', e); }
        }
        setShowRegModal(false);
        if (regSource === 'patternScan') {
          setSelectedPatternStocks(new Set());
        } else {
          setSelectedRecStocks(new Set());
        }
        setNewRtSessionId(pfId);
        setActiveTab(3);
        alert(data.message || '등록 완료!');
      }
    } catch(e) { alert('등록 실패: ' + e.message); }
    finally { setRegLoading(false); }
  };

  // ━━━ KIS 주문 모달 열기 ━━━
  const openKisOrderModal = (mode) => {
    const hasStocks = selectedRecStocks.size > 0;
    if (!hasStocks) return;
    setKisOrderMode(mode);
    setKisOrderResults(null);
    setShowKisOrderModal(true);
  };

  // ━━━ KIS 주문 실행 (매수) ━━━
  const executeKisOrders = async () => {
    const recs = result?.recommendations || [];
    // 필터링된 목록에서만 선택된 종목을 가져옴 (숨겨진 종목 제외)
    const selStocks = recs.filter(r => selectedRecStocks.has(r.code) && filteredRecCodes.has(r.code));
    if (selStocks.length === 0) return;

    const isVirtual = kisOrderMode === 'virtual';
    // 해당 모드의 크레덴셜 활성화
    if (!activateKisMode(kisOrderMode)) {
      // 토큰이 없으면 자동 갱신 시도
      const refreshed = await refreshKisToken(kisOrderMode);
      if (!refreshed) {
        alert(`${isVirtual ? '모의투자' : '실전투자'} API가 연결되지 않았습니다.\n${isVirtual ? 'KIS 모의투자' : 'KIS 실전투자'} > API 설정에서 먼저 연결해주세요.`);
        return;
      }
    }
    // 계좌번호 유효성 검증
    const activeCreds = await loadKisCredentials();
    const acctNo = (activeCreds.account_no || "").replace(/-/g, "");
    if (!acctNo || acctNo.length < 10) {
      alert(`${isVirtual ? '모의투자' : '실전투자'} 계좌번호가 설정되지 않았습니다.\n${isVirtual ? 'KIS 모의투자' : 'KIS 실전투자'} > API 설정에서 계좌번호를 입력해주세요.\n\n현재 계좌번호: ${acctNo || '(없음)'}`);
      return;
    }
    const confirmMsg = isVirtual
      ? `🏦 모의투자 주문\n\n${selStocks.length}개 종목에 총 ${kisOrderCapital.toLocaleString()}원 매수합니다.\n(종목당 ${Math.floor(kisOrderCapital / selStocks.length).toLocaleString()}원)\n\n진행하시겠습니까?`
      : `🔴 실전투자 주문\n\n⚠️ 실제 계좌에서 매수됩니다!\n${selStocks.length}개 종목에 총 ${kisOrderCapital.toLocaleString()}원\n\n정말 진행하시겠습니까?`;
    if (!confirm(confirmMsg)) return;

    setKisOrderLoading(true);
    const perStock = Math.floor(kisOrderCapital / selStocks.length);
    const results = [];

    for (const stock of selStocks) {
      const price = stock.current_price || 0;
      if (price <= 0) {
        results.push({ code: stock.code, name: stock.name, success: false, message: '현재가 없음' });
        continue;
      }
      const qty = Math.floor(perStock / price);
      if (qty <= 0) {
        results.push({ code: stock.code, name: stock.name, success: false, message: '수량 부족 (1주 미만)' });
        continue;
      }

      try {
        // KIS API 주문 요청 (is_virtual 파라미터는 localStorage creds에서 자동 처리)
        const orderParams = {
          stock_code: stock.code,
          qty: qty,
          order_type: kisOrderType,
        };
        if (kisOrderType === '00') orderParams.price = price; // 지정가
        const r = await kisApi("order/buy", {}, {
          method: 'POST',
          body: JSON.stringify(orderParams),
        });
        results.push({
          code: stock.code, name: stock.name,
          success: r.success, message: r.message || (r.success ? '주문 완료' : '주문 실패'),
          order_no: r.order_no || '', qty, price,
        });
      } catch (e) {
        results.push({ code: stock.code, name: stock.name, success: false, message: e.message });
      }
    }

    setKisOrderResults(results);
    setKisOrderLoading(false);

    // 주문 성공 시 자동매매 규칙 생성 + 즉시 백그라운드 모니터링 시작
    const successStocks = results.filter(r => r.success);
    if (successStocks.length > 0) {
      const presetDefs = {
        aggressive:   { tp:10, sl:5, days:5, trailing:0, grace:0, activation:0 },
        standard:     { tp:7,  sl:3, days:10, trailing:0, grace:0, activation:0 },
        conservative: { tp:5,  sl:2, days:15, trailing:0, grace:0, activation:0 },
        longterm:     { tp:15, sl:5, days:30, trailing:0, grace:0, activation:0 },
        smart:        { tp:15, sl:12, days:30, trailing:5, grace:0, activation:15 },  // ★ 유예기간 보류
      };
      const p = presetDefs[regPreset] || presetDefs.smart;
      localStorage.setItem(`kis_auto_trade_sync_${kisOrderMode}`, JSON.stringify({
        tp: p.tp, sl: p.sl, days: p.days,
        trailing: p.trailing || 0, grace: p.grace || 0, activation: p.activation || 15,
        autostart: true, timestamp: Date.now(),
      }));
      // 매입 즉시 자동 손절/익절 모니터링 시작
      setupAutoTradeAfterBuy(kisOrderMode, successStocks, p);
    }
  };

  // ━━━ 개별종목추가 함수 ━━━
  const searchAddStock = async () => {
    if (!addStockKeyword.trim()) return;
    setAddStockSearching(true);
    setAddStockResults([]);
    setAddStockPrices({});
    try {
      const resp = await fetch(`${API_BASE}/api/pattern/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: addStockKeyword.trim() }),
      });
      const data = await resp.json();
      setAddStockResults(data.results || []);
    } catch (e) { alert('검색 실패: ' + e.message); }
    finally { setAddStockSearching(false); }
  };

  const addStockGetPrice = async (code) => {
    setAddStockPriceLoading(prev => ({ ...prev, [code]: true }));
    try {
      const resp = await fetch(`${API_BASE}/api/stocks/quote/${code}`);
      const d = await resp.json();
      if (d.success && d.price) {
        setAddStockPrices(prev => ({ ...prev, [code]: {
          price: d.price, change: d.change || 0, change_pct: d.change_pct || 0,
          high: d.high || 0, low: d.low || 0, open: d.open || 0, volume: d.volume || 0,
        }}));
      } else {
        alert(`시세 조회 실패: ${d.error || '알 수 없는 오류'}`);
      }
    } catch (e) { console.error('시세조회 실패:', e); alert('시세 조회 실패: 서버 연결 오류'); }
    finally { setAddStockPriceLoading(prev => ({ ...prev, [code]: false })); }
  };

  const addStockOpenChart = async (code, name) => {
    setAddStockChartCode(code);
    setAddStockChartName(name);
    setAddStockChartLoading(true);
    setAddStockCandles([]);
    try {
      const resp = await fetch(`${API_BASE}/api/virtual-invest/candles/${code}`);
      const d = await resp.json();
      setAddStockCandles(d.candles || []);
      // 시세도 같이 조회
      if (!addStockPrices[code]) addStockGetPrice(code);
    } catch (e) { console.error('차트 로드 실패:', e); }
    finally { setAddStockChartLoading(false); }
  };

  const addStockRegisterVirtual = async (stock) => {
    const priceInfo = addStockPrices[stock.code];
    const price = priceInfo?.price || 0;
    const confirmMsg = `🏦 가상투자 등록\n\n${stock.name}(${stock.code})\n현재가: ${price ? price.toLocaleString() + '원' : '미조회'}\n\n등록하시겠습니까?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const body = {
        title: `개별추가_${stock.name}`,
        stocks: [{ code: stock.code, name: stock.name, buy_price: price, current_price: price }],
        capital: price > 0 ? price * 10 : 1000000,
        preset: 'smart',
        take_profit_pct: 15, stop_loss_pct: 12, max_hold_days: 30,
        trailing_stop_pct: 5, grace_days: 0, profit_activation_pct: 15,  // ★ 유예기간 보류
      };
      const res = await fetch(`${API_BASE}/api/virtual-invest/realtime/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) alert('등록 실패: ' + data.error);
      else alert(data.message || `${stock.name} 가상투자 등록 완료!`);
    } catch (e) { alert('등록 실패: ' + e.message); }
  };

  const addStockRegisterCandidate = async (stock) => {
    const priceInfo = addStockPrices[stock.code];
    await registerCandidates([{
      code: stock.code,
      name: stock.name,
      current_price: priceInfo?.price || 0,
      composite_score: 0,
      top_manip_score: 0,
      entry_score: 0,
    }], 'manual');
  };

  const addStockKisBuy = async (stock, mode) => {
    const isVirtual = mode === 'virtual';
    if (!activateKisMode(mode)) {
      const refreshed = await refreshKisToken(mode);
      if (!refreshed) {
        alert(`${isVirtual ? '모의투자' : '실전투자'} API가 연결되지 않았습니다.\nKIS ${isVirtual ? '모의투자' : '실전투자'} > API 설정에서 먼저 연결해주세요.`);
        return;
      }
    }
    const creds = await loadKisCredentials();
    const acctNo = (creds.account_no || "").replace(/-/g, "");
    if (!acctNo || acctNo.length < 10) {
      alert(`${isVirtual ? '모의투자' : '실전투자'} 계좌번호가 설정되지 않았습니다.`);
      return;
    }
    const priceInfo = addStockPrices[stock.code];
    const price = priceInfo?.price || 0;
    if (price <= 0) { alert('현재가를 먼저 조회해주세요. (🔍 버튼)'); return; }

    const capital = 1000000;
    const qty = Math.floor(capital / price);
    if (qty <= 0) { alert('1주 매수 불가 (금액 부족)'); return; }

    const confirmMsg = isVirtual
      ? `🏦 모의투자 매수\n\n${stock.name} ${qty}주 × ${price.toLocaleString()}원\n= ${(qty * price).toLocaleString()}원\n\n진행하시겠습니까?`
      : `🔴 실전투자 매수\n\n⚠️ 실제 계좌에서 매수됩니다!\n${stock.name} ${qty}주 × ${price.toLocaleString()}원\n= ${(qty * price).toLocaleString()}원\n\n정말 진행하시겠습니까?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const r = await kisApi("order/buy", {}, {
        method: 'POST',
        body: JSON.stringify({ stock_code: stock.code, qty, order_type: '01' }),
      });
      alert(r.success ? `${stock.name} 매수 완료! (${qty}주)` : `매수 실패: ${r.message}`);
      if (r.success) {
        setupAutoTradeAfterBuy(mode, [{ code: stock.code, name: stock.name, qty, price }],
          { tp: 15, sl: 12, days: 30, trailing: 5, grace: 0, activation: 15 });  // ★ 유예기간 보류
      }
    } catch (e) { alert('매수 실패: ' + e.message); }
  };

  // ━━━ 스캔 히스토리 상태 ━━━
  const [scanHistoryList, setScanHistoryList] = useState([]);
  const [showScanHistory, setShowScanHistory] = useState(false);
  const [loadingScanHistory, setLoadingScanHistory] = useState(false);

  const loadScanHistoryList = useCallback(async () => {
    setLoadingScanHistory(true);
    try {
      const res = await fetch(`${API_BASE}/api/scanner/history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status === 'ok') {
        setScanHistoryList(json.data || []);
      } else {
        throw new Error(json.detail || '히스토리 목록 로드 실패');
      }
    } catch (e) {
      console.warn('[scan-history] API 실패, Supabase 직접 조회:', e.message);
      try {
        const { data, error } = await supabase
          .from('surge_scan_sessions')
          .select('id, scan_date, status, market, period_days, rise_pct, rise_window, min_volume_ratio, total_scanned, total_found, total_surges, high_manip_count, medium_manip_count')
          .in('status', ['done', 'stopped'])
          .order('id', { ascending: false })
          .limit(20);
        if (error) throw error;
        setScanHistoryList(data || []);
      } catch (e2) { console.error('[scan-history] Supabase 폴백도 실패:', e2); }
    }
    setLoadingScanHistory(false);
  }, []);

  // 스캔 결과를 Supabase에 직접 저장 (백엔드 미배포 대응)
  // 스캔 결과를 Supabase에 저장 (백엔드가 세션만 만들고 종목 저장 실패하는 문제 대응)
  const saveScanToHistory = useCallback(async (resultData) => {
    if (!resultData || !resultData.stocks || resultData.stocks.length === 0) {
      await loadScanHistoryList();
      return;
    }
    try {
      // 1) 최근 done/stopped 세션 확인
      const { data: recentSessions } = await supabase
        .from('surge_scan_sessions')
        .select('id')
        .in('status', ['done', 'stopped'])
        .order('id', { ascending: false })
        .limit(1);
      let sessionId = null;
      if (recentSessions && recentSessions.length > 0) {
        const { data: stockCheck } = await supabase
          .from('surge_scan_stocks')
          .select('id')
          .eq('session_id', recentSessions[0].id)
          .limit(1);
        if (stockCheck && stockCheck.length > 0) {
          // 백엔드가 이미 종목까지 저장함 → 스킵
          await loadScanHistoryList();
          return;
        }
        // 세션은 있지만 종목이 없음 → 이 세션에 종목 저장
        sessionId = recentSessions[0].id;
      }
      // 2) 세션이 없으면 새로 생성
      if (!sessionId) {
        const stats = resultData.stats || {};
        const sessionRow = {
          scan_date: resultData.scan_date || new Date().toISOString(),
          market: resultData.market || 'ALL',
          status: resultData.stopped ? 'stopped' : 'done',
          total_scanned: stats.total_scanned || 0,
          total_found: stats.total_found || 0,
          total_surges: stats.total_surges || 0,
          high_manip_count: stats.high_manip_count || 0,
          medium_manip_count: stats.medium_manip_count || 0,
        };
        const { data: sessData, error: sessErr } = await supabase
          .from('surge_scan_sessions').insert(sessionRow).select('id').single();
        if (sessErr || !sessData) throw sessErr || new Error('세션 생성 실패');
        sessionId = sessData.id;
      }
      // 3) 종목 데이터 50개씩 배치 저장
      const stocks = resultData.stocks;
      for (let i = 0; i < stocks.length; i += 50) {
        const batch = stocks.slice(i, i + 50).map(s => ({
          session_id: sessionId,
          code: s.code || '',
          name: s.name || '',
          market: s.market || '',
          current_price: parseInt(s.current_price || 0),
          last_date: s.last_date || '',
          surge_count: parseInt(s.surge_count || 0),
          top_manip_score: s.top_manip_score || 0,
          top_manip_level: s.top_manip_level || 'low',
          top_manip_label: s.top_manip_label || '',
          latest_rise_pct: s.latest_rise_pct || 0,
          latest_surge_date: s.latest_surge_date || '',
          latest_from_peak: s.latest_from_peak || 0,
          surges_json: JSON.stringify(s.surges || []),
        }));
        const { error: stockErr } = await supabase.from('surge_scan_stocks').insert(batch);
        if (stockErr) console.error('[scan-history] 종목 배치 저장 실패:', stockErr);
      }
      console.log(`[scan-history] 저장 완료: session_id=${sessionId}, ${stocks.length}개 종목`);
    } catch (e) {
      console.error('[scan-history] 저장 실패:', e);
    }
    await loadScanHistoryList();
  }, [loadScanHistoryList]);

  const loadScanHistoryDetail = useCallback(async (id) => {
    try {
      setScanSource('loading');
      // 백엔드 API 시도
      let session = null;
      let stocks = [];
      try {
        const res = await fetch(`${API_BASE}/api/scanner/history/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.status === 'ok' && json.stocks && json.stocks.length > 0) {
          session = json.session;
          stocks = json.stocks;
        }
      } catch (apiErr) {
        console.warn('[scan-history] API 실패, Supabase 직접 조회:', apiErr.message);
      }
      // 백엔드 실패 시 Supabase 직접 조회
      if (!session) {
        const { data: sessData, error: sessErr } = await supabase
          .from('surge_scan_sessions').select('*').eq('id', id).single();
        if (sessErr || !sessData) { alert('해당 스캔 결과를 불러올 수 없습니다.'); setScanSource(''); return; }
        session = sessData;
        // 종목 데이터 페이지네이션 로드
        let offset = 0;
        const pageSize = 1000;
        while (true) {
          const { data: stockRows, error: stockErr } = await supabase
            .from('surge_scan_stocks').select('*').eq('session_id', id)
            .order('top_manip_score', { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (stockErr || !stockRows || stockRows.length === 0) break;
          // surges_json 파싱
          stocks.push(...stockRows.map(r => ({
            ...r,
            surges: r.surges_json ? (typeof r.surges_json === 'string' ? JSON.parse(r.surges_json) : r.surges_json) : [],
          })));
          if (stockRows.length < pageSize) break;
          offset += pageSize;
        }
        if (stocks.length === 0) { alert('해당 스캔 결과를 불러올 수 없습니다.'); setScanSource(''); return; }
      }
      const detail = {
        status: 'done',
        scan_date: session.scan_date,
        market: session.market,
        source: 'db',
        stats: {
          total_scanned: session.total_scanned,
          total_found: session.total_found,
          total_surges: session.total_surges,
          high_manip_count: session.high_manip_count,
          medium_manip_count: session.medium_manip_count,
          entry_signal_count: 0,
        },
        stocks,
      };
      setScanResultWithCache(detail);
      setScanDate(detail.scan_date || '');
      setScanSource('db');
      setShowScanHistory(false);
      // ★ 성공 토스트
      const dateStr = detail.scan_date || '';
      const marketStr = session.market === 'ALL' ? '전체' : session.market;
      setScanToast({ message: `${dateStr} ${marketStr} 스캔 기록 불러오기 완료 (${stocks.length}종목)`, type: 'success' });
      setTimeout(() => setScanToast(null), 3000);
    } catch (e) {
      console.error('[scan-history] 상세 로드 실패:', e);
      setScanToast({ message: '스캔 기록 로드 실패: ' + e.message, type: 'error' });
      setTimeout(() => setScanToast(null), 4000);
      setScanSource('');
    }
  }, [setScanResultWithCache]);

  const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
  const [deletingHistory, setDeletingHistory] = useState(false);

  const toggleHistorySelect = (id, e) => {
    e.stopPropagation();
    setSelectedHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const deleteSelectedHistory = useCallback(async () => {
    if (selectedHistoryIds.size === 0) return;
    if (!confirm(`선택한 ${selectedHistoryIds.size}개의 스캔 기록을 삭제하시겠습니까?`)) return;
    setDeletingHistory(true);
    try {
      const ids = [...selectedHistoryIds];
      try {
        const res = await fetch(`${API_BASE}/api/scanner/history/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.status !== 'ok') throw new Error(json.detail || '삭제 실패');
      } catch (apiErr) {
        console.warn('[scan-history] 삭제 API 실패, Supabase 직접 삭제:', apiErr.message);
        // 종목 데이터 먼저 삭제 후 세션 삭제
        for (const sid of ids) {
          await supabase.from('surge_scan_stocks').delete().eq('session_id', sid);
        }
        const { error } = await supabase.from('surge_scan_sessions').delete().in('id', ids);
        if (error) throw error;
      }
      setSelectedHistoryIds(new Set());
      await loadScanHistoryList();
    } catch (e) { console.error('[scan-history] 삭제 실패:', e); }
    setDeletingHistory(false);
  }, [selectedHistoryIds, loadScanHistoryList]);

  // ━━━ 이전 분석 결과 상태 ━━━
  const [prevSessions, setPrevSessions] = useState([]);
  const [loadingPrevAnalysis, setLoadingPrevAnalysis] = useState(false);
  const [prevAnalysisSource, setPrevAnalysisSource] = useState('');  // '' | 'memory' | 'db_123'
  const [showPrevList, setShowPrevList] = useState(false);  // 이전 기록 목록 토글

  const applyPreset = (presetKey) => {
    setActivePreset(presetKey);
    const preset = PRESETS[presetKey];
    if (preset.params) {
      setPeriodDays(preset.params.periodDays); setPreRiseDays(preset.params.preRiseDays);
      setRisePct(preset.params.risePct); setRiseWindow(preset.params.riseWindow);
      setWeightReturns(preset.params.weightReturns); setWeightCandle(preset.params.weightCandle);
      setWeightVolume(preset.params.weightVolume);
    }
    if (presetKey === 'custom') setShowSettings(true);
  };

  // ━━━ 스캐너 기능 ━━━
  const reloadScanFromDB = async () => {
    try {
      setScanSource('loading');
      const res = await fetch(`${API_BASE}/api/scanner/latest`);
      const data = await res.json();
      if (data.status === 'done' && data.stocks?.length > 0) {
        setScanResultWithCache(data);
        setScanDate(data.scan_date || '');
        setScanSource(data.source || 'db');
      } else {
        setScanSource('');
        alert('저장된 스캔 결과가 없습니다. 스캔을 먼저 실행해주세요.');
      }
    } catch (e) {
      console.error('DB 리로드 실패:', e);
      setScanSource('');
    }
  };

  const startScan = async () => {
    setScanError(''); setScanResult(null); setScanning(true);
    setScanProgress(0); setScanMsg('스캔 요청 중...'); setSelectedScanStocks(new Set());
    try {
      const resp = await fetch(`${API_BASE}/api/scanner/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: scanMarket, period_days: scanPeriod,
          rise_pct: scanRisePct, rise_window: scanRiseWindow, min_volume_ratio: scanVolRatio,
        }),
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || '스캔 요청 실패'); }
      pollScanProgress();
    } catch (e) { setScanError(e.message); setScanning(false); }
  };

  const stopScan = async () => {
    try { await fetch(`${API_BASE}/api/scanner/stop`, { method: 'POST' }); setScanMsg('중지 요청됨...'); }
    catch (e) { console.error('중지 실패:', e); }
  };

  // ━━━ [v3.1] 폴링 — ref 기반 (이탈 후 재개 가능) ━━━
  const pollScanProgress = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    scanIntervalRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/scanner/progress`);
        const data = await resp.json();
        setScanProgress(data.progress || 0); setScanMsg(data.message || '');
        if (!data.running) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
          if (data.error && !data.has_result) { setScanError(data.error); setScanning(false); }
          else if (data.has_result) {
            const resResp = await fetch(`${API_BASE}/api/scanner/result`);
            const resData = await resResp.json();
            if (resData.status === 'done') {
              setScanResultWithCache(resData);
              setScanDate(resData.scan_date || new Date().toISOString());
              setScanSource('memory');
              saveScanToHistory(resData);
              if (resData.stopped) setScanMsg(`스캔 중지됨 — 부분 결과 ${resData.stocks?.length || 0}개 저장 완료`);
            }
            else if (resData.status === 'error') setScanError(resData.error);
            setScanning(false);
          } else {
            // ★ has_result=false 이지만 중지로 인한 것일 수 있음 → result 한번 더 확인
            try {
              const resResp = await fetch(`${API_BASE}/api/scanner/result`);
              const resData = await resResp.json();
              if (resData.status === 'done' && resData.stocks?.length > 0) {
                setScanResultWithCache(resData);
                setScanDate(resData.scan_date || new Date().toISOString());
                setScanSource('memory');
                saveScanToHistory(resData);
              }
            } catch (_e) { /* ignore */ }
            setScanning(false);
          }
        }
      } catch (e) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
        setScanError('진행률 조회 실패');
        setScanning(false);
      }
    }, 1500);
  }, []);

  const sendToAnalyzer = () => {
    if (selectedScanStocks.size === 0) return;
    const scanStocks = scanResult?.stocks || [];
    const selected = scanStocks.filter(s => selectedScanStocks.has(s.code));
    setStocks(prev => {
      const merged = [...prev];
      for (const ns of selected) {
        if (!merged.find(s => s.code === ns.code) && merged.length < 20)
          merged.push({ code: ns.code, name: ns.name });
      }
      return merged;
    });
    applyPreset('manipulation');
    setPageMode('analyzer');
  };

  // ━━━ 스캔 종목 차트 로드 ━━━
  const fetchScanChart = async (stock) => {
    if (scanChartCode === stock.code) {
      // 토글: 같은 종목 클릭 시 닫기
      setScanChartCode(null); setScanChartCandles([]); setScanChartStock(null);
      return;
    }
    setScanChartCode(stock.code);
    setScanChartStock(stock);
    setScanChartLoading(true);
    setScanChartCandles([]);
    try {
      const res = await fetch(`${API_BASE}/api/virtual-invest/candles/${stock.code}?count=120`);
      const data = await res.json();
      setScanChartCandles(data.candles || []);
    } catch (e) {
      console.error('차트 로드 실패:', e);
    } finally {
      setScanChartLoading(false);
    }
  };

  // ★ useMemo: 필터/정렬을 의존값 변경 시에만 재계산 (매 렌더링 반복 제거)
  const filteredScanResults = useMemo(() => {
    if (!scanResult?.stocks) return [];
    let list = [...scanResult.stocks];
    if (scanFilterLevel === 'high') list = list.filter(s => s.top_manip_level === 'high');
    else if (scanFilterLevel === 'medium') list = list.filter(s => s.top_manip_level === 'medium' || s.top_manip_level === 'high');
    else if (scanFilterLevel === 'entry') list = list.filter(s => s.entry_signals && s.entry_signals.should_buy);
    else if (scanFilterLevel === 'obv') list = list.filter(s => s.entry_signals?.signals?.obv?.signal);
    else if (scanFilterLevel === 'vcp') list = list.filter(s => s.entry_signals?.signals?.vcp?.signal);
    else if (scanFilterLevel === 'dtw') list = list.filter(s => s.entry_signals?.signals?.partial_dtw?.signal);
    const dir = scanSortDir === 'asc' ? 1 : -1;
    if (scanSortKey === 'manip_score') list.sort((a, b) => dir * (b.top_manip_score - a.top_manip_score));
    else if (scanSortKey === 'rise_pct') list.sort((a, b) => dir * (b.latest_rise_pct - a.latest_rise_pct));
    else if (scanSortKey === 'date') list.sort((a, b) => dir * (b.latest_surge_date||'').localeCompare(a.latest_surge_date||''));
    else if (scanSortKey === 'from_peak') list.sort((a, b) => dir * (a.latest_from_peak - b.latest_from_peak));
    else if (scanSortKey === 'entry_score') list.sort((a, b) => dir * ((b.entry_signals?.entry_score||0) - (a.entry_signals?.entry_score||0)));
    else if (scanSortKey === 'name') list.sort((a, b) => dir * (a.name||'').localeCompare(b.name||''));
    else if (scanSortKey === 'current_price') list.sort((a, b) => dir * ((b.current_price||0) - (a.current_price||0)));
    else if (scanSortKey === 'surge_count') list.sort((a, b) => dir * ((b.surge_count||0) - (a.surge_count||0)));
    else if (scanSortKey === 'manip_label') list.sort((a, b) => dir * (a.top_manip_label||'').localeCompare(b.top_manip_label||''));
    return list;
  }, [scanResult?.stocks, scanFilterLevel, scanSortKey, scanSortDir]);

  const toggleScanStock = (code) => {
    setSelectedScanStocks(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else if (next.size < 20) next.add(code);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedScanStocks(new Set(filteredScanResults.slice(0, 20).map(s => s.code)));
  };

  // ━━━ 분석기 기능 ━━━
  useEffect(() => {
    if (!searchKeyword.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/pattern/search`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: searchKeyword.trim() }),
        });
        const data = await resp.json(); setSearchResults(data.results || []); setShowDropdown(true);
      } catch (e) { console.error('검색 실패:', e); }
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchKeyword]);

  useEffect(() => {
    const handler = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addStock = (code, name) => {
    if (stocks.find(s => s.code === code)) return;
    if (stocks.length >= 20) { alert('최대 20개까지 추가 가능합니다.'); return; }
    setStocks(prev => [...prev, { code, name }]); setSearchKeyword(''); setShowDropdown(false);
  };
  const removeStock = (code) => setStocks(prev => prev.filter(s => s.code !== code));

  const startAnalysis = async () => {
    if (stocks.length === 0) { setError('종목을 1개 이상 추가하세요.'); return; }
    setError(''); setResult(null); setAnalyzing(true); setProgress(0); setProgressMsg('분석 요청 중...'); setPrevAnalysisSource('');
    try {
      const names = {}; stocks.forEach(s => { names[s.code] = s.name; });
      const resp = await fetch(`${API_BASE}/api/pattern/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codes: stocks.map(s => s.code), names, period_days: periodDays,
          pre_rise_days: preRiseDays, rise_pct: risePct, rise_window: riseWindow,
          weight_returns: weightReturns, weight_candle: weightCandle, weight_volume: weightVolume,
        }),
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || '분석 요청 실패'); }
      pollProgress();
    } catch (e) { setError(e.message); setAnalyzing(false); }
  };

  const pollProgress = useCallback(() => {
    // ★ 이전 interval 정리 (메모리 누수 방지)
    if (analyzerIntervalRef.current) {
      clearInterval(analyzerIntervalRef.current);
      analyzerIntervalRef.current = null;
    }
    analyzerIntervalRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/pattern/progress`);
        const data = await resp.json(); setProgress(data.progress || 0); setProgressMsg(data.message || '');
        if (!data.running) {
          clearInterval(analyzerIntervalRef.current);
          analyzerIntervalRef.current = null;
          if (data.error) { setError(data.error); setAnalyzing(false); }
          else if (data.has_result) {
            const resResp = await fetch(`${API_BASE}/api/pattern/result`);
            const resData = await resResp.json();
            if (resData.status === 'done') { setResult(resData); setActiveTab(0); setPrevAnalysisSource('memory'); }
            else if (resData.status === 'error') setError(resData.error);
            setAnalyzing(false);
          }
        }
      } catch (e) {
        clearInterval(analyzerIntervalRef.current);
        analyzerIntervalRef.current = null;
        setError('진행률 조회 실패'); setAnalyzing(false);
      }
    }, 1500);
  }, []);

  // ━━━ 분석기 모드 진입 시: 이전 결과 자동 로드 ━━━
  useEffect(() => {
    if (pageMode !== 'analyzer') return;
    let cancelled = false;

    (async () => {
      try {
        // 1) 진행 중인 분석 확인
        const progResp = await fetch(`${API_BASE}/api/pattern/progress`);
        const progData = await progResp.json();
        if (cancelled) return;

        if (progData.running) {
          setAnalyzing(true);
          setProgress(progData.progress || 0);
          setProgressMsg(progData.message || '분석 진행 중...');
          pollProgress();
          return;
        }

        // 2) 메모리에 방금 완료된 결과 있으면 표시
        if (!progData.running && progData.has_result && !result) {
          try {
            const resResp = await fetch(`${API_BASE}/api/pattern/result`);
            const resData = await resResp.json();
            if (!cancelled && resData.status === 'done') {
              setResult(resData);
              setActiveTab(0);
              setPrevAnalysisSource('memory');
            }
          } catch (e) { /* ignore */ }
        }

        // 3) DB에서 이전 세션 목록 로드
        const prevResp = await fetch(`${API_BASE}/api/pattern/previous`);
        const prevData = await prevResp.json();
        if (cancelled) return;

        if (prevData.status === 'ok') {
          setPrevSessions(prevData.sessions || []);

          // 4) ★ 결과가 아직 없으면 → 최신 세션 자동 로드
          if (!result && !progData.has_result && prevData.sessions?.length > 0) {
            const latestSession = prevData.sessions[0];
            setLoadingPrevAnalysis(true);
            try {
              const detailResp = await fetch(`${API_BASE}/api/pattern/previous/${latestSession.id}`);
              const detailData = await detailResp.json();
              if (!cancelled && detailData.status === 'done') {
                setResult(detailData);
                setActiveTab(0);
                setPrevAnalysisSource(`db_${latestSession.id}`);
                // 종목 목록 복원
                if (detailData.stock_names) {
                  const restoredStocks = Object.entries(detailData.stock_names).map(([code, name]) => ({ code, name }));
                  setStocks(restoredStocks);
                }
                if (detailData.preset && PRESETS[detailData.preset]) {
                  applyPreset(detailData.preset);
                }
              }
            } catch (e) { console.error('최신 결과 자동 로드 실패:', e); }
            if (!cancelled) setLoadingPrevAnalysis(false);
          }
        }
      } catch (e) {
        console.error('이전 분석 결과 로드 실패:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (analyzerIntervalRef.current) {
        clearInterval(analyzerIntervalRef.current);
        analyzerIntervalRef.current = null;
      }
    };
  }, [pageMode]);

  // ━━━ 이전 분석 결과 상세 로드 ━━━
  const loadPreviousAnalysis = async (sessionId) => {
    setLoadingPrevAnalysis(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/api/pattern/previous/${sessionId}`);
      const data = await resp.json();
      if (data.status === 'done') {
        setResult(data);
        setActiveTab(0);
        setPrevAnalysisSource(`db_${sessionId}`);
        // 종목 목록 복원
        if (data.stock_names) {
          const restoredStocks = Object.entries(data.stock_names).map(([code, name]) => ({ code, name }));
          setStocks(restoredStocks);
        }
        // 프리셋 복원
        if (data.preset && PRESETS[data.preset]) {
          applyPreset(data.preset);
        }
      } else {
        setError(data.message || '결과를 불러올 수 없습니다.');
      }
    } catch (e) {
      setError('이전 결과 로드 실패: ' + e.message);
    } finally {
      setLoadingPrevAnalysis(false);
    }
  };

  const currentPreset = PRESETS[activePreset];

  // ━━━ 렌더링 ━━━
  return (
    <div style={{ minHeight:'100vh', background:COLORS.bg, color:COLORS.text,
      fontFamily:"'Pretendard',-apple-system,sans-serif", padding:'20px', maxWidth:1200, margin:'0 auto', position:'relative' }}>

      {/* ★ 토스트 알림 */}
      {scanToast && (<>
        <style>{`@keyframes pdToastIn{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
        <div style={{
          position:'fixed', top:24, left:'50%', transform:'translateX(-50%)', zIndex:9999,
          background: scanToast.type === 'success' ? '#065f46' : '#991b1b',
          border: `1px solid ${scanToast.type === 'success' ? '#10b981' : '#ef4444'}`,
          color:'#fff', padding:'12px 24px', borderRadius:10,
          fontSize:14, fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,0.4)',
          display:'flex', alignItems:'center', gap:8,
          animation:'pdToastIn 0.3s ease-out',
        }}>
          <span>{scanToast.type === 'success' ? '\u2705' : '\u274c'}</span>
          {scanToast.message}
        </div>
      </>)}

      {/* 헤더 */}
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:26 }}>🔍</span> 급상승 패턴 탐지기
          <span style={{ fontSize:11, background:COLORS.accentDim, color:COLORS.accent,
            padding:'3px 10px', borderRadius:20, fontWeight:500 }}>DTW Engine v3.1</span>
        </h1>
        <p style={{ color:COLORS.textDim, fontSize:13, marginTop:6 }}>
          전종목 급상승 스캔 → 작전주/세력주 발굴 → DTW 패턴 분석
        </p>
      </div>

      {/* 페이지 모드 탭 */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:COLORS.card, borderRadius:12,
        padding:4, border:`1px solid ${COLORS.cardBorder}` }}>
        {[
          { k:'scanner', l:'🚀 급상승 종목 발굴', c:COLORS.red, cd:COLORS.redDim },
          { k:'analyzer', l:'🔬 패턴 분석기', c:COLORS.accent, cd:COLORS.accentDim },
          { k:'addstock', l:'➕ 개별종목추가', c:COLORS.green, cd:COLORS.greenDim },
        ].map(m => (
          <button key={m.k} onClick={() => setPageMode(m.k)} style={{
            flex:1, padding:'12px 0', fontSize:14, fontWeight:700, border:'none', borderRadius:10,
            cursor:'pointer', background:pageMode===m.k?m.cd:'transparent',
            color:pageMode===m.k?m.c:COLORS.textDim, transition:'all 0.2s' }}>{m.l}</button>
        ))}
      </div>

      {/* ━━━ 페이지 1: 스캐너 ━━━ */}
      {pageMode === 'scanner' && (<div>
        <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`,
          borderRadius:12, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:16, color:COLORS.red }}>
            🚀 전종목 급상승 스캐너
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',
            gap:14, marginBottom:16 }}>
            <FilterGroup label="시장 선택" options={[{v:'ALL',l:'전체'},{v:'KOSPI',l:'KOSPI'},{v:'KOSDAQ',l:'KOSDAQ'}]}
              value={scanMarket} setter={setScanMarket} color={COLORS.red} disabled={scanning} />
            <FilterGroup label="조회 기간" options={[{v:3,l:'3일'},{v:5,l:'5일'},{v:10,l:'10일'},{v:15,l:'15일'},{v:30,l:'30일'},{v:180,l:'6개월'},{v:365,l:'1년'},{v:600,l:'2년'}]}
              value={scanPeriod} setter={setScanPeriod} color={COLORS.red} disabled={scanning} />
            <FilterGroup label="급상승 기준" options={[{v:5,l:'+5%'},{v:10,l:'+10%'},{v:15,l:'+15%'},{v:20,l:'+20%'},{v:30,l:'+30%'},{v:50,l:'+50%'},{v:100,l:'+100%'}]}
              value={scanRisePct} setter={setScanRisePct} color={COLORS.red} disabled={scanning} />
            <FilterGroup label="상승 기간" options={[{v:3,l:'3일'},{v:5,l:'5일'},{v:10,l:'10일'}]}
              value={scanRiseWindow} setter={setScanRiseWindow} color={COLORS.red} disabled={scanning} />
            <FilterGroup label="최소 거래량 배율" options={[{v:1.5,l:'1.5배'},{v:2.0,l:'2배'},{v:3.0,l:'3배'},{v:5.0,l:'5배'}]}
              value={scanVolRatio} setter={setScanVolRatio} color={COLORS.red} disabled={scanning} />
          </div>
          <div style={{ display:'flex', gap:10 }}>
            {!scanning ? (
              <button onClick={startScan} style={{ padding:'12px 32px', fontSize:15, fontWeight:700,
                borderRadius:10, border:'none', cursor:'pointer',
                background:`linear-gradient(135deg, ${COLORS.red}, #dc2626)`, color:COLORS.white }}>
                🚀 전종목 스캔 시작</button>
            ) : (
              <button onClick={stopScan} style={{ padding:'12px 32px', fontSize:15, fontWeight:700,
                borderRadius:10, border:`2px solid ${COLORS.red}`, cursor:'pointer',
                background:'transparent', color:COLORS.red }}>⏹ 스캔 중지</button>
            )}
            <button onClick={() => { setShowScanHistory(!showScanHistory); if (!showScanHistory) loadScanHistoryList(); }}
              style={{ padding:'10px 18px', fontSize:13, fontWeight:600, borderRadius:10, cursor:'pointer',
                border:`1px solid ${showScanHistory ? '#4ade80' : '#22c55e'}`,
                background: showScanHistory ? 'rgba(74,222,128,0.15)' : 'rgba(34,197,94,0.08)',
                color: showScanHistory ? '#4ade80' : '#22c55e' }}>
              📋 이전 기록</button>
            <div style={{ fontSize:12, color:COLORS.textDim, alignSelf:'center' }}>
              {scanMarket==='ALL'?'전체':scanMarket} 종목 | {scanRiseWindow}일 내 +{scanRisePct}% 이상 | 거래량 {scanVolRatio}배↑
            </div>
          </div>

          {showScanHistory && (
            <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:10, padding:14, marginTop:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:600, color:COLORS.text }}>스캔 히스토리 (최근 20개)</div>
                {selectedHistoryIds.size > 0 && (
                  <button onClick={deleteSelectedHistory} disabled={deletingHistory}
                    style={{ padding:'5px 14px', fontSize:11, fontWeight:600, borderRadius:6, border:`1px solid ${COLORS.red}`,
                      background:'rgba(239,68,68,0.1)', color:COLORS.red, cursor:deletingHistory?'wait':'pointer' }}>
                    {deletingHistory ? '삭제 중...' : `선택 삭제 (${selectedHistoryIds.size})`}
                  </button>
                )}
              </div>
              {loadingScanHistory ? (
                <div style={{ textAlign:'center', padding:16, color:COLORS.textDim, fontSize:12 }}>불러오는 중...</div>
              ) : scanHistoryList.length === 0 ? (
                <div style={{ textAlign:'center', padding:16, color:COLORS.textDim, fontSize:12 }}>저장된 스캔 기록이 없습니다.</div>
              ) : (
                <div style={{ maxHeight:300, overflowY:'auto' }}>
                  <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom:`1px solid ${COLORS.cardBorder}`, color:COLORS.textDim }}>
                        <th style={{ padding:'6px 8px', textAlign:'center', width:32 }}>
                          <div onClick={() => {
                            if (selectedHistoryIds.size === scanHistoryList.length) setSelectedHistoryIds(new Set());
                            else setSelectedHistoryIds(new Set(scanHistoryList.map(h => h.id)));
                          }} style={{ width:16, height:16, borderRadius:3, border:`2px solid ${selectedHistoryIds.size===scanHistoryList.length?COLORS.accent:COLORS.cardBorder}`, background:selectedHistoryIds.size===scanHistoryList.length?COLORS.accent:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', margin:'0 auto', fontSize:10, color:COLORS.white, fontWeight:700 }}>
                            {selectedHistoryIds.size === scanHistoryList.length && '✓'}
                          </div>
                        </th>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>스캔일시</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>시장</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>조회기간</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>급상승기준</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>상승기간</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}>거래량배율</th>
                        <th style={{ padding:'6px 8px', textAlign:'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanHistoryList.map(h => {
                        const sel = selectedHistoryIds.has(h.id);
                        const periodLabel = h.period_days >= 730 ? '2년' : h.period_days >= 365 ? '1년' : '6개월';
                        return (
                        <tr key={h.id} style={{ borderBottom:`1px solid ${COLORS.cardBorder}`, cursor:'pointer', background:sel?'rgba(59,130,246,0.06)':'transparent' }}
                          onClick={() => loadScanHistoryDetail(h.id)}
                          onMouseEnter={e => { if(!sel) e.currentTarget.style.background='rgba(59,130,246,0.04)'; }}
                          onMouseLeave={e => { if(!sel) e.currentTarget.style.background='transparent'; }}>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>
                            <div onClick={(e) => toggleHistorySelect(h.id, e)}
                              style={{ width:16, height:16, borderRadius:3, border:`2px solid ${sel?COLORS.accent:COLORS.cardBorder}`, background:sel?COLORS.accent:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', margin:'0 auto', fontSize:10, color:COLORS.white, fontWeight:700 }}>
                              {sel && '✓'}
                            </div>
                          </td>
                          <td style={{ padding:'6px 8px' }}>{(() => { try { const d = new Date(h.scan_date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } catch { return h.scan_date; } })()}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>{h.market==='ALL'?'전체':h.market}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>{periodLabel}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center', color:COLORS.green, fontWeight:600 }}>+{h.rise_pct}%</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>{h.rise_window}일</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>{h.min_volume_ratio}배</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>
                            <span style={{ fontSize:10, color:COLORS.accent, fontWeight:600 }}>불러오기</span>
                          </td>
                        </tr>);
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {scanning && <ProgressBar progress={scanProgress} msg={scanMsg} color={COLORS.red} />}
        {scanError && <ErrorBox msg={scanError} onClose={() => setScanError('')} />}

        {/* ★ 저장 패턴으로 매칭 스캔 섹션 */}
        <div style={{ background:COLORS.card, border:`1px solid ${showPatternScan ? 'rgba(139,92,246,0.4)' : COLORS.cardBorder}`,
          borderRadius:12, marginBottom:16, overflow:'hidden', transition:'all 0.2s' }}>
          <div onClick={() => { setShowPatternScan(!showPatternScan); if (!showPatternScan && savedPatterns.length === 0) fetchSavedPatterns(); }}
            style={{ padding:'14px 20px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center',
              background: showPatternScan ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
            <span style={{ fontSize:14, fontWeight:700, color:'#8b5cf6' }}>📚 저장 패턴으로 매칭 스캔</span>
            <span style={{ fontSize:12, color:COLORS.textDim }}>{showPatternScan ? '▲ 접기' : '▼ 펼치기'}</span>
          </div>
          {showPatternScan && (
            <div style={{ padding:'0 20px 16px' }}>
              {savedPatternsLoading ? (
                <div style={{ textAlign:'center', padding:20, color:COLORS.textDim, fontSize:12 }}>⏳ 패턴 목록 로드 중...</div>
              ) : savedPatterns.length === 0 ? (
                <div style={{ textAlign:'center', padding:20, color:COLORS.textDim, fontSize:12 }}>저장된 패턴이 없습니다. 분석기에서 패턴을 먼저 저장하세요.</div>
              ) : (<>
                <div style={{ fontSize:11, color:COLORS.textDim, marginBottom:8 }}>매칭할 패턴 선택 (복수 선택 가능)</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                  {savedPatterns.filter(p => p.is_active).map(p => {
                    const sel = selectedPatternIds.has(p.id);
                    return (
                      <button key={p.id} onClick={() => {
                        setSelectedPatternIds(prev => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                          return next;
                        });
                      }}
                      style={{ padding:'6px 12px', fontSize:11, fontWeight:600, borderRadius:8, cursor:'pointer',
                        border: sel ? '2px solid #8b5cf6' : '1px solid rgba(139,92,246,0.3)',
                        background: sel ? 'rgba(139,92,246,0.2)' : 'transparent',
                        color: sel ? '#8b5cf6' : COLORS.textDim }}>
                        {sel ? '✓ ' : ''}{p.name}
                        <span style={{ marginLeft:6, opacity:0.6 }}>+{p.avg_rise_pct?.toFixed(0)}%</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12, flexWrap:'wrap' }}>
                  <div style={{ fontSize:11, color:COLORS.textDim }}>
                    최소 유사도: <b style={{ color:'#8b5cf6' }}>{patternMinSimilarity}%</b>
                  </div>
                  <input type="range" min={40} max={90} step={5} value={patternMinSimilarity}
                    onChange={e => setPatternMinSimilarity(Number(e.target.value))}
                    style={{ flex:1, maxWidth:200, accentColor:'#8b5cf6' }} />
                  <button onClick={() => runPatternScan(false)} disabled={patternScanning || selectedPatternIds.size === 0}
                    style={{ padding:'8px 20px', fontSize:13, fontWeight:700, borderRadius:8, cursor:'pointer',
                      border:'none', background: patternScanning ? '#555' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      color:'#fff', opacity: selectedPatternIds.size === 0 ? 0.4 : 1 }}>
                    {patternScanning ? '⏳ 스캔 중...' : '🔍 패턴 매칭 시작'}
                  </button>
                </div>
                {/* 패턴 스캔 결과 */}
                {patternScanResult && (
                  <div style={{ marginTop:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#8b5cf6' }}>
                        📊 매칭 결과: {patternScanResult.total_scanned?.toLocaleString()}개 스캔 → {patternScanResult.matches?.length || 0}개 발견
                      </div>
                      {patternScanResult.fromCache && (
                        <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10,
                          background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)', color:'#22c55e' }}>
                          저장된 결과{patternScanResult.scanned_at ? ` (${new Date(patternScanResult.scanned_at).toLocaleDateString('ko-KR')})` : ''}
                        </span>
                      )}
                      <button onClick={() => runPatternScan(true)} disabled={patternScanning}
                        style={{ padding:'3px 10px', fontSize:10, fontWeight:600, borderRadius:6, cursor:'pointer',
                          border:'1px solid rgba(251,146,60,0.4)', background:'rgba(251,146,60,0.1)', color:'#fb923c' }}>
                        🔄 재스캔
                      </button>
                    </div>
                    {patternScanResult.patterns_used?.map((pu, i) => (
                      <span key={i} style={{ fontSize:10, padding:'2px 8px', borderRadius:10, marginRight:6,
                        background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.25)', color:'#8b5cf6' }}>
                        {pu.name}: {pu.match_count}개
                      </span>
                    ))}
                    {(patternScanResult.matches || []).length > 0 && (
                      <PatternScanMatchTable
                        rawMatches={patternScanResult.matches}
                        patternSortKey={patternSortKey} setPatternSortKey={setPatternSortKey}
                        patternSortDir={patternSortDir} setPatternSortDir={setPatternSortDir}
                        selectedPatternStocks={selectedPatternStocks} setSelectedPatternStocks={setSelectedPatternStocks}
                        openRegModal={openRegModal}
                      />
                    )}
                  </div>
                )}
              </>)}
            </div>
          )}
        </div>

        {loadingPrev && !scanning && !scanResult && (
          <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`,
            borderRadius:12, padding:20, marginBottom:16, textAlign:'center' }}>
            <div style={{ fontSize:14, color:COLORS.textDim }}>⏳ 이전 스캔 결과를 불러오는 중...</div>
          </div>
        )}

        {scanResult && <ScanResultView scanResult={scanResult} scanSortKey={scanSortKey}
          setScanSortKey={setScanSortKey} scanSortDir={scanSortDir} setScanSortDir={setScanSortDir} scanFilterLevel={scanFilterLevel}
          setScanFilterLevel={setScanFilterLevel} selectedScanStocks={selectedScanStocks}
          toggleScanStock={toggleScanStock} selectAllVisible={selectAllVisible}
          setSelectedScanStocks={setSelectedScanStocks} sendToAnalyzer={sendToAnalyzer}
          filteredScanResults={filteredScanResults}
          scanDate={scanDate} scanSource={scanSource} onReload={reloadScanFromDB}
          scanChartCode={scanChartCode} scanChartCandles={scanChartCandles}
          scanChartLoading={scanChartLoading} fetchScanChart={fetchScanChart}
          scanHistoryList={scanHistoryList} showScanHistory={showScanHistory}
          setShowScanHistory={setShowScanHistory} loadingScanHistory={loadingScanHistory}
          loadScanHistoryList={loadScanHistoryList} loadScanHistoryDetail={loadScanHistoryDetail}
          registerCandidates={registerCandidates} />}

        {/* ━━━ 매수 후보 풀 패널 ━━━ */}
        <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, padding:14, marginBottom:16, marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}
            onClick={() => { setShowCandidatePanel(!showCandidatePanel); if (!showCandidatePanel) fetchCandidates(); }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:18 }}>📋</span>
              <span style={{ fontSize:14, fontWeight:700, color:COLORS.text }}>매수 후보 풀</span>
              <span style={{ fontSize:12, color:'#f59e0b', fontWeight:600 }}>
                ({buyCandidates.length}개 대기중)
              </span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={(e) => { e.stopPropagation(); setShowCandidateSettings(!showCandidateSettings); }}
                style={{ padding:'4px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
                  border:`1px solid ${COLORS.cardBorder}`, background:'transparent', color:COLORS.textDim }}>
                ⚙️ 설정
              </button>
              <button onClick={(e) => { e.stopPropagation(); fetchCandidates(); }}
                style={{ padding:'4px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
                  border:`1px solid ${COLORS.cardBorder}`, background:'transparent', color:COLORS.textDim }}>
                🔄
              </button>
              <span style={{ fontSize:12, color:COLORS.textDim }}>{showCandidatePanel ? '▲' : '▼'}</span>
            </div>
          </div>

          {/* 설정 패널 */}
          {showCandidateSettings && candidateSettings && (
            <div style={{ marginTop:12, padding:12, background:'rgba(245,158,11,0.05)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:8 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#f59e0b', marginBottom:10 }}>⚙️ 자동 등록 설정</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:12 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, color:COLORS.text }}>
                  <input type="checkbox" checked={candidateSettings.auto_register || false}
                    onChange={e => setCandidateSettings({...candidateSettings, auto_register: e.target.checked})} />
                  스캔 완료 시 자동 등록
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, color:COLORS.text }}>
                  최소 종합점수:
                  <input type="number" value={candidateSettings.min_composite_score || 60} min={0} max={100}
                    onChange={e => setCandidateSettings({...candidateSettings, min_composite_score: Number(e.target.value)})}
                    style={{ width:50, padding:'2px 4px', borderRadius:4, border:`1px solid ${COLORS.cardBorder}`, background:COLORS.bg, color:COLORS.text, fontSize:12 }} />
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, color:COLORS.text }}>
                  최소 진입점수:
                  <input type="number" value={candidateSettings.min_entry_score || 50} min={0} max={100}
                    onChange={e => setCandidateSettings({...candidateSettings, min_entry_score: Number(e.target.value)})}
                    style={{ width:50, padding:'2px 4px', borderRadius:4, border:`1px solid ${COLORS.cardBorder}`, background:COLORS.bg, color:COLORS.text, fontSize:12 }} />
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, color:COLORS.text }}>
                  최대 후보 수:
                  <input type="number" value={candidateSettings.max_candidates || 10} min={1} max={50}
                    onChange={e => setCandidateSettings({...candidateSettings, max_candidates: Number(e.target.value)})}
                    style={{ width:50, padding:'2px 4px', borderRadius:4, border:`1px solid ${COLORS.cardBorder}`, background:COLORS.bg, color:COLORS.text, fontSize:12 }} />
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, color:COLORS.text }}>
                  유효기간(일):
                  <input type="number" value={candidateSettings.expire_days || 3} min={1} max={30}
                    onChange={e => setCandidateSettings({...candidateSettings, expire_days: Number(e.target.value)})}
                    style={{ width:50, padding:'2px 4px', borderRadius:4, border:`1px solid ${COLORS.cardBorder}`, background:COLORS.bg, color:COLORS.text, fontSize:12 }} />
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, color:COLORS.text }}>
                  <input type="checkbox" checked={candidateSettings.exclude_ma5_down || false}
                    onChange={e => setCandidateSettings({...candidateSettings, exclude_ma5_down: e.target.checked})} />
                  MA5 하향 제외
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, color:COLORS.text }}>
                  <input type="checkbox" checked={candidateSettings.exclude_rsi_overbought || false}
                    onChange={e => setCandidateSettings({...candidateSettings, exclude_rsi_overbought: e.target.checked})} />
                  RSI 과매수 제외
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, color:COLORS.text }}>
                  종목당 투자금:
                  <input type="number" value={candidateSettings.capital_per_stock || 300000} step={100000}
                    onChange={e => setCandidateSettings({...candidateSettings, capital_per_stock: Number(e.target.value)})}
                    style={{ width:80, padding:'2px 4px', borderRadius:4, border:`1px solid ${COLORS.cardBorder}`, background:COLORS.bg, color:COLORS.text, fontSize:12 }} />
                </label>
              </div>
              <div style={{ marginTop:10, display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={() => setShowCandidateSettings(false)}
                  style={{ padding:'5px 14px', fontSize:12, borderRadius:6, cursor:'pointer', border:`1px solid ${COLORS.cardBorder}`, background:'transparent', color:COLORS.textDim }}>닫기</button>
                <button onClick={() => saveCandidateSettings(candidateSettings)}
                  style={{ padding:'5px 14px', fontSize:12, fontWeight:600, borderRadius:6, cursor:'pointer', border:'none', background:'#f59e0b', color:'#000' }}>저장</button>
              </div>
            </div>
          )}

          {/* 후보 목록 */}
          {showCandidatePanel && (
            <div style={{ marginTop:12 }}>
              {candidatesLoading ? (
                <div style={{ textAlign:'center', padding:20, color:COLORS.textDim, fontSize:13 }}>로딩 중...</div>
              ) : buyCandidates.length === 0 ? (
                <div style={{ textAlign:'center', padding:20, color:COLORS.textDim, fontSize:13 }}>
                  등록된 후보가 없습니다.<br/>
                  <span style={{ fontSize:11 }}>스캔 결과에서 종목을 선택 후 "📋 후보등록" 버튼을 클릭하세요.</span>
                </div>
              ) : (
                <div>
                  {buyCandidates.map((c, i) => {
                    const daysLeft = c.expires_at ? Math.max(0, Math.ceil((new Date(c.expires_at) - new Date()) / 86400000)) : 0;
                    const scoreColor = c.composite_score >= 80 ? COLORS.red : c.composite_score >= 60 ? '#f59e0b' : COLORS.textDim;
                    return (
                      <div key={c.id} style={{
                        display:'grid', gridTemplateColumns:'1fr 70px 60px 60px 50px 70px',
                        padding:'8px 10px', fontSize:12, alignItems:'center',
                        borderBottom: i < buyCandidates.length - 1 ? `1px solid ${COLORS.cardBorder}` : 'none',
                        background: daysLeft <= 1 ? 'rgba(220,38,38,0.05)' : 'transparent',
                      }}>
                        <div>
                          <span style={{ fontWeight:600, color:COLORS.text }}>{c.name}</span>
                          <span style={{ color:COLORS.textDim, marginLeft:4, fontSize:10 }}>{c.code}</span>
                          {c.source && <span style={{ marginLeft:6, fontSize:9, padding:'1px 4px', borderRadius:3, background:'rgba(245,158,11,0.15)', color:'#f59e0b' }}>{c.source}</span>}
                        </div>
                        <div style={{ textAlign:'right', color:COLORS.text }}>{c.current_price?.toLocaleString() || '-'}</div>
                        <div style={{ textAlign:'center', color:scoreColor, fontWeight:600 }}>{c.composite_score || '-'}</div>
                        <div style={{ textAlign:'center', color:COLORS.textDim }}>{c.entry_score || '-'}</div>
                        <div style={{ textAlign:'center', color: daysLeft <= 1 ? COLORS.red : COLORS.textDim, fontSize:11 }}>D-{daysLeft}</div>
                        <div style={{ textAlign:'right' }}>
                          <button onClick={() => deleteCandidates([c.id])}
                            style={{ padding:'3px 8px', fontSize:10, borderRadius:4, cursor:'pointer',
                              border:`1px solid ${COLORS.cardBorder}`, background:'transparent', color:COLORS.textDim }}>삭제</button>
                        </div>
                      </div>
                    );
                  })}
                  {/* 헤더 */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 60px 60px 50px 70px',
                    padding:'6px 10px', fontSize:10, color:COLORS.textDim, fontWeight:600, borderBottom:`1px solid ${COLORS.cardBorder}`, order:-1 }}>
                    <span>종목</span><span style={{textAlign:'right'}}>현재가</span><span style={{textAlign:'center'}}>종합</span><span style={{textAlign:'center'}}>진입</span><span style={{textAlign:'center'}}>잔여</span><span></span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {!scanResult && !scanning && !loadingPrev && (
          <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`,
            borderRadius:12, padding:40, textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🚀</div>
            <h3 style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>전종목 급상승 종목을 자동으로 찾아드립니다</h3>
            <p style={{ fontSize:13, color:COLORS.textDim, lineHeight:1.8 }}>
              DB에 등록된 전종목(~2,500개)을 스캔하여<br/>
              급상승 이력이 있는 종목을 발굴하고, 작전 세력 의심 종목을 표시합니다
            </p>
            <div style={{ marginTop:20, display:'inline-flex', gap:16, fontSize:12, color:COLORS.textDim }}>
              <span>① 조건 설정</span><span>→</span><span>② 전종목 스캔</span>
              <span>→</span><span>③ 세력주 발굴</span><span>→</span><span>④ 선택 후 패턴 분석</span>
            </div>
          </div>
        )}
      </div>)}

      {/* ━━━ 페이지 2: 패턴 분석기 ━━━ */}
      {pageMode === 'analyzer' && (<div>

        {/* ── 자동 로드 중 표시 ── */}
        {loadingPrevAnalysis && !result && !analyzing && (
          <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`,
            borderRadius:12, padding:20, marginBottom:16, textAlign:'center' }}>
            <div style={{ fontSize:14, color:COLORS.accent }}>⏳ 마지막 분석 결과를 불러오는 중...</div>
          </div>
        )}

        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          {Object.values(PRESETS).map(preset => {
            const isActive = activePreset === preset.key;
            return (
              <button key={preset.key} onClick={() => applyPreset(preset.key)} disabled={analyzing}
                style={{ flex:'1 1 auto', minWidth:180, padding:'14px 18px', borderRadius:12, cursor:'pointer',
                  background:isActive?`${preset.color}15`:COLORS.card,
                  border:`2px solid ${isActive?preset.color:COLORS.cardBorder}`,
                  textAlign:'left', opacity:analyzing?0.5:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:isActive?preset.color:COLORS.text, marginBottom:4 }}>{preset.label}</div>
                <div style={{ fontSize:11, color:COLORS.textDim, lineHeight:1.4 }}>{preset.desc}</div>
                {isActive && preset.params && (
                  <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>
                    <span style={tagStyle(preset.color)}>분석 {preset.params.preRiseDays}일</span>
                    <span style={tagStyle(preset.color)}>급상승 +{preset.params.risePct}%</span>
                    <span style={tagStyle(preset.color)}>기간 {preset.params.riseWindow}일</span>
                    <span style={tagStyle(preset.color)}>거래량 {(preset.params.weightVolume*100).toFixed(0)}%</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, padding:18, marginBottom:16 }}>
          <div style={{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
            <div ref={searchRef} style={{ position:'relative', flex:1, minWidth:220 }}>
              <input value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)}
                placeholder="종목명 또는 코드 검색..." disabled={analyzing}
                style={{ width:'100%', padding:'10px 14px', fontSize:14, background:'#1a2234',
                  border:`1px solid ${COLORS.cardBorder}`, borderRadius:8, color:COLORS.text, outline:'none' }}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)} />
              {showDropdown && searchResults.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#1a2234',
                  border:`1px solid ${COLORS.cardBorder}`, borderRadius:8, marginTop:4, maxHeight:240,
                  overflowY:'auto', zIndex:100, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
                  {searchResults.map((r, i) => (
                    <div key={r.code} onClick={() => addStock(r.code, r.name)}
                      style={{ padding:'10px 14px', cursor:'pointer', fontSize:13,
                        borderBottom:i<searchResults.length-1?`1px solid ${COLORS.cardBorder}`:'none',
                        display:'flex', justifyContent:'space-between', alignItems:'center' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(59,130,246,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <span style={{ fontWeight:600 }}>{r.name}</span>
                      <span style={{ color:COLORS.textDim, fontSize:12 }}>{r.code}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowSettings(!showSettings)} style={{ padding:'10px 16px', fontSize:13,
              borderRadius:8, cursor:'pointer', background:showSettings?COLORS.accentDim:'transparent',
              color:showSettings?COLORS.accent:COLORS.textDim,
              border:`1px solid ${showSettings?COLORS.accent:COLORS.cardBorder}` }}>⚙️ 상세설정</button>
            <button onClick={startAnalysis} disabled={analyzing||stocks.length===0}
              style={{ padding:'10px 24px', fontSize:14, fontWeight:600, borderRadius:8, border:'none',
                cursor:analyzing?'wait':'pointer', background:analyzing?COLORS.gray:stocks.length===0?'#374151':currentPreset.color,
                color:stocks.length===0?COLORS.textDim:COLORS.white, opacity:analyzing?0.7:1 }}>
              {analyzing?'분석 중...':'🔍 분석 시작'}</button>
          </div>

          {showSettings && <SettingsPanel {...{periodDays,setPeriodDays,preRiseDays,setPreRiseDays,
            risePct,setRisePct,riseWindow,setRiseWindow,weightReturns,setWeightReturns,
            weightCandle,setWeightCandle,weightVolume,setWeightVolume,setActivePreset}} />}

          {stocks.length > 0 && (
            <div style={{ marginTop:12, display:'flex', flexWrap:'wrap', gap:8 }}>
              {stocks.map(s => (
                <span key={s.code} style={{ display:'inline-flex', alignItems:'center', gap:6,
                  padding:'5px 12px', background:'#1a2234', borderRadius:20, fontSize:13,
                  border:`1px solid ${COLORS.cardBorder}` }}>
                  <span style={{ fontWeight:600 }}>{s.name}</span>
                  <span style={{ color:COLORS.textDim, fontSize:11 }}>{s.code}</span>
                  <span onClick={() => !analyzing && removeStock(s.code)}
                    style={{ cursor:analyzing?'default':'pointer', color:COLORS.red, fontSize:14, marginLeft:2,
                      opacity:analyzing?0.3:0.7 }}>✕</span>
                </span>
              ))}
              <span style={{ fontSize:12, color:COLORS.textDim, alignSelf:'center' }}>{stocks.length}개 종목</span>
            </div>
          )}
        </div>

        {analyzing && <ProgressBar progress={progress} msg={progressMsg} color={currentPreset.color} />}
        {error && <ErrorBox msg={error} onClose={() => setError('')} />}

        {/* ── 결과 출처 배너 + 이전 기록 토글 ── */}
        {result && prevAnalysisSource && prevAnalysisSource !== '' && (
          <div style={{ marginBottom:12 }}>
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              background: prevAnalysisSource.startsWith('db_') ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
              border: `1px solid ${prevAnalysisSource.startsWith('db_') ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}`,
              borderRadius: showPrevList ? '10px 10px 0 0' : 10,
              padding:'10px 16px', fontSize:13,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span>{prevAnalysisSource.startsWith('db_') ? '📋' : '✅'}</span>
                <span style={{ color: prevAnalysisSource.startsWith('db_') ? COLORS.yellow : COLORS.green }}>
                  {prevAnalysisSource === 'memory' ? '방금 분석한 결과' : '마지막 분석 결과'}
                </span>
                {result.created_at && <span style={{ fontSize:11, color:COLORS.textDim }}>
                  ({new Date(result.created_at).toLocaleString('ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })})
                </span>}
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {prevSessions.length > 1 && (
                  <button onClick={() => setShowPrevList(!showPrevList)}
                    style={{ background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.3)',
                      borderRadius:8, padding:'4px 12px', color:COLORS.accent, fontSize:12,
                      cursor:'pointer', fontFamily:'inherit' }}>
                    📋 이전 기록 ({prevSessions.length}건) {showPrevList ? '▲' : '▼'}
                  </button>
                )}
                {prevAnalysisSource.startsWith('db_') && (
                  <button onClick={() => { setResult(null); setPrevAnalysisSource(''); setShowPrevList(false); }}
                    style={{ background:'rgba(245,158,11,0.15)', border:'1px solid rgba(245,158,11,0.3)',
                      borderRadius:8, padding:'4px 12px', color:COLORS.yellow, fontSize:12,
                      cursor:'pointer', fontFamily:'inherit' }}>✕ 닫기</button>
                )}
              </div>
            </div>

            {/* ── 이전 기록 목록 (토글) ── */}
            {showPrevList && prevSessions.length > 0 && (
              <div style={{
                background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderTop:'none',
                borderRadius:'0 0 10px 10px', padding:12,
              }}>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {prevSessions.slice(0, 10).map((session) => {
                    const dt = new Date(session.created_at);
                    const timeStr = dt.toLocaleString('ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
                    const presetLabel = session.preset === 'bluechip' ? '🏢 우량주'
                      : session.preset === 'manipulation' ? '⚡ 작전주' : '🔧 사용자정의';
                    const stockNames = session.stock_names
                      ? Object.values(session.stock_names).slice(0,3).join(', ')
                        + (Object.keys(session.stock_names).length > 3
                          ? ` 외 ${Object.keys(session.stock_names).length - 3}개` : '')
                      : `${session.stock_count}종목`;
                    const isCurrentSession = prevAnalysisSource === `db_${session.id}`;
                    return (
                      <button key={session.id}
                        onClick={() => { if (!isCurrentSession) { loadPreviousAnalysis(session.id); setShowPrevList(false); } }}
                        disabled={loadingPrevAnalysis || isCurrentSession}
                        style={{
                          display:'flex', alignItems:'center', justifyContent:'space-between',
                          background: isCurrentSession ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.04)',
                          border: `1px solid ${isCurrentSession ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.1)'}`,
                          borderRadius:8, padding:'10px 14px',
                          cursor: isCurrentSession ? 'default' : loadingPrevAnalysis ? 'wait' : 'pointer',
                          width:'100%', textAlign:'left', color:COLORS.text, fontFamily:'inherit',
                          transition:'all 0.2s',
                        }}
                        onMouseEnter={e => { if (!isCurrentSession) e.currentTarget.style.background='rgba(59,130,246,0.1)'; }}
                        onMouseLeave={e => { if (!isCurrentSession) e.currentTarget.style.background='rgba(59,130,246,0.04)'; }}
                      >
                        <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                          {isCurrentSession && <span style={{ fontSize:10, color:COLORS.green }}>● 현재</span>}
                          <span style={{ fontSize:12, color:COLORS.accent, fontWeight:600 }}>{timeStr}</span>
                          <span style={{ fontSize:10, padding:'1px 6px', borderRadius:6,
                            background:session.preset==='manipulation'?COLORS.redDim:COLORS.accentDim,
                            color:session.preset==='manipulation'?COLORS.red:COLORS.accent }}>{presetLabel}</span>
                          <span style={{ fontSize:12, color:COLORS.textDim }}>{stockNames}</span>
                        </div>
                        <div style={{ fontSize:11, color:COLORS.gray, flexShrink:0 }}>
                          {session.pattern_count||0}패턴 · {session.stock_count}종목
                        </div>
                        {!isCurrentSession && <span style={{ marginLeft:8, fontSize:14, color:COLORS.accent }}>▶</span>}
                      </button>
                    );
                  })}
                </div>
                {loadingPrevAnalysis && (
                  <div style={{ textAlign:'center', padding:'8px 0', fontSize:12, color:COLORS.accent }}>
                    ⏳ 불러오는 중...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {result && (<>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:16 }}>
            {[
              { label:'분석 종목', value:result.total_stocks, unit:'개', color:COLORS.accent },
              { label:'급상승 발견', value:result.total_surges, unit:'건', color:COLORS.green },
              { label:'패턴 추출', value:result.total_patterns, unit:'개', color:COLORS.yellow },
              { label:'패턴 그룹', value:result.clusters?.length||0, unit:'개', color:COLORS.accent },
              { label:'평균 상승률', value:result.summary?.avg_rise_pct, unit:'%', color:COLORS.red },
              { label:'평균 상승일', value:result.summary?.avg_rise_days, unit:'일', color:COLORS.grayLight },
            ].map((item, i) => (
              <div key={i} style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`,
                borderRadius:10, padding:14, textAlign:'center' }}>
                <div style={{ fontSize:11, color:COLORS.textDim, marginBottom:4 }}>{item.label}</div>
                <div style={{ fontSize:22, fontWeight:700, color:item.color }}>
                  {typeof item.value==='number'?item.value.toLocaleString():'-'}</div>
                <div style={{ fontSize:11, color:COLORS.textDim }}>{item.unit}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:10, marginBottom:20 }}>
            {[
              {label:'공통 패턴', icon:'📊', color:'#4fc3f7'},
              {label:'차트 오버레이', icon:'📈', color:'#ffd54f'},
              {label:'매수 추천', icon:'🎯', color:'#4cff8b'},
              {label:'가상투자', icon:'💰', color:'#ff9800'},
              {label:'패턴 라이브러리', icon:'📚', color:'#8b5cf6'},
            ].map((tab, i) => (
              <button key={i} onClick={() => { setActiveTab(i); if (i===4) fetchSavedPatterns(); }} style={{
                padding:'18px 8px', cursor:'pointer', transition:'all 0.2s',
                borderRadius:14, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                border: activeTab===i ? `3px solid ${tab.color}` : `2px solid ${tab.color}55`,
                background: activeTab===i ? `${tab.color}25` : `${tab.color}08`,
                color: activeTab===i ? tab.color : `${tab.color}aa`,
                boxShadow: activeTab===i ? `0 0 20px ${tab.color}40, inset 0 0 20px ${tab.color}10` : 'none',
              }}
              onMouseEnter={e => { if(activeTab!==i) { e.currentTarget.style.background=`${tab.color}18`; e.currentTarget.style.borderColor=`${tab.color}99`; e.currentTarget.style.boxShadow=`0 0 12px ${tab.color}25`; }}}
              onMouseLeave={e => { if(activeTab!==i) { e.currentTarget.style.background=`${tab.color}08`; e.currentTarget.style.borderColor=`${tab.color}55`; e.currentTarget.style.boxShadow='none'; }}}
              >
                <span style={{ fontSize:26 }}>{tab.icon}</span>
                <span style={{ fontSize:14, fontWeight:800, letterSpacing:'0.5px' }}>{tab.label}</span>
                {activeTab===i && <span style={{ fontSize:10, opacity:0.7, marginTop:2 }}>● 선택됨</span>}
              </button>
            ))}
          </div>
          {activeTab===0 && <TabSummary result={result} saveClusterPattern={saveClusterPattern} savingPattern={savingPattern} />}
          {activeTab===1 && <TabChart result={result} />}
          {activeTab===2 && <TabRecommend result={result} selectedRecStocks={selectedRecStocks} setSelectedRecStocks={setSelectedRecStocks} setFilteredRecCodes={setFilteredRecCodes} onRegister={openRegModal} onKisOrder={openKisOrderModal} />}
          {activeTab===3 && <VirtualInvestTab recommendations={result.recommendations || []} backtestRecommendations={result.backtest_recommendations || []} selectedRecStocks={selectedRecStocks} setSelectedRecStocks={setSelectedRecStocks} newRtSessionId={newRtSessionId} setNewRtSessionId={setNewRtSessionId} />}
          {activeTab===4 && <TabPatternLibrary patterns={savedPatterns} loading={savedPatternsLoading} onRefresh={fetchSavedPatterns} onDelete={deletePattern} onToggleActive={togglePatternActive} editingId={editingPatternId} editingName={editingPatternName} setEditingId={setEditingPatternId} setEditingName={setEditingPatternName} onSaveName={savePatternName} onScanWithPattern={(id) => scanOrLoadPattern(id)} />}
        </>)}

        {!result && !analyzing && (
          <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`,
            borderRadius:12, padding:40, textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🔬</div>
            <h3 style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>급상승 직전 패턴을 찾아보세요</h3>
            <p style={{ fontSize:13, color:COLORS.textDim, lineHeight:1.8 }}>
              종목을 추가하고 분석을 시작하면<br/>DTW 알고리즘이 과거 급상승 직전 일봉 패턴을 자동으로 비교합니다
            </p>
            <div style={{ marginTop:16, padding:'10px 20px', borderRadius:8, background:COLORS.purpleDim,
              display:'inline-block', fontSize:12, color:COLORS.purple }}>
              💡 팁: 먼저 "🚀 급상승 종목 발굴"에서 종목을 찾은 뒤 여기로 보내면 편리합니다
            </div>
          </div>
        )}
      </div>)}

      {/* ━━━ 페이지 3: 개별종목추가 ━━━ */}
      {pageMode === 'addstock' && (<div>
        <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`,
          borderRadius:12, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:4, color:COLORS.green }}>
            ➕ 개별종목 추가
          </div>
          <div style={{ fontSize:12, color:COLORS.textDim, marginBottom:16 }}>
            종목명 또는 종목코드로 검색하여 바로 투자 등록
          </div>

          {/* 검색창 */}
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <input
              type="text"
              value={addStockKeyword}
              onChange={e => setAddStockKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchAddStock()}
              placeholder="종목명 또는 종목코드 입력..."
              style={{
                flex:1, padding:'12px 16px', fontSize:14, borderRadius:10,
                border:`1px solid ${COLORS.cardBorder}`, background:'#0d1117',
                color:COLORS.text, outline:'none', fontFamily:'inherit',
              }}
            />
            <button onClick={searchAddStock} disabled={addStockSearching || !addStockKeyword.trim()}
              style={{
                padding:'12px 24px', fontSize:14, fontWeight:700, borderRadius:10,
                border:'none', cursor: addStockSearching ? 'default' : 'pointer',
                background: addStockSearching ? '#374151' : `linear-gradient(135deg, ${COLORS.green}, #059669)`,
                color: COLORS.white, fontFamily:'inherit',
              }}>
              {addStockSearching ? '⏳ 검색 중...' : '🔍 검색'}
            </button>
          </div>

          {/* 검색 결과 */}
          {addStockResults.length > 0 && (
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:COLORS.text, marginBottom:10 }}>
                검색결과 ({addStockResults.length}건)
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${COLORS.cardBorder}` }}>
                      <th style={{ textAlign:'left', padding:'8px 6px', color:COLORS.textDim, fontWeight:500 }}>종목명</th>
                      <th style={{ textAlign:'left', padding:'8px 6px', color:COLORS.textDim, fontWeight:500 }}>코드</th>
                      <th style={{ textAlign:'left', padding:'8px 6px', color:COLORS.textDim, fontWeight:500 }}>시장</th>
                      <th style={{ textAlign:'right', padding:'8px 6px', color:COLORS.textDim, fontWeight:500 }}>현재가</th>
                      <th style={{ textAlign:'right', padding:'8px 6px', color:COLORS.textDim, fontWeight:500 }}>등락</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', color:COLORS.textDim, fontWeight:500 }}>액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addStockResults.map(stock => {
                      const pi = addStockPrices[stock.code];
                      const priceLoading = addStockPriceLoading[stock.code];
                      return (
                        <tr key={stock.code} style={{ borderBottom:`1px solid ${COLORS.cardBorder}22` }}>
                          <td style={{ padding:'10px 6px', fontWeight:600 }}>
                            <span onClick={() => addStockOpenChart(stock.code, stock.name)}
                              style={{ color: addStockChartCode === stock.code ? COLORS.green : COLORS.text,
                                cursor:'pointer', textDecoration: addStockChartCode === stock.code ? 'underline' : 'none',
                                borderBottom: addStockChartCode === stock.code ? `2px solid ${COLORS.green}` : 'none',
                              }}>{stock.name}</span>
                          </td>
                          <td style={{ padding:'10px 6px', color:COLORS.gray, fontFamily:'monospace', fontSize:11 }}>{stock.code}</td>
                          <td style={{ padding:'10px 6px' }}>
                            <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4,
                              background: stock.market === 'KOSPI' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                              color: stock.market === 'KOSPI' ? '#3b82f6' : '#a855f7' }}>
                              {stock.market || '-'}
                            </span>
                          </td>
                          <td style={{ padding:'10px 6px', textAlign:'right', fontFamily:'monospace', color: COLORS.text }}>
                            {priceLoading ? <span style={{ color:COLORS.gray }}>⏳</span>
                              : pi?.price ? pi.price.toLocaleString() + '원' : <span style={{ color:COLORS.gray }}>-</span>}
                          </td>
                          <td style={{ padding:'10px 6px', textAlign:'right', fontFamily:'monospace' }}>
                            {pi?.change_pct ? (
                              <span style={{ color: pi.change_pct > 0 ? COLORS.red : pi.change_pct < 0 ? '#3b82f6' : COLORS.gray }}>
                                {pi.change_pct > 0 ? '+' : ''}{pi.change_pct.toFixed(2)}%
                              </span>
                            ) : <span style={{ color:COLORS.gray }}>-</span>}
                          </td>
                          <td style={{ padding:'6px 4px', textAlign:'center' }}>
                            <div style={{ display:'flex', gap:4, justifyContent:'center', flexWrap:'wrap' }}>
                              <button onClick={() => addStockGetPrice(stock.code)}
                                disabled={priceLoading}
                                title="현재가 조회"
                                style={{ padding:'4px 8px', fontSize:11, borderRadius:6, border:`1px solid ${COLORS.accent}`,
                                  background:COLORS.accentDim, color:COLORS.accent, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                                🔍 시세
                              </button>
                              <button onClick={() => addStockRegisterVirtual(stock)}
                                title="가상투자 등록"
                                style={{ padding:'4px 8px', fontSize:11, borderRadius:6, border:`1px solid ${COLORS.yellow}`,
                                  background:COLORS.yellowDim, color:COLORS.yellow, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                                💰 가상투자
                              </button>
                              <button onClick={() => addStockRegisterCandidate(stock)}
                                title="예비 후보 등록"
                                style={{ padding:'4px 8px', fontSize:11, borderRadius:6, border:`1px solid ${COLORS.purple}`,
                                  background:COLORS.purpleDim, color:COLORS.purple, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                                🎯 후보등록
                              </button>
                              <button onClick={() => addStockKisBuy(stock, 'virtual')}
                                title="KIS 모의투자 매수"
                                style={{ padding:'4px 8px', fontSize:11, borderRadius:6, border:`1px solid ${COLORS.accent}`,
                                  background:COLORS.accentDim, color:COLORS.accent, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                                🏦 모의투자
                              </button>
                              <button onClick={() => addStockKisBuy(stock, 'real')}
                                title="KIS 실전투자 매수"
                                style={{ padding:'4px 8px', fontSize:11, borderRadius:6, border:`1px solid ${COLORS.red}`,
                                  background:COLORS.redDim, color:COLORS.red, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                                🔴 실전투자
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 차트 영역 */}
          {addStockChartCode && (
            <div style={{ marginTop:16, background:'rgba(8,15,30,0.5)', borderRadius:12, padding:16,
              border:`1px solid ${COLORS.cardBorder}` }}>
              {addStockChartLoading ? (
                <div style={{ textAlign:'center', padding:40, color:COLORS.accent }}>
                  <div style={{ fontSize:16, marginBottom:8 }}>📊 차트 로딩 중...</div>
                  <div style={{ fontSize:12, color:COLORS.gray }}>{addStockChartName} ({addStockChartCode})</div>
                </div>
              ) : addStockCandles.length >= 5 ? (
                <AddStockChart
                  candles={addStockCandles}
                  stockName={addStockChartName}
                  stockCode={addStockChartCode}
                  priceInfo={addStockPrices[addStockChartCode]}
                />
              ) : (
                <div style={{ textAlign:'center', padding:20, color:COLORS.gray, fontSize:13 }}>
                  차트 데이터가 부족합니다
                </div>
              )}
            </div>
          )}

          {/* 검색 결과 없음 */}
          {addStockResults.length === 0 && !addStockSearching && addStockKeyword.trim() && (
            <div style={{ textAlign:'center', padding:20, color:COLORS.gray, fontSize:13 }}>
              검색 결과가 없습니다
            </div>
          )}

          {/* 초기 안내 */}
          {addStockResults.length === 0 && !addStockSearching && !addStockKeyword.trim() && (
            <div style={{ textAlign:'center', padding:40 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:14, color:COLORS.textDim, marginBottom:8 }}>종목을 검색하여 바로 투자 등록하세요</div>
              <div style={{ fontSize:12, color:COLORS.gray }}>
                검색 후 각 종목별로 가상투자, 후보등록, KIS 모의/실전투자를 바로 실행할 수 있습니다
              </div>
            </div>
          )}

          {/* 사용 안내 */}
          <div style={{ marginTop:16, padding:12, borderRadius:8, background:'rgba(16,185,129,0.06)',
            border:'1px solid rgba(16,185,129,0.15)', fontSize:11, color:COLORS.gray, lineHeight:1.6 }}>
            💡 <b style={{ color:COLORS.green }}>사용 안내</b><br/>
            • <b>🔍 시세</b>: 현재가/등락률 조회 (장중에만 실시간)<br/>
            • <b>💰 가상투자</b>: 가상 포트폴리오에 등록 (수익률 추적)<br/>
            • <b>🎯 후보등록</b>: 예비 매수 후보로 저장<br/>
            • <b>🏦 모의투자</b>: KIS 모의계좌로 실제 주문 (100만원 기준)<br/>
            • <b>🔴 실전투자</b>: KIS 실계좌로 실제 주문 (100만원 기준)
          </div>
        </div>
      </div>)}

      {/* ━━━ 가상투자 등록 모달 / Virtual Invest Registration Modal ━━━ */}
      {showRegModal && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:0,
          background:'rgba(0,0,0,0.7)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center',
        }} onClick={() => !regLoading && setShowRegModal(false)}>
          <div style={{
            background:'#1a2234', border:'1px solid rgba(100,140,200,0.3)',
            borderRadius:16, padding:28, width:520, maxWidth:'92vw',
            boxShadow:'0 20px 60px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:18, fontWeight:700, marginBottom:20, color:'#e5e7eb' }}>
              💰 가상투자 등록
            </div>

            {/* 포트폴리오 제목 입력 */}
            {(
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, color:'#9ca3af', marginBottom:6 }}>포트폴리오 제목</div>
                <input value={regTitle} onChange={e => setRegTitle(e.target.value)}
                  placeholder="예: 2026-03-01 패턴분석"
                  style={{
                    width:'100%', padding:'10px 14px', fontSize:14, fontFamily:'inherit',
                    background:'#0d1321', border:'1px solid #1e293b',
                    borderRadius:8, color:'#e5e7eb', outline:'none',
                  }} />
              </div>
            )}

            {/* ★ 적용 패턴 선택 (필수) */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color: regPatternName ? '#9ca3af' : '#ff9800', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                📚 적용 패턴 <span style={{ fontSize:10, color:'#ff9800' }}>필수</span>
                {regPatternName && <span style={{
                  fontSize:10, padding:'2px 8px', borderRadius:4,
                  background:'rgba(139,92,246,0.15)', border:'1px solid rgba(139,92,246,0.25)', color:'#8b5cf6', fontWeight:600,
                }}>✓ {regPatternName}</span>}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, maxHeight:120, overflowY:'auto', padding:4 }}>
                {(savedPatterns || []).filter(p => p.is_active).length === 0 ? (
                  <div style={{ fontSize:11, color:'#6b7280', padding:10 }}>
                    활성화된 패턴이 없습니다. 패턴 라이브러리에서 패턴을 먼저 등록하세요.
                  </div>
                ) : (
                  (savedPatterns || []).filter(p => p.is_active).map(p => (
                    <button key={p.id} onClick={() => { setRegPatternId(p.id); setRegPatternName(p.name); }} style={{
                      padding:'6px 12px', borderRadius:8, cursor:'pointer', fontSize:11, fontFamily:'inherit',
                      border: regPatternId === p.id ? '2px solid #8b5cf6' : '1px solid #1e293b',
                      background: regPatternId === p.id ? 'rgba(139,92,246,0.2)' : '#0d1321',
                      color: regPatternId === p.id ? '#a78bfa' : '#9ca3af',
                      fontWeight: regPatternId === p.id ? 700 : 400,
                    }}>
                      {regPatternId === p.id ? '✓ ' : ''}{p.name}
                    </button>
                  ))
                )}
              </div>
              {!regPatternName && (
                <div style={{ fontSize:10, color:'#ff9800', marginTop:4 }}>
                  ⚠️ 패턴을 선택해야 등록할 수 있습니다
                </div>
              )}
            </div>

            {/* 전략 선택 */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'#9ca3af', marginBottom:8 }}>매매 전략</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
                {[
                  { key:'smart', label:'🧠 스마트', desc:'추적손절', color:'#ff9800' },
                  { key:'aggressive', label:'🔥 공격형', desc:'10/5%', color:'#ff5252' },
                  { key:'standard', label:'⚖️ 기본형', desc:'7/3%', color:'#4fc3f7' },
                  { key:'conservative', label:'🛡️ 보수형', desc:'5/2%', color:'#4cff8b' },
                  { key:'longterm', label:'🐢 장기형', desc:'15/5%', color:'#ffd54f' },
                ].map(s => (
                  <button key={s.key} onClick={() => setRegPreset(s.key)} style={{
                    padding:'10px 6px', borderRadius:8, cursor:'pointer', textAlign:'center',
                    border: regPreset===s.key ? `2px solid ${s.color}` : '1px solid #1e293b',
                    background: regPreset===s.key ? `${s.color}20` : 'transparent',
                    color: regPreset===s.key ? s.color : '#9ca3af', fontSize:11, fontFamily:'inherit',
                  }}>
                    <div style={{ fontWeight:600, marginBottom:2 }}>{s.label}</div>
                    <div style={{ fontSize:10, opacity:0.7 }}>{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 투자금액 */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, color:'#9ca3af', marginBottom:6 }}>투자금액</div>
              <div style={{ display:'flex', gap:8 }}>
                {[500000, 1000000, 3000000, 5000000].map(v => (
                  <button key={v} onClick={() => setRegCapital(v)} style={{
                    flex:1, padding:'8px 4px', borderRadius:6, cursor:'pointer', fontSize:12, fontFamily:'inherit',
                    border: regCapital===v ? '1px solid #4fc3f7' : '1px solid #1e293b',
                    background: regCapital===v ? 'rgba(79,195,247,0.15)' : 'transparent',
                    color: regCapital===v ? '#4fc3f7' : '#9ca3af',
                  }}>{(v/10000).toFixed(0)}만</button>
                ))}
              </div>
            </div>

            {/* ★ 적용된 필터 표시 */}
            {regActiveFilters.length > 0 && (
              <div style={{
                marginBottom:16, padding:'10px 14px', borderRadius:8,
                background:'rgba(79,195,247,0.06)', border:'1px solid rgba(79,195,247,0.15)',
              }}>
                <div style={{ fontSize:11, color:'#4fc3f7', marginBottom:8, fontWeight:600 }}>
                  🔍 적용된 필터 ({regActiveFilters.length}개)
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {regActiveFilters.map((f, i) => (
                    <span key={i} style={{
                      fontSize:10, padding:'3px 10px', borderRadius:6, fontWeight:600,
                      background:`${f.color}18`, border:`1px solid ${f.color}40`, color:f.color,
                    }}>{f.label}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 선택 종목 표시 */}
            {(() => {
              const isPatternScan = regSource === 'patternScan';
              const selStocks = isPatternScan
                ? (patternScanResult?.matches || []).filter(m => selectedPatternStocks.has(m.code))
                : (result?.recommendations || []).filter(r => selectedRecStocks.has(r.code));
              const accentColor = isPatternScan ? '#8b5cf6' : '#10b981';
              return (
              <div style={{
                marginBottom:20, padding:10, borderRadius:8,
                background: isPatternScan ? 'rgba(139,92,246,0.08)' : 'rgba(16,185,129,0.08)',
                border: `1px solid ${isPatternScan ? 'rgba(139,92,246,0.2)' : 'rgba(16,185,129,0.2)'}`,
              }}>
                <div style={{ fontSize:11, color: accentColor, marginBottom:6 }}>
                  {isPatternScan ? '📚 패턴 매칭 종목' : '📋 선택 종목'} ({selStocks.length}개)
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {selStocks.map(r => (
                    <span key={r.code} style={{
                      fontSize:11, padding:'3px 10px', borderRadius:6,
                      background: isPatternScan ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.15)',
                      color: accentColor,
                    }}>{r.name}{isPatternScan ? ` (${r.similarity}%)` : ''}</span>
                  ))}
                </div>
              </div>
              );
            })()}

            {/* 버튼 */}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setShowRegModal(false)} disabled={regLoading}
                style={{
                  padding:'10px 20px', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit',
                  background:'transparent', border:'1px solid #374151', color:'#9ca3af',
                }}>취소</button>
              <button onClick={doRegisterVirtual}
                disabled={regLoading || !regPatternName}
                style={{
                  padding:'10px 28px', borderRadius:8, cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit',
                  background: regLoading || !regPatternName ? '#374151' : '#10b981',
                  border:'none', color: regLoading || !regPatternName ? '#6b7280' : 'white',
                  opacity: !regPatternName ? 0.5 : 1,
                }}>{regLoading ? '⏳ 등록 중...' : '✅ 등록하기'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ━━━ KIS 주문 모달 (모의투자 / 실전투자) ━━━ */}
      {showKisOrderModal && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:0,
          background:'rgba(0,0,0,0.7)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center',
        }} onClick={() => !kisOrderLoading && setShowKisOrderModal(false)}>
          <div style={{
            background:'#1a2234', border:`2px solid ${kisOrderMode === 'real' ? '#dc2626' : '#1a6fff'}`,
            borderRadius:16, padding:28, width:520, maxWidth:'92vw',
            boxShadow:'0 20px 60px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:18, fontWeight:700, marginBottom:6, color: kisOrderMode === 'real' ? '#ef4444' : '#60a5fa' }}>
              {kisOrderMode === 'real' ? '🔴 실전투자 주문' : '🏦 모의투자 주문'}
            </div>
            {kisOrderMode === 'real' && (
              <div style={{ marginBottom:14, padding:10, borderRadius:8, background:'rgba(220,38,38,0.1)', border:'1px solid rgba(220,38,38,0.3)', fontSize:12, color:'#ef4444' }}>
                ⚠️ 실제 계좌에서 매수됩니다. 신중하게 확인 후 주문하세요.
              </div>
            )}

            {/* API 미연결 안내 */}
            {(() => {
              const creds = getKisCredentials(kisOrderMode);
              return !creds.access_token ? (
                <div style={{ marginBottom:14, padding:12, borderRadius:8, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', fontSize:12, color:'#f59e0b' }}>
                  ⚠️ {kisOrderMode === 'virtual' ? '모의투자' : '실전투자'} API가 아직 연결되지 않았습니다.<br/>
                  <span style={{ fontSize:11 }}>{kisOrderMode === 'virtual' ? 'KIS 모의투자' : 'KIS 실전투자'} 메뉴 → API 설정에서 먼저 연결해주세요. 아래 종목 정보는 미리 확인할 수 있습니다.</span>
                </div>
              ) : null;
            })()}

            {!kisOrderResults ? (<>
              {/* 투자금액 */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:'#9ca3af', marginBottom:6 }}>투자금액</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {[100000, 500000, 1000000, 3000000, 5000000, 10000000].map(v => (
                    <button key={v} onClick={() => setKisOrderCapital(v)} style={{
                      padding:'7px 12px', borderRadius:6, cursor:'pointer', fontSize:11, fontFamily:'inherit',
                      border: kisOrderCapital===v ? '1px solid #60a5fa' : '1px solid #1e293b',
                      background: kisOrderCapital===v ? 'rgba(96,165,250,0.15)' : 'transparent',
                      color: kisOrderCapital===v ? '#60a5fa' : '#9ca3af',
                    }}>{(v/10000).toLocaleString()}만</button>
                  ))}
                </div>
                <input type="number" value={kisOrderCapital} onChange={e => setKisOrderCapital(Number(e.target.value))}
                  style={{ width:'100%', marginTop:8, padding:'8px 12px', fontSize:13, fontFamily:'monospace',
                    background:'#0d1321', border:'1px solid #1e293b', borderRadius:6, color:'#e5e7eb', outline:'none' }} />
              </div>

              {/* 주문 유형 */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:'#9ca3af', marginBottom:6 }}>주문 유형</div>
                <div style={{ display:'flex', gap:8 }}>
                  {[{ key:'01', label:'시장가', desc:'즉시 체결' }, { key:'00', label:'지정가', desc:'현재가 기준' }].map(t => (
                    <button key={t.key} onClick={() => setKisOrderType(t.key)} style={{
                      flex:1, padding:'10px', borderRadius:8, cursor:'pointer', textAlign:'center',
                      border: kisOrderType===t.key ? '2px solid #60a5fa' : '1px solid #1e293b',
                      background: kisOrderType===t.key ? 'rgba(96,165,250,0.12)' : 'transparent',
                      color: kisOrderType===t.key ? '#60a5fa' : '#9ca3af', fontSize:12, fontFamily:'inherit',
                    }}>
                      <div style={{ fontWeight:600 }}>{t.label}</div>
                      <div style={{ fontSize:10, opacity:0.7 }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 선택 종목 + 예상 수량 */}
              <div style={{ marginBottom:16, padding:10, borderRadius:8, background:'rgba(96,165,250,0.06)', border:'1px solid rgba(96,165,250,0.15)' }}>
                {(() => {
                  const visibleSelected = (result?.recommendations || []).filter(r => selectedRecStocks.has(r.code) && filteredRecCodes.has(r.code));
                  const cnt = visibleSelected.length;
                  return (<>
                <div style={{ fontSize:11, color:'#60a5fa', marginBottom:6 }}>📋 주문 종목 ({cnt}개) · 종목당 {Math.floor(kisOrderCapital / Math.max(cnt, 1)).toLocaleString()}원</div>
                {visibleSelected.map(r => {
                  const perStock = Math.floor(kisOrderCapital / cnt);
                  const qty = r.current_price > 0 ? Math.floor(perStock / r.current_price) : 0;
                  return (
                    <div key={r.code} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12 }}>
                      <span style={{ color:'#e5e7eb' }}>{r.name} <span style={{ color:'#6b7280' }}>{r.code}</span></span>
                      <span style={{ color:'#9ca3af', fontFamily:'monospace' }}>{r.current_price?.toLocaleString()}원 × {qty}주 = {(qty * (r.current_price || 0)).toLocaleString()}원</span>
                    </div>
                  );
                })}
                </>); })()}
              </div>

              {/* 버튼 */}
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={() => setShowKisOrderModal(false)} disabled={kisOrderLoading}
                  style={{ padding:'10px 20px', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit',
                    background:'transparent', border:'1px solid #374151', color:'#9ca3af' }}>취소</button>
                <button onClick={executeKisOrders} disabled={kisOrderLoading}
                  style={{
                    padding:'10px 28px', borderRadius:8, cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit',
                    background: kisOrderLoading ? '#374151' : kisOrderMode === 'real' ? '#dc2626' : '#1a6fff',
                    border:'none', color:'white',
                  }}>{kisOrderLoading ? '⏳ 주문 중...' : `${kisOrderMode === 'real' ? '🔴 실전' : '🏦 모의'} 매수 주문 실행`}</button>
              </div>
            </>) : (
              /* 주문 결과 */
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:'#e5e7eb', marginBottom:12 }}>📋 주문 결과</div>
                {kisOrderResults.map((r, i) => (
                  <div key={i} style={{
                    display:'flex', justifyContent:'space-between', padding:'8px 10px', marginBottom:4, borderRadius:6,
                    background: r.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${r.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  }}>
                    <span style={{ color: r.success ? '#10b981' : '#ef4444', fontSize:12 }}>
                      {r.success ? '✅' : '❌'} {r.name} ({r.code})
                    </span>
                    <span style={{ color:'#9ca3af', fontSize:11 }}>
                      {r.success ? `${r.qty}주 · 주문번호: ${r.order_no}` : r.message}
                    </span>
                  </div>
                ))}
                {kisOrderResults.some(r => r.success) && (
                  <div style={{ marginTop:12, padding:10, borderRadius:8, background:'rgba(76,255,139,0.08)', border:'1px solid rgba(76,255,139,0.2)', fontSize:11, color:'#4cff8b' }}>
                    🤖 자동 손절/익절 모니터링이 백그라운드에서 시작되었습니다 (30초 간격)
                  </div>
                )}
                <div style={{ marginTop:8, padding:10, borderRadius:8, background:'rgba(255,213,79,0.08)', border:'1px solid rgba(255,213,79,0.2)', fontSize:11, color:'#ffd54f' }}>
                  💡 체결 확인은 {kisOrderMode === 'virtual' ? 'KIS 모의투자' : 'KIS 실전투자'} {'>'} 주문내역에서 확인하세요.
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
                  <button onClick={() => { setShowKisOrderModal(false); setSelectedRecStocks(new Set()); }}
                    style={{ padding:'10px 24px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit',
                      background:'#1a6fff', border:'none', color:'white' }}>확인</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ━━━ 개별종목추가 기본차트 (영웅문 스타일) ━━━
function AddStockChart({ candles, stockName, stockCode, priceInfo }) {
  if (!candles || candles.length < 5) return null;

  const fDate = (d) => { const s = (d||'').replace(/-/g,''); return s.length>=8 ? `${s.slice(4,6)}/${s.slice(6,8)}` : d||'-'; };

  const MAX_CANDLES = 90;
  const raw = candles.length > MAX_CANDLES ? candles.slice(candles.length - MAX_CANDLES) : [...candles];
  const offsetIdx = candles.length > MAX_CANDLES ? candles.length - MAX_CANDLES : 0;

  const vis = raw.map(c => {
    const cl = c.close || 0;
    if (cl <= 0) return c;
    return { ...c, open: c.open>0?c.open:cl, high: c.high>0?Math.max(c.high,cl):cl, low: c.low>0?Math.min(c.low,cl):cl, volume: c.volume||0 };
  });
  if (vis.length < 5) return null;

  const W = 780, H_CHART = 280, H_VOL = 55, GAP = 20;
  const PAD = { t: 28, b: 40, l: 62, r: 80 };
  const TOTAL_H = PAD.t + H_CHART + GAP + H_VOL + PAD.b;
  const plotW = W - PAD.l - PAD.r;
  const cw = plotW / vis.length;

  const allP = vis.flatMap(c => [c.high, c.low]).filter(p => p > 0);
  const pMin = Math.min(...allP), pMax = Math.max(...allP);
  const pPad = (pMax - pMin) * 0.08 || 100;
  const pLow = pMin - pPad, pHigh = pMax + pPad, pRange = pHigh - pLow || 1;
  const maxVol = Math.max(...vis.map(c => c.volume || 0), 1);

  const toX = (i) => PAD.l + i * cw;
  const toY = (p) => PAD.t + (1 - (p - pLow) / pRange) * H_CHART;
  const volBase = PAD.t + H_CHART + GAP + H_VOL;

  const calcMA = (period) => {
    return vis.map((_, i) => {
      const gi = offsetIdx + i;
      if (gi < period - 1) return null;
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[gi - j].close;
      return sum / period;
    });
  };
  const ma5 = calcMA(5);
  const ma20 = calcMA(20);

  const lastPrice = vis[vis.length - 1].close;
  const firstPrice = vis[0].open || vis[0].close;
  const totalChange = lastPrice - firstPrice;
  const totalChangePct = firstPrice > 0 ? ((totalChange / firstPrice) * 100).toFixed(2) : 0;
  const profitColor = totalChange >= 0 ? '#FF0000' : '#0050FF';

  const svg = [];

  // 배경
  svg.push(<rect key="bg" x={0} y={0} width={W} height={TOTAL_H} fill="rgba(8,15,30,0.95)" rx={8} />);

  // 가격 눈금 (6단계)
  for (let i = 0; i <= 5; i++) {
    const p = pLow + pRange * (i / 5);
    const y = toY(p);
    svg.push(<line key={`pg-${i}`} x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke="rgba(50,70,100,0.25)" strokeDasharray="3,3" />);
    svg.push(<text key={`pl-${i}`} x={PAD.l-8} y={y+4} fill="#c8d0e0" fontSize={11}
      fontFamily="JetBrains Mono, monospace" textAnchor="end" fontWeight={500}>{Math.round(p).toLocaleString()}</text>);
  }

  // X축 날짜
  const dateStep = Math.max(1, Math.floor(vis.length / 14));
  vis.forEach((c, i) => {
    if (i % dateStep === 0) {
      svg.push(<text key={`dt-${i}`} x={toX(i)+cw/2} y={TOTAL_H-6}
        fill="#c0c8d8" fontSize={9} fontFamily="JetBrains Mono, monospace" textAnchor="middle">{fDate(c.date)}</text>);
    }
  });

  // 거래량 구분선 + 라벨
  svg.push(<line key="vol-sep" x1={PAD.l} y1={PAD.t+H_CHART+GAP/2} x2={W-PAD.r} y2={PAD.t+H_CHART+GAP/2}
    stroke="rgba(50,70,100,0.3)" />);
  svg.push(<text key="vol-lbl" x={PAD.l-8} y={volBase-H_VOL+12} fill="#556677" fontSize={9} fontFamily="monospace" textAnchor="end">VOL</text>);

  // 거래량 바
  vis.forEach((c, i) => {
    const isUp = c.close >= c.open;
    const color = isUp ? '#FF0000' : '#0050FF';
    const vol = c.volume || 0;
    const barH = vol > 0 ? Math.max((vol / maxVol) * H_VOL, 2) : (c.close > 0 ? 2 : 0);
    svg.push(<rect key={`vol-${i}`} x={toX(i)+1} y={volBase-barH}
      width={Math.max(cw-2,2)} height={barH} fill={color} opacity={0.75} rx={1} />);
  });

  // 캔들스틱
  vis.forEach((c, i) => {
    const x = toX(i);
    const isUp = c.close >= c.open;
    const color = isUp ? '#FF0000' : '#0050FF';
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(bodyBot - bodyTop, 3);
    const cx = x + cw / 2;
    svg.push(
      <g key={`c-${i}`}>
        <line x1={cx} y1={toY(c.high)} x2={cx} y2={toY(c.low)} stroke={color} strokeWidth={1} />
        <rect x={x+2} y={bodyTop} width={Math.max(cw-4,3)} height={bodyH} fill={color} rx={1} />
      </g>
    );
  });

  // MA5
  let ma5d = '';
  ma5.forEach((v, i) => { if (v !== null) ma5d += (ma5d ? 'L' : 'M') + `${toX(i)+cw/2},${toY(v)} `; });
  if (ma5d) svg.push(<path key="ma5" d={ma5d} fill="none" stroke="#ffcc00" strokeWidth={1.5} opacity={0.8} />);

  // MA20
  let ma20d = '';
  ma20.forEach((v, i) => { if (v !== null) ma20d += (ma20d ? 'L' : 'M') + `${toX(i)+cw/2},${toY(v)} `; });
  if (ma20d) svg.push(<path key="ma20" d={ma20d} fill="none" stroke="#ff6699" strokeWidth={1.5} opacity={0.7} />);

  // 현재가 수평선 + 우측 태그
  if (lastPrice > 0 && lastPrice >= pLow && lastPrice <= pHigh) {
    const curY = toY(lastPrice);
    svg.push(<line key="cur-line" x1={PAD.l} y1={curY} x2={W-PAD.r} y2={curY}
      stroke={profitColor} strokeWidth={1} strokeDasharray="5,3" opacity={0.5} />);
    svg.push(<rect key="cur-bg" x={W-PAD.r+2} y={curY-10} width={PAD.r-6} height={20}
      fill={profitColor} rx={3} />);
    svg.push(<text key="cur-txt" x={W-PAD.r/2+1} y={curY+4} fill="white" fontSize={10}
      fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight={600}>{Math.round(lastPrice).toLocaleString()}</text>);
  }

  const pi = priceInfo || {};

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:6 }}>
        <div style={{ fontSize:14, fontWeight:700 }}>
          <span style={{ color:'#e0e6f0' }}>📊 {stockName}</span>
          <span style={{ color:'#6688aa', fontSize:11, marginLeft:8 }}>({stockCode})</span>
          <span style={{ color: profitColor, fontSize:12, marginLeft:12, fontWeight:700 }}>
            {lastPrice?.toLocaleString()}원 ({totalChange >= 0 ? '+' : ''}{totalChangePct}%)
          </span>
        </div>
        <div style={{ display:'flex', gap:12, fontSize:11, flexWrap:'wrap' }}>
          <span><span style={{ color:'#FF0000' }}>■</span> 양봉</span>
          <span><span style={{ color:'#0050FF' }}>■</span> 음봉</span>
          <span style={{ color:'#ffcc00' }}>── MA5</span>
          <span style={{ color:'#ff6699' }}>── MA20</span>
        </div>
      </div>

      <svg width={W} height={TOTAL_H} style={{ display:'block', maxWidth:'100%' }}>
        {svg}
      </svg>

      <div style={{
        display:'flex', justifyContent:'space-between', marginTop:10, padding:'8px 14px',
        background:'rgba(15,22,42,0.6)', borderRadius:8, fontSize:11,
        fontFamily:'JetBrains Mono, monospace', border:'1px solid rgba(50,70,100,0.2)',
      }}>
        <span><span style={{ color:'#556677' }}>현재가 </span><span style={{ color: profitColor }}>{(pi.price || lastPrice)?.toLocaleString()}</span></span>
        <span><span style={{ color:'#556677' }}>전일대비 </span><span style={{ color: (pi.change||0)>=0?'#FF0000':'#0050FF' }}>{(pi.change||0)>=0?'+':''}{(pi.change||0).toLocaleString()}</span></span>
        <span><span style={{ color:'#556677' }}>등락률 </span><span style={{ color: (pi.change_pct||0)>=0?'#FF0000':'#0050FF' }}>{(pi.change_pct||0)>=0?'+':''}{(pi.change_pct||0).toFixed(2)}%</span></span>
        <span><span style={{ color:'#556677' }}>시가 </span><span style={{ color:'#c8d0e0' }}>{(pi.open||vis[vis.length-1].open)?.toLocaleString()}</span></span>
        <span><span style={{ color:'#556677' }}>고가 </span><span style={{ color:'#FFD600' }}>{(pi.high||vis[vis.length-1].high)?.toLocaleString()}</span></span>
        <span><span style={{ color:'#556677' }}>저가 </span><span style={{ color:'#4fc3f7' }}>{(pi.low||vis[vis.length-1].low)?.toLocaleString()}</span></span>
      </div>
    </div>
  );
}

function tagStyle(c) { return { fontSize:10, padding:'2px 8px', borderRadius:10, background:`${c}20`, color:c, fontWeight:500 }; }

// ━━━ 공통 컴포넌트 ━━━
function FilterGroup({ label, options, value, setter, color, disabled }) {
  return (<div>
    <div style={{ fontSize:11, color:COLORS.textDim, marginBottom:6 }}>{label}</div>
    <div style={{ display:'flex', gap:4 }}>
      {options.map(opt => (<button key={opt.v} onClick={() => setter(opt.v)} disabled={disabled} style={{ flex:1, padding:'6px 4px', fontSize:11, borderRadius:6, cursor:disabled?'default':'pointer', border:`1px solid ${value===opt.v?color:COLORS.cardBorder}`, background:value===opt.v?`${color}20`:'transparent', color:value===opt.v?color:COLORS.textDim }}>{opt.l}</button>))}
    </div>
  </div>);
}

function ProgressBar({ progress, msg, color }) {
  return (<div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, padding:18, marginBottom:16 }}>
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
      <span style={{ fontSize:13, fontWeight:600 }}>⏳ 진행 중...</span>
      <span style={{ fontSize:13, color, fontWeight:700 }}>{progress}%</span>
    </div>
    <div style={{ height:8, background:'#1a2234', borderRadius:4, overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${progress}%`, background:`linear-gradient(90deg, ${color}, ${COLORS.green})`, borderRadius:4, transition:'width 0.5s ease' }} />
    </div>
    <div style={{ fontSize:12, color:COLORS.textDim, marginTop:6 }}>{msg}</div>
  </div>);
}

function ErrorBox({ msg, onClose }) {
  return (<div style={{ background:COLORS.redDim, border:`1px solid ${COLORS.red}`, borderRadius:8, padding:14, marginBottom:16, fontSize:13, color:COLORS.red }}>
    ❌ {msg}<span onClick={onClose} style={{ float:'right', cursor:'pointer', fontWeight:700 }}>✕</span>
  </div>);
}

function SettingsPanel(p) {
  return (<div style={{ marginTop:14, padding:14, background:'#0d1321', borderRadius:8 }}>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:14 }}>
      {[
        { label:'조회 기간', value:p.periodDays, setter:p.setPeriodDays, opts:[{v:180,l:'6개월'},{v:365,l:'1년'},{v:730,l:'2년'},{v:1095,l:'3년'}] },
        { label:'사전 분석일', value:p.preRiseDays, setter:p.setPreRiseDays, opts:[{v:5,l:'5일'},{v:10,l:'10일'},{v:20,l:'20일'},{v:30,l:'30일'},{v:40,l:'40일'}] },
        { label:'급상승 기준', value:p.risePct, setter:p.setRisePct, opts:[{v:15,l:'+15%'},{v:20,l:'+20%'},{v:30,l:'+30%'},{v:50,l:'+50%'},{v:100,l:'+100%'}] },
        { label:'상승 기간', value:p.riseWindow, setter:p.setRiseWindow, opts:[{v:3,l:'3일'},{v:5,l:'5일'},{v:10,l:'10일'},{v:15,l:'15일'}] },
      ].map(cfg => (<div key={cfg.label}>
        <div style={{ fontSize:11, color:COLORS.textDim, marginBottom:6 }}>{cfg.label}</div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {cfg.opts.map(opt => (<button key={opt.v} onClick={() => { cfg.setter(opt.v); p.setActivePreset('custom'); }}
            style={{ flex:'1 1 auto', padding:'5px 4px', fontSize:11, borderRadius:6, border:`1px solid ${cfg.value===opt.v?COLORS.accent:COLORS.cardBorder}`, background:cfg.value===opt.v?COLORS.accentDim:'transparent', color:cfg.value===opt.v?COLORS.accent:COLORS.textDim, cursor:'pointer' }}>{opt.l}</button>))}
        </div>
      </div>))}
    </div>
    <div style={{ borderTop:`1px solid ${COLORS.cardBorder}`, paddingTop:14 }}>
      <div style={{ fontSize:12, fontWeight:600, color:COLORS.text, marginBottom:10 }}>📊 DTW 비교 가중치 (합계 100%)</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
        {[
          { label:'📈 등락률', value:p.weightReturns, setter:p.setWeightReturns, color:'#3b82f6' },
          { label:'🕯️ 봉모양', value:p.weightCandle, setter:p.setWeightCandle, color:'#f59e0b' },
          { label:'📊 거래량', value:p.weightVolume, setter:p.setWeightVolume, color:'#10b981' },
        ].map(w => (<div key={w.label}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:COLORS.textDim, marginBottom:6 }}>
            <span>{w.label}</span><span style={{ color:w.color, fontWeight:700 }}>{(w.value*100).toFixed(0)}%</span>
          </div>
          <input type="range" min={0} max={80} step={5} value={w.value*100}
            onChange={e => { const nv = parseInt(e.target.value)/100; w.setter(nv); p.setActivePreset('custom'); const allW = [p.weightReturns,p.weightCandle,p.weightVolume]; const idx = allW.indexOf(w.value); const o1 = idx===0?1:0, o2 = idx===2?1:2; const rem = 1-nv; const os = allW[o1]+allW[o2]; if(os>0){ [p.setWeightReturns,p.setWeightCandle,p.setWeightVolume][o1](Math.round(allW[o1]/os*rem*100)/100); [p.setWeightReturns,p.setWeightCandle,p.setWeightVolume][o2](Math.round(allW[o2]/os*rem*100)/100); } else { [p.setWeightReturns,p.setWeightCandle,p.setWeightVolume][o1](rem/2); [p.setWeightReturns,p.setWeightCandle,p.setWeightVolume][o2](rem/2); } }}
            style={{ width:'100%', height:6, borderRadius:3, accentColor:w.color, cursor:'pointer' }} />
        </div>))}
      </div>
      <div style={{ display:'flex', height:8, borderRadius:4, overflow:'hidden', marginTop:10 }}>
        <div style={{ width:`${p.weightReturns*100}%`, background:'#3b82f6' }} />
        <div style={{ width:`${p.weightCandle*100}%`, background:'#f59e0b' }} />
        <div style={{ width:`${p.weightVolume*100}%`, background:'#10b981' }} />
      </div>
    </div>
  </div>);
}

// ★ 패턴 스캔 매칭 결과 테이블 — 별도 컴포넌트 (IIFE → memo + 페이지네이션)
const PatternScanMatchTable = React.memo(function PatternScanMatchTable({
  rawMatches, patternSortKey, setPatternSortKey, patternSortDir, setPatternSortDir,
  selectedPatternStocks, setSelectedPatternStocks, openRegModal
}) {
  const [visibleCount, setVisibleCount] = React.useState(50);
  // 정렬된 매칭 결과 (useMemo)
  const sortedMatches = React.useMemo(() => {
    return [...rawMatches].sort((a, b) => {
      let va, vb;
      switch (patternSortKey) {
        case 'name': va = (a.name || ''); vb = (b.name || ''); break;
        case 'market': va = (a.market || ''); vb = (b.market || ''); break;
        case 'current_price': va = (a.current_price || 0); vb = (b.current_price || 0); break;
        case 'similarity': va = (a.similarity || 0); vb = (b.similarity || 0); break;
        case 'matched_pattern_name': va = (a.matched_pattern_name || ''); vb = (b.matched_pattern_name || ''); break;
        default: va = 0; vb = 0;
      }
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb, 'ko');
        return patternSortDir === 'asc' ? cmp : -cmp;
      }
      return patternSortDir === 'asc' ? va - vb : vb - va;
    });
  }, [rawMatches, patternSortKey, patternSortDir]);

  // 정렬 변경 시 페이지네이션 리셋
  React.useEffect(() => { setVisibleCount(50); }, [patternSortKey, patternSortDir]);

  const visibleMatches = sortedMatches.slice(0, visibleCount);
  const allSelected = selectedPatternStocks.size === rawMatches.length && rawMatches.length > 0;
  const togglePatternStock = (code) => {
    setSelectedPatternStocks(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };
  const toggleAllPatternStocks = () => {
    if (allSelected) setSelectedPatternStocks(new Set());
    else setSelectedPatternStocks(new Set(rawMatches.map(m => m.code)));
  };
  const handleSort = (key) => {
    if (patternSortKey === key) {
      setPatternSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setPatternSortKey(key);
      setPatternSortDir(key === 'name' || key === 'market' || key === 'matched_pattern_name' ? 'asc' : 'desc');
    }
  };
  const sortIcon = (key) => {
    if (patternSortKey !== key) return <span style={{ opacity:0.3, marginLeft:3 }}>↕</span>;
    return <span style={{ marginLeft:3, color:'#c4b5fd' }}>{patternSortDir === 'asc' ? '▲' : '▼'}</span>;
  };
  const columns = [
    { key:'name', label:'종목', align:'left' },
    { key:'market', label:'시장', align:'left' },
    { key:'current_price', label:'현재가', align:'right' },
    { key:'similarity', label:'유사도', align:'right' },
    { key:'matched_pattern_name', label:'매칭 패턴', align:'left' },
  ];
  return (
  <div style={{ marginTop:10 }}>
    {/* 선택 컨트롤 바 */}
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      marginBottom:8, padding:'8px 12px', borderRadius:8,
      background: selectedPatternStocks.size > 0 ? 'rgba(139,92,246,0.08)' : COLORS.card,
      border: `1px solid ${selectedPatternStocks.size > 0 ? 'rgba(139,92,246,0.3)' : COLORS.cardBorder}`,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={toggleAllPatternStocks} style={{
          width:20, height:20, borderRadius:4, cursor:'pointer',
          border:`2px solid ${allSelected ? '#8b5cf6' : COLORS.cardBorder}`,
          background: allSelected ? '#8b5cf6' : 'transparent',
          display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, padding:0,
        }}>{allSelected ? '✓' : ''}</button>
        <span style={{ fontSize:11, color: selectedPatternStocks.size > 0 ? '#8b5cf6' : COLORS.textDim }}>
          {selectedPatternStocks.size > 0
            ? `${selectedPatternStocks.size}개 종목 선택됨`
            : '종목을 선택하여 가상투자에 등록하세요'}
        </span>
      </div>
      <button
        onClick={() => openRegModal('patternScan')}
        disabled={selectedPatternStocks.size === 0}
        style={{
          padding:'7px 16px', fontSize:12, fontWeight:700, borderRadius:8,
          border:'none', cursor: selectedPatternStocks.size > 0 ? 'pointer' : 'default',
          background: selectedPatternStocks.size > 0 ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : '#374151',
          color: selectedPatternStocks.size > 0 ? '#fff' : COLORS.textDim,
          transition:'all 0.2s', fontFamily:'inherit',
        }}
      >💰 가상투자 등록 ({selectedPatternStocks.size})</button>
    </div>
    {/* 테이블 */}
    <div style={{ maxHeight:400, overflowY:'auto' }}>
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
      <thead>
        <tr style={{ borderBottom:'1px solid rgba(139,92,246,0.2)' }}>
          <th style={{ padding:'6px 8px', width:32 }}></th>
          {columns.map((col) => (
            <th key={col.key}
              onClick={() => handleSort(col.key)}
              style={{
                padding:'6px 8px', textAlign: col.align,
                color:'#8b5cf6', fontWeight:600, cursor:'pointer', userSelect:'none',
                whiteSpace:'nowrap', transition:'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color='#c4b5fd'}
              onMouseLeave={e => e.currentTarget.style.color='#8b5cf6'}
            >{col.label}{sortIcon(col.key)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visibleMatches.map((m, mi) => {
          const isSelected = selectedPatternStocks.has(m.code);
          return (
          <tr key={m.code || mi}
            onClick={() => togglePatternStock(m.code)}
            style={{
              borderBottom:`1px solid ${COLORS.cardBorder}`, cursor:'pointer',
              background: isSelected ? 'rgba(139,92,246,0.08)' : mi%2===0 ? 'transparent' : 'rgba(255,255,255,0.02)',
              transition:'background 0.15s',
            }}
            onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background='rgba(139,92,246,0.05)'; }}
            onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background=mi%2===0?'transparent':'rgba(255,255,255,0.02)'; }}
          >
            <td style={{ padding:'6px 8px', textAlign:'center' }}>
              <div style={{
                width:18, height:18, borderRadius:4, margin:'0 auto',
                border:`2px solid ${isSelected ? '#8b5cf6' : COLORS.cardBorder}`,
                background: isSelected ? '#8b5cf6' : 'transparent',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all 0.15s',
              }}>
                {isSelected && <span style={{ color:'white', fontSize:10, fontWeight:700 }}>✓</span>}
              </div>
            </td>
            <td style={{ padding:'6px 8px', fontWeight:600 }}>{m.name} <span style={{color:COLORS.textDim}}>({m.code})</span></td>
            <td style={{ padding:'6px 8px', color:COLORS.textDim }}>{m.market}</td>
            <td style={{ padding:'6px 8px', textAlign:'right' }}>{m.current_price?.toLocaleString()}</td>
            <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:700,
              color: m.similarity >= 75 ? COLORS.green : m.similarity >= 60 ? COLORS.yellow : COLORS.textDim }}>
              {m.similarity}%
            </td>
            <td style={{ padding:'6px 8px' }}>
              <span style={{ fontSize:10, padding:'2px 6px', borderRadius:6,
                background:'rgba(139,92,246,0.1)', color:'#8b5cf6' }}>{m.matched_pattern_name}</span>
            </td>
          </tr>);
        })}
      </tbody>
    </table>
    </div>
    {sortedMatches.length > visibleCount && (
      <div style={{ textAlign:'center', padding:8 }}>
        <button onClick={() => setVisibleCount(prev => prev + 50)}
          style={{ padding:'6px 20px', fontSize:11, borderRadius:6, cursor:'pointer',
            border:'1px solid rgba(139,92,246,0.3)', background:'rgba(139,92,246,0.08)', color:'#8b5cf6', fontWeight:600 }}>
          더보기 ({visibleCount}/{sortedMatches.length})
        </button>
      </div>
    )}
    {/* 하단 등록 바 */}
    {selectedPatternStocks.size > 0 && (
      <div style={{
        marginTop:10, padding:12, borderRadius:10,
        background:'rgba(139,92,246,0.1)', border:'1px solid rgba(139,92,246,0.3)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ fontSize:11, color:'#8b5cf6' }}>
          ✅ <b>{selectedPatternStocks.size}개</b> 종목 선택 —
          {sortedMatches.filter(m => selectedPatternStocks.has(m.code)).map(m => m.name).join(', ')}
        </div>
        <button onClick={() => openRegModal('patternScan')} style={{
          padding:'9px 20px', fontSize:13, fontWeight:700, borderRadius:8,
          border:'none', cursor:'pointer', fontFamily:'inherit',
          background:'linear-gradient(135deg, #8b5cf6, #7c3aed)', color:'#fff',
        }}>💰 가상투자 등록 →</button>
      </div>
    )}
  </div>
  );
});

function ScanResultView({ scanResult, scanSortKey, setScanSortKey, scanSortDir, setScanSortDir, scanFilterLevel, setScanFilterLevel, selectedScanStocks, toggleScanStock, selectAllVisible, setSelectedScanStocks, sendToAnalyzer, filteredScanResults, scanDate, scanSource, onReload, scanChartCode, scanChartCandles, scanChartLoading, fetchScanChart, scanHistoryList, showScanHistory, setShowScanHistory, loadingScanHistory, loadScanHistoryList, loadScanHistoryDetail, registerCandidates }) {
  const handleSort = (key) => {
    if (scanSortKey === key) { setScanSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }
    else { setScanSortKey(key); setScanSortDir('desc'); }
  };
  // ★ v5: 페이지네이션 — 50개씩 표시 (수백 개 DOM 렌더링 방지)
  const [visibleCount, setVisibleCount] = React.useState(50);
  const stats = scanResult.stats || {};
  const filtered = filteredScanResults;
  const visibleFiltered = filtered.slice(0, visibleCount);
  // 필터/정렬 변경 시 페이지네이션 리셋
  React.useEffect(() => { setVisibleCount(50); }, [scanFilterLevel, scanSortKey, scanSortDir]);
  const fmtDate = (iso) => { if (!iso) return ''; try { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } catch { return iso; } };

  return (<div>
    {scanDate && (<div onClick={onReload} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', marginBottom:12, borderRadius:8, background: scanSource==='db' ? 'rgba(139,92,246,0.1)' : scanSource==='loading' ? 'rgba(100,100,100,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${scanSource==='db' ? 'rgba(139,92,246,0.2)' : scanSource==='loading' ? 'rgba(100,100,100,0.2)' : 'rgba(16,185,129,0.2)'}`, cursor:'pointer', transition:'all 0.2s' }}
      onMouseEnter={e => e.currentTarget.style.opacity='0.8'}
      onMouseLeave={e => e.currentTarget.style.opacity='1'}>
      <span style={{ fontSize:12, color: scanSource==='db' ? COLORS.purple : scanSource==='loading' ? '#888' : COLORS.green }}>
        {scanSource==='loading' ? '⏳ DB에서 불러오는 중...' : scanSource==='db' ? '💾 DB에서 복원된 결과' : '✅ 방금 스캔한 결과'}
        <span style={{ marginLeft:8, fontSize:10, color:COLORS.textDim }}>클릭하면 DB에서 다시 불러옵니다</span>
      </span>
      <span style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:12, color:COLORS.textDim }}>마지막 스캔: <b style={{ color:COLORS.text }}>{fmtDate(scanDate)}</b>{scanResult.market && <span> · {scanResult.market==='ALL'?'전체':scanResult.market}</span>}</span>
      </span>
    </div>)}
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:12, marginBottom:16 }}>
      {[
        { label:'스캔 종목', value:stats.total_scanned, unit:'개', color:COLORS.accent },
        { label:'급상승 발견', value:stats.total_found, unit:'종목', color:COLORS.green },
        { label:'급상승 건수', value:stats.total_surges, unit:'건', color:COLORS.yellow },
        { label:'🔴 세력 의심', value:stats.high_manip_count, unit:'종목', color:COLORS.red },
        { label:'🟡 주의 필요', value:stats.medium_manip_count, unit:'종목', color:COLORS.yellow },
        { label:'⚡ 진입시그널', value:stats.entry_signal_count, unit:'종목', color:'#00BCD4' },
      ].map((item,i) => (<div key={i} style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:10, padding:14, textAlign:'center' }}>
        <div style={{ fontSize:11, color:COLORS.textDim, marginBottom:4 }}>{item.label}</div>
        <div style={{ fontSize:22, fontWeight:700, color:item.color }}>{item.value?.toLocaleString()??'-'}</div>
        <div style={{ fontSize:11, color:COLORS.textDim }}>{item.unit}</div>
      </div>))}
    </div>
    <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, padding:14, marginBottom:12, display:'flex', flexWrap:'wrap', gap:12, alignItems:'center' }}>
      <div style={{ display:'flex', gap:4 }}>
        <span style={{ fontSize:12, color:COLORS.textDim, alignSelf:'center', marginRight:4 }}>필터:</span>
        {[{v:'all',l:'전체',c:COLORS.accent,t:'모든 급상승 종목 표시'},{v:'high',l:'🔴 세력의심',c:COLORS.red,t:'거래량 폭증, 급등 후 급락 등 세력 개입 가능성이 높은 종목'},{v:'medium',l:'🟡 주의이상',c:COLORS.yellow,t:'세력 의심 + 주의 필요 등급 종목 (중간 이상 위험)'},{v:'entry',l:'⚡ 진입시그널',c:'#00BCD4',t:'OBV(35%)+VCP(30%)+DTW(35%) 가중합산 점수가 45점 이상인 매수 추천 종목\n• 공격적 모드: 30점 이상 (1개 전략 통과)\n• 균형 모드: 45점 이상 (2개 전략 통과)\n• 보수적 모드: 60점 이상 (3개 전략 통과)'},{v:'obv',l:'OBV',c:'#4FC3F7',t:'OBV 다이버전스 (가중치 35%): 주가 횡보/하락 중 거래량(OBV)이 상승하면 세력 매집 징후\n• 0~60점: OBV 상승 강도 (기울기 클수록 고점수)\n• 0~40점: 주가 약세 강도 (하락 클수록 보너스)\n• 50점 이상이면 강한 매집 시그널'},{v:'vcp',l:'VCP',c:'#AB47BC',t:'볼린저 스퀴즈 (가중치 30%): 변동성이 N개월 최저로 수축 → 급등 전 눌림목 패턴\n• 0~60점: 밴드폭 백분위 (낮을수록 고점수)\n• 0~40점: 연속 수축일 보너스 (5일당 +8점)\n• 50점 이상이면 강한 스퀴즈 감지'},{v:'dtw',l:'DTW',c:'#FF7043',t:'부분 DTW 매칭 (가중치 35%): 과거 급등 패턴의 초기 40%구간과 현재 차트 유사도 비교\n• 등락률 유사도 60% + 거래량 유사도 40% 가중평균\n• 50% 이상: 시그널 감지, 70% 이상: 강한 매칭\n• 점수 = 유사도 그대로 (0~100)'}].map(f => (<button key={f.v} onClick={() => setScanFilterLevel(f.v)} title={f.t} style={{ padding:'5px 12px', fontSize:11, borderRadius:6, cursor:'pointer', border:`1px solid ${scanFilterLevel===f.v?f.c:COLORS.cardBorder}`, background:scanFilterLevel===f.v?`${f.c}20`:'transparent', color:scanFilterLevel===f.v?f.c:COLORS.textDim }}>{f.l}</button>))}
      </div>
      <div style={{ display:'flex', gap:4 }}>
        <span style={{ fontSize:12, color:COLORS.textDim, alignSelf:'center', marginRight:4 }}>정렬:</span>
        {[{v:'manip_score',l:'세력점수'},{v:'rise_pct',l:'상승률'},{v:'date',l:'날짜'},{v:'from_peak',l:'고점대비'},{v:'entry_score',l:'진입점수'}].map(s => { const active = scanSortKey===s.v; return (<button key={s.v} onClick={() => handleSort(s.v)} style={{ padding:'5px 10px', fontSize:11, borderRadius:6, cursor:'pointer', border:`1px solid ${active?COLORS.accent:COLORS.cardBorder}`, background:active?COLORS.accentDim:'transparent', color:active?COLORS.accent:COLORS.textDim }}>{s.l}{active ? (scanSortDir==='desc'?' ▼':' ▲') : ''}</button>); })}
      </div>
      <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
        <button onClick={selectAllVisible} style={{ padding:'5px 12px', fontSize:11, borderRadius:6, cursor:'pointer', border:`1px solid ${COLORS.cardBorder}`, background:'transparent', color:COLORS.textDim }}>전체선택</button>
        <button onClick={() => setSelectedScanStocks(new Set())} style={{ padding:'5px 12px', fontSize:11, borderRadius:6, cursor:'pointer', border:`1px solid ${COLORS.cardBorder}`, background:'transparent', color:COLORS.textDim }}>선택해제</button>
        <button onClick={() => {
          if (selectedScanStocks.size === 0) return;
          const scanStocks = scanResult?.stocks || [];
          const selected = scanStocks.filter(s => selectedScanStocks.has(s.code));
          registerCandidates(selected, 'scan');
        }} disabled={selectedScanStocks.size===0} style={{ padding:'6px 16px', fontSize:12, fontWeight:700, borderRadius:8, border:'none', cursor:selectedScanStocks.size>0?'pointer':'default', background:selectedScanStocks.size>0?'#f59e0b':'#374151', color:selectedScanStocks.size>0?'#000':COLORS.textDim }}>📋 후보등록 ({selectedScanStocks.size})</button>
        <button onClick={sendToAnalyzer} disabled={selectedScanStocks.size===0} style={{ padding:'6px 16px', fontSize:12, fontWeight:700, borderRadius:8, border:'none', cursor:selectedScanStocks.size>0?'pointer':'default', background:selectedScanStocks.size>0?COLORS.accent:'#374151', color:selectedScanStocks.size>0?COLORS.white:COLORS.textDim }}>🔬 선택 종목 패턴분석 ({selectedScanStocks.size})</button>
      </div>
    </div>
    <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 80px 80px 60px 70px 80px 80px 40px', padding:'10px 14px', fontSize:11, color:COLORS.textDim, fontWeight:600, borderBottom:`1px solid ${COLORS.cardBorder}`, background:'#0d1321' }}>
        <span></span>
        {[{k:'name',l:'종목',align:'left'},{k:'current_price',l:'현재가',align:'right'},{k:'rise_pct',l:'최대상승',align:'center'},{k:'surge_count',l:'횟수',align:'center'},{k:'from_peak',l:'고점대비',align:'center'},{k:'manip_score',l:'세력점수',align:'center'},{k:'manip_label',l:'판정',align:'center'}].map(col => (
          <span key={col.k} onClick={() => handleSort(col.k)} style={{ textAlign:col.align, cursor:'pointer', userSelect:'none', color: scanSortKey===col.k ? COLORS.accent : COLORS.textDim }}>
            {col.l}{scanSortKey===col.k ? (scanSortDir==='desc'?' ▼':' ▲') : ''}
          </span>
        ))}
        <span style={{textAlign:'center'}}>차트</span>
      </div>
      {filtered.length===0 ? (<div style={{ textAlign:'center', padding:30, color:COLORS.textDim, fontSize:13 }}>조건에 해당하는 급상승 종목이 없습니다.</div>) : visibleFiltered.map((stock, i) => {
        const sel = selectedScanStocks.has(stock.code);
        const mc = stock.top_manip_level==='high'?COLORS.red:stock.top_manip_level==='medium'?COLORS.yellow:COLORS.green;
        const isChartOpen = scanChartCode === stock.code;
        return (<React.Fragment key={stock.code}>
          <div onClick={() => toggleScanStock(stock.code)} style={{ display:'grid', gridTemplateColumns:'40px 1fr 80px 80px 60px 70px 80px 80px 40px', padding:'10px 14px', alignItems:'center', borderBottom: isChartOpen ? 'none' : `1px solid ${COLORS.cardBorder}`, background:sel?'rgba(59,130,246,0.08)':i%2===0?'transparent':'rgba(255,255,255,0.015)', cursor:'pointer' }}>
          <div style={{textAlign:'center'}}><div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${sel?COLORS.accent:COLORS.cardBorder}`, background:sel?COLORS.accent:'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:COLORS.white, fontWeight:700 }}>{sel&&'✓'}</div></div>
          <div><div style={{ fontSize:13, fontWeight:600 }}>{stock.name}<span style={{ fontSize:10, color:COLORS.textDim, marginLeft:6 }}>{stock.code} · {stock.market}</span></div><div style={{ fontSize:10, color:COLORS.textDim, display:'flex', alignItems:'center', gap:6 }}>최근: {stock.latest_surge_date||'-'}{stock.entry_signals && stock.entry_signals.should_buy && (<span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'1px 6px', borderRadius:4, background:'rgba(0,188,212,0.12)', border:'1px solid rgba(0,188,212,0.3)', fontSize:9, fontWeight:700, color:'#00BCD4' }}>⚡{stock.entry_signals.signals?.obv?.signal?'OBV':''}{ stock.entry_signals.signals?.obv?.signal && stock.entry_signals.signals?.vcp?.signal ? '+' : ''}{stock.entry_signals.signals?.vcp?.signal?'VCP':''}{(stock.entry_signals.signals?.obv?.signal||stock.entry_signals.signals?.vcp?.signal) && stock.entry_signals.signals?.partial_dtw?.signal?'+':''}{stock.entry_signals.signals?.partial_dtw?.signal?`DTW${stock.entry_signals.signals.partial_dtw.similarity?.toFixed(0)||''}%`:''} {stock.entry_signals.entry_score?.toFixed(0)}점</span>)}{stock.entry_signals && !stock.entry_signals.should_buy && stock.entry_signals.active_signals > 0 && (<span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'1px 6px', borderRadius:4, background:'rgba(255,214,0,0.08)', border:'1px solid rgba(255,214,0,0.2)', fontSize:9, color:'#FFD600' }}>{[stock.entry_signals.signals?.obv?.signal&&'OBV',stock.entry_signals.signals?.vcp?.signal&&'VCP',stock.entry_signals.signals?.partial_dtw?.signal&&'DTW'].filter(Boolean).join('+')} {stock.entry_signals.entry_score?.toFixed(0)}점</span>)}</div></div>
          <div style={{ textAlign:'right', fontSize:12, fontWeight:600 }}>{fmt(stock.current_price)}</div>
          <div style={{ textAlign:'center', fontSize:12, fontWeight:700, color:COLORS.red }}>+{stock.latest_rise_pct}%</div>
          <div style={{ textAlign:'center', fontSize:12, fontWeight:600 }}>{stock.surge_count}회</div>
          <div style={{ textAlign:'center', fontSize:11, fontWeight:600, color:stock.latest_from_peak<-30?COLORS.accent:COLORS.textDim }}>{stock.latest_from_peak}%</div>
          <div style={{textAlign:'center'}}><div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}><div style={{ width:36, height:6, background:'#1a2234', borderRadius:3, overflow:'hidden' }}><div style={{ width:`${stock.top_manip_score}%`, height:'100%', background:mc, borderRadius:3 }} /></div><span style={{ fontSize:11, fontWeight:700, color:mc }}>{stock.top_manip_score}</span></div></div>
          <div style={{ textAlign:'center', fontSize:10, fontWeight:600, padding:'3px 4px', borderRadius:6, background:`${mc}20`, color:mc }}>{stock.top_manip_label}</div>
          <div style={{ textAlign:'center' }}>
            <button onClick={(e) => { e.stopPropagation(); fetchScanChart(stock); }}
              style={{ background: isChartOpen ? 'rgba(79,195,247,0.2)' : 'transparent', border: isChartOpen ? '1px solid rgba(79,195,247,0.4)' : '1px solid rgba(100,140,200,0.15)', borderRadius:6, padding:'3px 6px', cursor:'pointer', fontSize:13, color: isChartOpen ? '#4fc3f7' : COLORS.textDim, transition:'all 0.15s' }}
              title="일봉 차트 보기">📊</button>
          </div>
        </div>
        {/* ── 차트 확장 영역 ── */}
        {isChartOpen && (
          <div style={{ padding:'12px 14px 16px', borderBottom:`1px solid ${COLORS.cardBorder}`, background:'rgba(8,15,30,0.6)' }}>
            {scanChartLoading ? (
              <div style={{ textAlign:'center', padding:30, color:COLORS.textDim, fontSize:13 }}>📊 차트 데이터 로딩 중...</div>
            ) : scanChartCandles.length > 0 ? (
              <ScanStockChart candles={scanChartCandles} stock={stock} />
            ) : (
              <div style={{ textAlign:'center', padding:30, color:COLORS.textDim, fontSize:13 }}>차트 데이터가 없습니다.</div>
            )}
          </div>
        )}
        </React.Fragment>);
      })}
    </div>
    {filtered.length > visibleCount && (
      <div style={{ textAlign:'center', padding:12 }}>
        <button onClick={() => setVisibleCount(prev => prev + 50)}
          style={{ padding:'8px 24px', fontSize:12, borderRadius:8, cursor:'pointer',
            border:`1px solid ${COLORS.accent}`, background:COLORS.accentDim, color:COLORS.accent, fontWeight:600 }}>
          더보기 ({visibleCount}/{filtered.length})
        </button>
      </div>
    )}
    <div style={{ fontSize:12, color:COLORS.textDim, marginTop:8, textAlign:'right' }}>표시 {visibleFiltered.length} / 총 {filtered.length}개 종목</div>
    <div style={{ marginTop:12, padding:12, borderRadius:8, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', fontSize:11, color:COLORS.yellow, lineHeight:1.6 }}>⚠️ 세력 의심 점수는 거래량 폭증, 급등 후 급락, 매집 흔적 등을 종합한 통계적 지표이며, 실제 작전 여부를 확정하지 않습니다. 반드시 추가 확인 후 투자 판단하세요.</div>
  </div>);
}

function TabSummary({ result, saveClusterPattern, savingPattern }) {
  const clusters = result.clusters||[], summary = result.summary||{};
  return (<div>
    {summary.common_features?.length>0 && (<div style={{ background:COLORS.accentDim, border:'1px solid rgba(59,130,246,0.3)', borderRadius:10, padding:16, marginBottom:16,
      display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:8, color:COLORS.accent }}>💡 공통 패턴 특징</div>
        {summary.common_features.map((f,i) => (<div key={i} style={{ fontSize:13, color:COLORS.text, marginBottom:4, paddingLeft:12 }}>• {f}</div>))}
      </div>
      {saveClusterPattern && clusters.length > 0 && (
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          {clusters.map((c, ci) => (
            <button key={ci} onClick={(e) => { e.stopPropagation(); saveClusterPattern(c, ci); }}
              disabled={savingPattern === ci}
              style={{ width:90, height:90, fontSize:12, fontWeight:700, borderRadius:14, cursor:'pointer',
                border:'2px solid #8b5cf6', background:'rgba(139,92,246,0.15)', color:'#c4b5fd',
                opacity: savingPattern === ci ? 0.5 : 1, transition:'all 0.15s',
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6 }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(139,92,246,0.35)'; e.currentTarget.style.color='#fff'; e.currentTarget.style.boxShadow='0 0 20px rgba(139,92,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(139,92,246,0.15)'; e.currentTarget.style.color='#c4b5fd'; e.currentTarget.style.boxShadow='none'; }}>
              <span style={{ fontSize:28 }}>{savingPattern === ci ? '⏳' : '💾'}</span>
              <span style={{ fontSize:11, fontWeight:700 }}>{savingPattern === ci ? '저장 중...' : `패턴 ${clusters.length > 1 ? `#${ci+1} ` : ''}저장`}</span>
            </button>
          ))}
        </div>
      )}
    </div>)}
    {clusters.length===0 ? <div style={{textAlign:'center',padding:40,color:COLORS.textDim}}>유의미한 공통 패턴이 발견되지 않았습니다.</div> :
      clusters.map((c,ci) => (<div key={ci} style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, padding:18, marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div><span style={{ fontSize:11, background:COLORS.accentDim, color:COLORS.accent, padding:'2px 10px', borderRadius:12, fontWeight:600 }}>패턴 #{ci+1}</span><span style={{ fontSize:13, fontWeight:600, marginLeft:10 }}>{c.pattern_count}건 발견</span></div>
          <div style={{ fontSize:12, color:COLORS.textDim }}>유사도 {c.avg_similarity?.toFixed(1)}%</div>
        </div>
        <div style={{ fontSize:13, color:COLORS.text, marginBottom:14, padding:10, background:'#0d1321', borderRadius:6, lineHeight:1.6 }}>{c.description||'패턴 분석 중'}</div>
        {c.avg_return_flow?.length>0 && <MiniReturnChart returns={c.avg_return_flow} label="평균 등락률 흐름" />}
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:11, color:COLORS.textDim, marginBottom:6 }}>소속 종목</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {c.members?.map((m,mi) => (<span key={mi} style={{ fontSize:11, padding:'3px 10px', borderRadius:12, background:'#1a2234', border:`1px solid ${COLORS.cardBorder}` }}>{m.name}<span style={{color:COLORS.green,marginLeft:4}}>+{m.rise_pct}%</span><span style={{color:COLORS.textDim,marginLeft:4}}>{m.surge_date}</span></span>))}
          </div>
        </div>
        <div style={{ display:'flex', gap:20, marginTop:12, paddingTop:12, borderTop:`1px solid ${COLORS.cardBorder}`, fontSize:12 }}>
          <span>평균 상승: <b style={{color:COLORS.red}}>+{c.avg_rise_pct}%</b></span><span>평균 기간: <b>{c.avg_rise_days}일</b></span>
        </div>
      </div>))}
  </div>);
}

function TabChart({ result }) {
  const patterns = result.all_patterns||[];
  if(patterns.length===0) return <div style={{textAlign:'center',padding:40,color:COLORS.textDim}}>차트를 표시할 패턴이 없습니다.</div>;
  return (<div>
    <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, padding:18, marginBottom:16 }}>
      <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>📈 등락률 흐름 오버레이</div>
      <OverlayChart patterns={patterns} dataKey="returns" yLabel="등락률 (%)" />
    </div>
    <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, padding:18, marginBottom:16 }}>
      <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>📊 거래량 비율 오버레이</div>
      <OverlayChart patterns={patterns} dataKey="volume_ratios" yLabel="거래량 배율" />
    </div>
    <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>🕯️ 개별 패턴 일봉</div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:12 }}>
      {patterns.slice(0,12).map((p,i) => (<div key={i} style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:10, padding:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontSize:12, fontWeight:600 }}>{p.name} <span style={{color:COLORS.textDim}}>({p.code})</span></span>
          <span style={{ fontSize:11, color:COLORS.green }}>+{p.surge?.rise_pct}% ({p.surge?.start_date})</span>
        </div>
        <MiniCandleChart candles={p.candles||[]} />
      </div>))}
    </div>
  </div>);
}

function TabRecommend({ result, selectedRecStocks, setSelectedRecStocks, setFilteredRecCodes, onRegister, onKisOrder }) {
  const [recSortKey, setRecSortKey] = useState('composite_score');
  const [recSortDir, setRecSortDir] = useState('desc');
  const [recFilter, setRecFilter] = useState('all');
  const [excludeMa5Down, setExcludeMa5Down] = useState(true);
  // ★ 차트 토글 상태
  const [recChartCode, setRecChartCode] = useState(null);
  const [recChartCandles, setRecChartCandles] = useState([]);
  const [recChartLoading, setRecChartLoading] = useState(false);
  const [requireMa5Above, setRequireMa5Above] = useState(true);
  const [excludeGcExpired, setExcludeGcExpired] = useState(true);  // ★ v9: GC 5일 경과 제외
  const [filterHyunmu, setFilterHyunmu] = useState(false);  // ★ 현무 (양음양 +-+) 필터
  const [filterVolumeConfirm, setFilterVolumeConfirm] = useState(false);  // ★ 거래량 동반
  const [excludeRsiOverbought, setExcludeRsiOverbought] = useState(false);  // ★ RSI 과매수 제외
  const [excludeUpperWick, setExcludeUpperWick] = useState(false);  // ★ 윗꼬리 경고 제외
  const [filterBollingerLow, setFilterBollingerLow] = useState(false);  // ★ 볼린저 하단
  const [filterBullishDays, setFilterBullishDays] = useState(false);  // ★ 연속 양봉
  const [filterMinTradingValue, setFilterMinTradingValue] = useState(false);  // ★ 거래대금 필터
  const [candleFilters, setCandleFilters] = useState({});  // code -> { ma5Declining, hyunmu, ... }
  const [candleLoading, setCandleLoading] = useState(false);
  const candleFetchedRef = useRef(false);
  const rawRecs = result.recommendations||[];
  const entrySummary = result.entry_summary || {};
  const scannedCount = result.scanned_candidates || rawRecs.length;
  const analyzedCodes = result.analyzed_codes || [];

  // ★ 일봉 기반 필터 계산 (MA5 하향 + 현무 패턴 + 6종 추가 필터)
  const computeCandleFilters = useCallback((candles) => {
    const res = {
      ma5Declining: false, hyunmu: false,
      volumeConfirm: false, rsiOverbought: false, rsiValue: 0,
      upperWickWarning: false, bollingerLow: false,
      bullishDays: false, bullishCount: 0,
      minTradingValue: false, avgTradingValue: 0,
    };
    if (!candles || candles.length < 5) return res;

    // --- MA5 하향 계산: 5일 이동평균이 직전 최고점 대비 하향 ---
    const ma5Values = [];
    for (let i = 4; i < candles.length; i++) {
      const sum = candles.slice(i - 4, i + 1).reduce((s, c) => s + c.close, 0);
      ma5Values.push(sum / 5);
    }
    if (ma5Values.length >= 3) {
      const recentMA5 = ma5Values.slice(-10);
      const peakMA5 = Math.max(...recentMA5);
      const currentMA5 = recentMA5[recentMA5.length - 1];
      const prevMA5 = recentMA5[recentMA5.length - 2];
      res.ma5Declining = currentMA5 < peakMA5 && currentMA5 < prevMA5;
    }

    // --- 현무 패턴 (양음양 +-+): 최근 30일 내 3연속 캔들 ---
    const recent = candles.slice(-30);
    for (let i = 0; i <= recent.length - 3; i++) {
      const c1 = recent[i], c2 = recent[i + 1], c3 = recent[i + 2];
      const isBullishPlus = (c) => c.close > c.open &&
        ((c.close - c.open) / c.open >= 0.10 || (c.high - c.open) / c.open >= 0.15);
      const isBearishPlus = (c) => c.close < c.open &&
        ((c.open - c.close) / c.open >= 0.10 || (c.open - c.low) / c.open >= 0.15);
      if (isBullishPlus(c1) && isBearishPlus(c2) && isBullishPlus(c3)) {
        res.hyunmu = true;
        break;
      }
    }

    // --- ★ 거래량 동반: 최근 3일 평균 거래량 > 20일 평균 × 1.5 ---
    if (candles.length >= 20) {
      const vol20 = candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
      const vol3 = candles.slice(-3).reduce((s, c) => s + (c.volume || 0), 0) / 3;
      res.volumeConfirm = vol20 > 0 && vol3 > vol20 * 1.5;
    }

    // --- ★ RSI(14) 계산 ---
    if (candles.length >= 15) {
      const changes = [];
      for (let i = 1; i < candles.length; i++) changes.push(candles[i].close - candles[i - 1].close);
      const period = 14;
      let avgGain = 0, avgLoss = 0;
      for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i]; else avgLoss += Math.abs(changes[i]);
      }
      avgGain /= period; avgLoss /= period;
      for (let i = period; i < changes.length; i++) {
        avgGain = (avgGain * (period - 1) + (changes[i] > 0 ? changes[i] : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (changes[i] < 0 ? Math.abs(changes[i]) : 0)) / period;
      }
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      res.rsiValue = Math.round(100 - (100 / (1 + rs)));
      res.rsiOverbought = res.rsiValue >= 75;
    }

    // --- ★ 윗꼬리 경고: 최근 3일 내 (고가-종가)/(고가-저가) > 0.6 ---
    const last3 = candles.slice(-3);
    for (const c of last3) {
      const range = c.high - c.low;
      if (range > 0 && (c.high - c.close) / range > 0.6) {
        res.upperWickWarning = true;
        break;
      }
    }

    // --- ★ 볼린저밴드(20, 2σ): 현재가가 중간밴드 이하 ---
    if (candles.length >= 20) {
      const closes20 = candles.slice(-20).map(c => c.close);
      const mean = closes20.reduce((s, v) => s + v, 0) / 20;
      const std = Math.sqrt(closes20.reduce((s, v) => s + (v - mean) ** 2, 0) / 20);
      const currentClose = candles[candles.length - 1].close;
      res.bollingerLow = currentClose <= mean;  // 중간밴드(MA20) 이하
    }

    // --- ★ 연속 양봉: 최근 5일 중 양봉(종가>시가) 3일 이상 ---
    const last5 = candles.slice(-5);
    const bullCount = last5.filter(c => c.close > c.open).length;
    res.bullishCount = bullCount;
    res.bullishDays = bullCount >= 3;

    // --- ★ 거래대금: 최근 5일 평균 (종가×거래량) > 5억원 ---
    const last5tv = candles.slice(-5);
    const avgTV = last5tv.reduce((s, c) => s + (c.close * (c.volume || 0)), 0) / last5tv.length;
    res.avgTradingValue = avgTV;
    res.minTradingValue = avgTV >= 500000000;  // 5억원

    return res;
  }, []);

  // 일봉 데이터 가져와서 필터 계산
  useEffect(() => {
    if (rawRecs.length === 0 || candleFetchedRef.current) return;
    candleFetchedRef.current = true;
    setCandleLoading(true);
    Promise.all(rawRecs.map(async (rec) => {
      try {
        const res = await fetch(`${API_BASE}/api/virtual-invest/candles/${rec.code}?count=60`);
        const data = await res.json();
        return { code: rec.code, ...computeCandleFilters(data.candles || []) };
      } catch { return { code: rec.code, ma5Declining: false, hyunmu: false, volumeConfirm: false, rsiOverbought: false, rsiValue: 0, upperWickWarning: false, bollingerLow: false, bullishDays: false, bullishCount: 0, minTradingValue: false, avgTradingValue: 0 }; }
    })).then(results => {
      const map = {};
      results.forEach(r => { const { code, ...rest } = r; map[code] = rest; });
      setCandleFilters(map);
      setCandleLoading(false);
    });
  }, [rawRecs.length > 0]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 필터 적용
  let recs = [...rawRecs];
  if (excludeMa5Down) recs = recs.filter(r => {
    const cf = candleFilters[r.code];
    return cf ? !cf.ma5Declining : !r.ma5_declining;  // 일봉 데이터 우선, 없으면 API 필드 fallback
  });
  if (requireMa5Above) recs = recs.filter(r => r.ma5_above_ma20 !== false);
  if (excludeGcExpired) recs = recs.filter(r => !(r.gc_days >= 5));  // ★ v9: GC 5일 경과 제외
  if (filterHyunmu) recs = recs.filter(r => candleFilters[r.code]?.hyunmu);
  if (filterVolumeConfirm) recs = recs.filter(r => candleFilters[r.code]?.volumeConfirm);
  if (excludeRsiOverbought) recs = recs.filter(r => !candleFilters[r.code]?.rsiOverbought);
  if (excludeUpperWick) recs = recs.filter(r => !candleFilters[r.code]?.upperWickWarning);
  if (filterBollingerLow) recs = recs.filter(r => candleFilters[r.code]?.bollingerLow);
  if (filterBullishDays) recs = recs.filter(r => candleFilters[r.code]?.bullishDays);
  if (filterMinTradingValue) recs = recs.filter(r => candleFilters[r.code]?.minTradingValue);
  if (recFilter === 'early') recs = recs.filter(r => r.early_entry);
  else if (recFilter === 'auto_buy') recs = recs.filter(r => r.entry_grade === 'auto_buy');
  else if (recFilter === 'watch') recs = recs.filter(r => r.entry_grade === 'watch' || r.entry_grade === 'auto_buy');

  // 정렬 적용
  recs.sort((a, b) => {
    let va, vb;
    if (recSortKey === 'composite_score') { va = a.composite_score || 0; vb = b.composite_score || 0; }
    else if (recSortKey === 'entry_score') { va = a.entry_score || 0; vb = b.entry_score || 0; }
    else if (recSortKey === 'early_score') { va = a.early_score || 0; vb = b.early_score || 0; }
    else if (recSortKey === 'similarity') { va = a.similarity || 0; vb = b.similarity || 0; }
    else { va = a.similarity || 0; vb = b.similarity || 0; }
    return recSortDir === 'desc' ? vb - va : va - vb;
  });

  const toggleRec = (code) => {
    setSelectedRecStocks(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  // 필터 적용 후 보이는 종목 코드를 부모에 동기화
  const filteredCodes = useMemo(() => new Set(recs.map(r => r.code)), [recs]);
  useEffect(() => { if (setFilteredRecCodes) setFilteredRecCodes(filteredCodes); }, [filteredCodes, setFilteredRecCodes]);

  const toggleAll = () => {
    if (selectedRecStocks.size === recs.length && recs.every(r => selectedRecStocks.has(r.code))) {
      setSelectedRecStocks(new Set());
    } else {
      setSelectedRecStocks(new Set(recs.map(r => r.code)));
    }
  };

  // ★ 현재 적용된 필터 정보 수집
  const getActiveFilters = () => {
    const filters = [];
    if (recFilter !== 'all') {
      const labels = { early: '⚡ 조기진입', auto_buy: '🟢 자동매수', watch: '🟡 감시이상' };
      filters.push({ label: labels[recFilter] || recFilter, color: recFilter === 'early' ? '#f97316' : recFilter === 'auto_buy' ? '#10b981' : '#f59e0b' });
    }
    if (excludeMa5Down) {
      const cnt = rawRecs.filter(r => candleFilters[r.code]?.ma5Declining).length;
      filters.push({ label: `MA5 하향 제외 (-${cnt})`, color: '#f59e0b' });
    }
    if (requireMa5Above) {
      const cnt = rawRecs.filter(r => r.ma5_above_ma20 === false).length;
      filters.push({ label: `MA5>MA20 (-${cnt})`, color: '#a78bfa' });
    }
    if (excludeGcExpired) {
      const cnt = rawRecs.filter(r => r.gc_days >= 5).length;
      filters.push({ label: `GC 5일 경과 제외 (-${cnt})`, color: '#ef4444' });
    }
    if (filterHyunmu) {
      const cnt = rawRecs.filter(r => candleFilters[r.code]?.hyunmu).length;
      filters.push({ label: `🐢 현무 (${cnt}개)`, color: '#4fc3f7' });
    }
    if (filterVolumeConfirm) {
      const cnt = rawRecs.filter(r => candleFilters[r.code]?.volumeConfirm).length;
      filters.push({ label: `📊 거래량 동반 (${cnt}개)`, color: '#22d3ee' });
    }
    if (excludeRsiOverbought) {
      const cnt = rawRecs.filter(r => candleFilters[r.code]?.rsiOverbought).length;
      filters.push({ label: `🌡️ RSI 과매수 제외 (-${cnt})`, color: '#f43f5e' });
    }
    if (excludeUpperWick) {
      const cnt = rawRecs.filter(r => candleFilters[r.code]?.upperWickWarning).length;
      filters.push({ label: `📌 윗꼬리 제외 (-${cnt})`, color: '#fb923c' });
    }
    if (filterBollingerLow) {
      const cnt = rawRecs.filter(r => candleFilters[r.code]?.bollingerLow).length;
      filters.push({ label: `📉 볼린저 하단 (${cnt}개)`, color: '#818cf8' });
    }
    if (filterBullishDays) {
      const cnt = rawRecs.filter(r => candleFilters[r.code]?.bullishDays).length;
      filters.push({ label: `🟩 연속 양봉 (${cnt}개)`, color: '#34d399' });
    }
    if (filterMinTradingValue) {
      const cnt = rawRecs.filter(r => candleFilters[r.code]?.minTradingValue).length;
      filters.push({ label: `💰 거래대금 5억+ (${cnt}개)`, color: '#fbbf24' });
    }
    return filters;
  };

  const handleRegister = () => onRegister('recommend', getActiveFilters());

  // 진입등급 뱃지 렌더러
  const gradeLabel = (grade) => {
    if (grade === 'auto_buy') return { text: '🟢 자동매수', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
    if (grade === 'watch') return { text: '🟡 감시', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
    return { text: '⬜ 보류', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
  };

  // ★ 차트 데이터 로드
  const fetchRecChart = async (rec) => {
    if (recChartCode === rec.code) {
      setRecChartCode(null); setRecChartCandles([]); return;
    }
    setRecChartCode(rec.code);
    setRecChartLoading(true);
    setRecChartCandles([]);
    try {
      const res = await fetch(`${API_BASE}/api/virtual-invest/candles/${rec.code}?count=120`);
      const data = await res.json();
      setRecChartCandles(data.candles || []);
    } catch (e) {
      console.error('추천종목 차트 로드 실패:', e);
    } finally {
      setRecChartLoading(false);
    }
  };

  return (<div>
    {/* 스캔 정보 헤더 */}
    <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:8, background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', fontSize:12, color:COLORS.accent, lineHeight:1.6 }}>
      🔍 전종목 DB에서 <span style={{fontWeight:700,color:'#4fc3f7'}}>{scannedCount}개</span> 종목을 스캔하여,
      분석 대상({analyzedCodes.length}개) <span style={{fontWeight:700,color:'#10b981'}}>포함</span> 유사 패턴 종목입니다.
    </div>

    {/* ★ v5: 진입 품질 요약 */}
    {entrySummary.total > 0 && (
      <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:8, background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)', display:'flex', alignItems:'center', gap:16, fontSize:12 }}>
        <span style={{ color:COLORS.textDim }}>📊 진입 품질 평가</span>
        <span style={{ color:'#f97316', fontWeight:700 }}>⚡ 조기진입 {rawRecs.filter(r => r.early_entry).length}</span>
        <span style={{ color:'#10b981', fontWeight:700 }}>🟢 자동매수 {entrySummary.auto_buy||0}</span>
        <span style={{ color:'#f59e0b', fontWeight:700 }}>🟡 감시 {entrySummary.watch||0}</span>
        <span style={{ color:'#6b7280' }}>⬜ 보류 {entrySummary.hold||0}</span>
        {rawRecs.filter(r => r.gc_days >= 5).length > 0 && (
          <span style={{ color:'#ef4444', fontWeight:700 }}>⏰ GC경과 {rawRecs.filter(r => r.gc_days >= 5).length}</span>
        )}
        {entrySummary.avg_composite_score > 0 && (
          <span style={{ color:COLORS.accent, marginLeft:'auto', fontSize:11 }}>
            평균 종합점수: <b>{entrySummary.avg_composite_score}</b>점
          </span>
        )}
      </div>
    )}

    {/* ★ v5: 필터 + 정렬 */}
    {rawRecs.length > 0 && (
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, color:COLORS.textDim }}>필터:</span>
        {[{v:'all',l:'전체',c:COLORS.accent},{v:'early',l:'⚡ 조기진입',c:'#f97316'},{v:'auto_buy',l:'🟢 자동매수',c:'#10b981'},{v:'watch',l:'🟡 감시이상',c:'#f59e0b'}].map(f => (
          <button key={f.v} onClick={() => setRecFilter(f.v)} style={{
            padding:'4px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
            border:`1px solid ${recFilter===f.v?f.c:COLORS.cardBorder}`,
            background:recFilter===f.v?`${f.c}20`:'transparent',
            color:recFilter===f.v?f.c:COLORS.textDim,
          }}>{f.l}</button>
        ))}
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: excludeMa5Down ? '#f59e0b' : COLORS.textDim }}>
          <input type="checkbox" checked={excludeMa5Down} onChange={e => setExcludeMa5Down(e.target.checked)} style={{ accentColor:'#f59e0b' }} />
          MA5 하향 제외
          {candleLoading && <span style={{ color:'#f59e0b', fontSize:9 }}>(계산중)</span>}
          {excludeMa5Down && !candleLoading && (() => {
            const cnt = rawRecs.filter(r => candleFilters[r.code]?.ma5Declining).length;
            return cnt > 0 ? <span style={{ color:'#ef4444', fontWeight:600 }}>(-{cnt})</span> : null;
          })()}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: requireMa5Above ? '#a78bfa' : COLORS.textDim }}>
          <input type="checkbox" checked={requireMa5Above} onChange={e => setRequireMa5Above(e.target.checked)} style={{ accentColor:'#a78bfa' }} />
          MA5{'>'}MA20
          {requireMa5Above && rawRecs.filter(r => r.ma5_above_ma20 === false).length > 0 && (
            <span style={{ color:'#ef4444', fontWeight:600 }}>(-{rawRecs.filter(r => r.ma5_above_ma20 === false).length})</span>
          )}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: excludeGcExpired ? '#ef4444' : COLORS.textDim }}>
          <input type="checkbox" checked={excludeGcExpired} onChange={e => setExcludeGcExpired(e.target.checked)} style={{ accentColor:'#ef4444' }} />
          GC 5일 경과 제외
          {excludeGcExpired && rawRecs.filter(r => r.gc_days >= 5).length > 0 && (
            <span style={{ color:'#ef4444', fontWeight:600 }}>(-{rawRecs.filter(r => r.gc_days >= 5).length})</span>
          )}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: filterHyunmu ? '#4fc3f7' : COLORS.textDim }}>
          <input type="checkbox" checked={filterHyunmu} onChange={e => setFilterHyunmu(e.target.checked)} style={{ accentColor:'#4fc3f7' }} />
          🐢 현무
          {candleLoading && <span style={{ color:'#4fc3f7', fontSize:9 }}>(계산중)</span>}
          {!candleLoading && Object.keys(candleFilters).length > 0 && (
            <span style={{ color:'#4fc3f7', fontWeight:600 }}>({rawRecs.filter(r => candleFilters[r.code]?.hyunmu).length})</span>
          )}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: filterVolumeConfirm ? '#22d3ee' : COLORS.textDim }}>
          <input type="checkbox" checked={filterVolumeConfirm} onChange={e => setFilterVolumeConfirm(e.target.checked)} style={{ accentColor:'#22d3ee' }} />
          📊 거래량 동반
          {candleLoading && <span style={{ color:'#22d3ee', fontSize:9 }}>(계산중)</span>}
          {!candleLoading && Object.keys(candleFilters).length > 0 && (
            <span style={{ color:'#22d3ee', fontWeight:600 }}>({rawRecs.filter(r => candleFilters[r.code]?.volumeConfirm).length})</span>
          )}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: excludeRsiOverbought ? '#f43f5e' : COLORS.textDim }}>
          <input type="checkbox" checked={excludeRsiOverbought} onChange={e => setExcludeRsiOverbought(e.target.checked)} style={{ accentColor:'#f43f5e' }} />
          🌡️ RSI 과매수 제외
          {candleLoading && <span style={{ color:'#f43f5e', fontSize:9 }}>(계산중)</span>}
          {excludeRsiOverbought && !candleLoading && (() => {
            const cnt = rawRecs.filter(r => candleFilters[r.code]?.rsiOverbought).length;
            return cnt > 0 ? <span style={{ color:'#ef4444', fontWeight:600 }}>(-{cnt})</span> : null;
          })()}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: excludeUpperWick ? '#fb923c' : COLORS.textDim }}>
          <input type="checkbox" checked={excludeUpperWick} onChange={e => setExcludeUpperWick(e.target.checked)} style={{ accentColor:'#fb923c' }} />
          📌 윗꼬리 제외
          {candleLoading && <span style={{ color:'#fb923c', fontSize:9 }}>(계산중)</span>}
          {excludeUpperWick && !candleLoading && (() => {
            const cnt = rawRecs.filter(r => candleFilters[r.code]?.upperWickWarning).length;
            return cnt > 0 ? <span style={{ color:'#ef4444', fontWeight:600 }}>(-{cnt})</span> : null;
          })()}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: filterBollingerLow ? '#818cf8' : COLORS.textDim }}>
          <input type="checkbox" checked={filterBollingerLow} onChange={e => setFilterBollingerLow(e.target.checked)} style={{ accentColor:'#818cf8' }} />
          📉 볼린저 하단
          {candleLoading && <span style={{ color:'#818cf8', fontSize:9 }}>(계산중)</span>}
          {!candleLoading && Object.keys(candleFilters).length > 0 && (
            <span style={{ color:'#818cf8', fontWeight:600 }}>({rawRecs.filter(r => candleFilters[r.code]?.bollingerLow).length})</span>
          )}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: filterBullishDays ? '#34d399' : COLORS.textDim }}>
          <input type="checkbox" checked={filterBullishDays} onChange={e => setFilterBullishDays(e.target.checked)} style={{ accentColor:'#34d399' }} />
          🟩 연속 양봉
          {candleLoading && <span style={{ color:'#34d399', fontSize:9 }}>(계산중)</span>}
          {!candleLoading && Object.keys(candleFilters).length > 0 && (
            <span style={{ color:'#34d399', fontWeight:600 }}>({rawRecs.filter(r => candleFilters[r.code]?.bullishDays).length})</span>
          )}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:10, cursor:'pointer', fontSize:11, color: filterMinTradingValue ? '#fbbf24' : COLORS.textDim }}>
          <input type="checkbox" checked={filterMinTradingValue} onChange={e => setFilterMinTradingValue(e.target.checked)} style={{ accentColor:'#fbbf24' }} />
          💰 거래대금 5억+
          {candleLoading && <span style={{ color:'#fbbf24', fontSize:9 }}>(계산중)</span>}
          {!candleLoading && Object.keys(candleFilters).length > 0 && (
            <span style={{ color:'#fbbf24', fontWeight:600 }}>({rawRecs.filter(r => candleFilters[r.code]?.minTradingValue).length})</span>
          )}
        </label>
        <span style={{ fontSize:11, color:COLORS.textDim, marginLeft:12 }}>정렬:</span>
        {[{v:'composite_score',l:'종합점수'},{v:'early_score',l:'⚡조기진입'},{v:'entry_score',l:'진입점수'},{v:'similarity',l:'유사도'}].map(s => {
          const active = recSortKey===s.v;
          return (<button key={s.v} onClick={() => { if(active) setRecSortDir(d=>d==='desc'?'asc':'desc'); else { setRecSortKey(s.v); setRecSortDir('desc'); }}} style={{
            padding:'4px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
            border:`1px solid ${active?COLORS.accent:COLORS.cardBorder}`,
            background:active?COLORS.accentDim:'transparent',
            color:active?COLORS.accent:COLORS.textDim,
          }}>{s.l}{active?(recSortDir==='desc'?' ▼':' ▲'):''}</button>);
        })}
      </div>
    )}

    {/* 선택된 종목 액션 바 */}
    {recs.length > 0 && (
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:12, padding:'10px 16px', borderRadius:10,
        background: selectedRecStocks.size > 0 ? 'rgba(16,185,129,0.08)' : COLORS.card,
        border: `1px solid ${selectedRecStocks.size > 0 ? 'rgba(16,185,129,0.3)' : COLORS.cardBorder}`,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={toggleAll} style={{
            width:22, height:22, borderRadius:4, cursor:'pointer',
            border:`2px solid ${selectedRecStocks.size === recs.length ? COLORS.green : COLORS.cardBorder}`,
            background: selectedRecStocks.size === recs.length ? COLORS.green : 'transparent',
            display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12,
          }}>{selectedRecStocks.size === recs.length ? '✓' : ''}</button>
          <span style={{ fontSize:13, color: selectedRecStocks.size > 0 ? COLORS.green : COLORS.textDim }}>
            {selectedRecStocks.size > 0
              ? `${selectedRecStocks.size}개 종목 선택됨`
              : '종목을 선택하여 가상투자에 등록하세요'}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button
            onClick={handleRegister}
            disabled={selectedRecStocks.size === 0}
            style={{
              padding:'8px 20px', fontSize:13, fontWeight:600, borderRadius:8,
              border:'none', cursor: selectedRecStocks.size > 0 ? 'pointer' : 'default',
              background: selectedRecStocks.size > 0 ? COLORS.green : '#374151',
              color: selectedRecStocks.size > 0 ? COLORS.white : COLORS.textDim,
              transition:'all 0.2s',
            }}
          >💰 가상투자 등록 ({selectedRecStocks.size})</button>
          <button onClick={() => {
            if (selectedRecStocks.size === 0) return;
            const recs2 = result?.recommendations || [];
            const selected2 = recs2.filter(r => selectedRecStocks.has(r.code));
            registerCandidates(selected2, 'pattern_match');
          }} disabled={selectedRecStocks.size === 0}
            style={{ padding:'8px 16px', fontSize:12, fontWeight:600, borderRadius:8, border:'none',
              cursor: selectedRecStocks.size > 0 ? 'pointer' : 'default',
              background: selectedRecStocks.size > 0 ? '#f59e0b' : '#374151',
              color: selectedRecStocks.size > 0 ? '#000' : COLORS.textDim,
            }}>📋 후보등록</button>
          <button onClick={() => onKisOrder('virtual')} disabled={selectedRecStocks.size === 0}
            style={{ padding:'8px 16px', fontSize:12, fontWeight:600, borderRadius:8, border:'none',
              cursor: selectedRecStocks.size > 0 ? 'pointer' : 'default',
              background: selectedRecStocks.size > 0 ? '#1a6fff' : '#374151',
              color: selectedRecStocks.size > 0 ? 'white' : COLORS.textDim,
            }}>🏦 모의투자</button>
          <button onClick={() => onKisOrder('real')} disabled={selectedRecStocks.size === 0}
            style={{ padding:'8px 16px', fontSize:12, fontWeight:600, borderRadius:8, border:'none',
              cursor: selectedRecStocks.size > 0 ? 'pointer' : 'default',
              background: selectedRecStocks.size > 0 ? '#dc2626' : '#374151',
              color: selectedRecStocks.size > 0 ? 'white' : COLORS.textDim,
            }}>🔴 실전투자</button>
        </div>
      </div>
    )}

    {recs.length===0 ? <div style={{textAlign:'center',padding:40,color:COLORS.textDim}}>유사 패턴 종목이 발견되지 않았습니다.<br/><span style={{fontSize:11}}>클러스터가 없거나 DB에 종목이 부족합니다.</span></div> : (
      <div style={{ background:COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 80px 70px 70px 74px 74px 40px', padding:'12px 14px', fontSize:11, color:COLORS.textDim, fontWeight:600, borderBottom:`1px solid ${COLORS.cardBorder}`, background:'#0d1321' }}>
          <span></span><span>종목</span><span style={{textAlign:'right'}}>현재가</span><span style={{textAlign:'center'}}>유사도</span><span style={{textAlign:'center'}}>진입점수</span><span style={{textAlign:'center'}}>종합</span><span style={{textAlign:'center'}}>등급</span><span></span>
        </div>
        {recs.map((rec,i) => {
          const isSelected = selectedRecStocks.has(rec.code);
          const sc = rec.similarity>=65?COLORS.green:rec.similarity>=50?COLORS.yellow:rec.similarity>=40?COLORS.grayLight:COLORS.gray;
          const sb = rec.signal_code==='strong_buy'?COLORS.greenDim:rec.signal_code==='watch'?COLORS.yellowDim:'transparent';
          const gl = gradeLabel(rec.entry_grade);
          const cs = rec.composite_score || 0;
          const csColor = cs >= 75 ? '#10b981' : cs >= 60 ? '#f59e0b' : '#6b7280';
          const es = rec.entry_score || 0;
          const esColor = es >= 70 ? '#10b981' : es >= 50 ? '#f59e0b' : '#6b7280';
          const isChartOpen = recChartCode === rec.code;
          return (<React.Fragment key={rec.code||i}>
          <div
            onClick={() => toggleRec(rec.code)}
            style={{
              display:'grid', gridTemplateColumns:'36px 1fr 80px 70px 70px 74px 74px 40px', padding:'10px 14px', alignItems:'center',
              borderBottom: isChartOpen ? 'none' : `1px solid ${COLORS.cardBorder}`,
              background: isSelected ? 'rgba(16,185,129,0.08)' : i%2===0?'transparent':'rgba(255,255,255,0.02)',
              cursor:'pointer', transition:'background 0.15s',
            }}
            onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background='rgba(59,130,246,0.06)'; }}
            onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background=i%2===0?'transparent':'rgba(255,255,255,0.02)'; }}
          >
            {/* 체크박스 */}
            <div style={{ textAlign:'center' }}>
              <div style={{
                width:20, height:20, borderRadius:4, margin:'0 auto',
                border:`2px solid ${isSelected ? COLORS.green : COLORS.cardBorder}`,
                background: isSelected ? COLORS.green : 'transparent',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all 0.15s',
              }}>
                {isSelected && <span style={{ color:'white', fontSize:12, fontWeight:700 }}>✓</span>}
              </div>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
                {rec.name}
                {rec.early_entry && (
                  <span title={rec.early_reason || '조기진입 가능'} style={{
                    fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4,
                    background:'rgba(249,115,22,0.2)', color:'#f97316', border:'1px solid rgba(249,115,22,0.3)',
                    cursor:'help', whiteSpace:'nowrap',
                  }}>⚡ {Math.round((rec.pattern_progress||1)*100)}%</span>
                )}
                {rec.gc_days >= 0 && (
                  <span title={`MA5>MA20 골든크로스 ${rec.gc_days}일 경과`} style={{
                    fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4,
                    background: rec.gc_days >= 5 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                    color: rec.gc_days >= 5 ? '#ef4444' : '#10b981',
                    border: `1px solid ${rec.gc_days >= 5 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                    cursor:'help', whiteSpace:'nowrap',
                  }}>GC+{rec.gc_days}일</span>
                )}
              </div>
              <div style={{fontSize:11,color:COLORS.textDim}}>
                {rec.code}
                {rec.early_entry && rec.early_reason && (
                  <span style={{marginLeft:6,fontSize:10,color:'#f97316'}}>{rec.early_reason}</span>
                )}
              </div>
            </div>
            <div style={{textAlign:'right',fontSize:13,fontWeight:600}}>{fmt(rec.current_price)}</div>
            <div style={{textAlign:'center'}}><div style={{display:'flex',alignItems:'center',gap:4,justifyContent:'center'}}><div style={{width:40,height:5,background:'#1a2234',borderRadius:3,overflow:'hidden'}}><div style={{width:`${Math.min(rec.similarity,100)}%`,height:'100%',background:sc,borderRadius:3}} /></div><span style={{fontSize:11,fontWeight:700,color:sc}}>{rec.similarity}%</span></div></div>
            <div style={{textAlign:'center',fontSize:12,fontWeight:700,color:esColor}}>{es > 0 ? `${es.toFixed(0)}` : '-'}</div>
            <div style={{textAlign:'center',fontSize:13,fontWeight:700,color:csColor}}>{cs > 0 ? `${cs.toFixed(0)}` : '-'}</div>
            <div style={{textAlign:'center'}}><span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:4,background:gl.bg,color:gl.color,whiteSpace:'nowrap'}}>{gl.text}</span></div>
            {/* ★ 차트 버튼 */}
            <div style={{ textAlign:'center' }}>
              <button onClick={(e) => { e.stopPropagation(); fetchRecChart(rec); }}
                style={{ background: isChartOpen ? 'rgba(79,195,247,0.2)' : 'transparent', border: isChartOpen ? '1px solid rgba(79,195,247,0.4)' : '1px solid rgba(100,140,200,0.15)', borderRadius:6, padding:'3px 6px', cursor:'pointer', fontSize:13, color: isChartOpen ? '#4fc3f7' : COLORS.textDim, transition:'all 0.15s' }}
                title="일봉 차트 보기">📊</button>
            </div>
          </div>
          {/* ★ 차트 확장 영역 */}
          {isChartOpen && (
            <div style={{ padding:'12px 14px 16px', borderBottom:`1px solid ${COLORS.cardBorder}`, background:'rgba(8,15,30,0.6)' }}>
              {recChartLoading ? (
                <div style={{ textAlign:'center', padding:30, color:COLORS.textDim, fontSize:13 }}>📊 차트 데이터 로딩 중...</div>
              ) : recChartCandles.length > 0 ? (
                <ScanStockChart candles={recChartCandles} stock={{ code: rec.code, name: rec.name, latest_surge_date: rec.signal_date || '' }} />
              ) : (
                <div style={{ textAlign:'center', padding:30, color:COLORS.textDim, fontSize:13 }}>차트 데이터가 없습니다.</div>
              )}
            </div>
          )}
          </React.Fragment>);
        })}
      </div>
    )}

    {/* 선택 후 하단 고정 등록 버튼 */}
    {selectedRecStocks.size > 0 && (
      <div style={{
        marginTop:16, padding:14, borderRadius:10,
        background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ fontSize:13, color:COLORS.green }}>
          ✅ <b>{selectedRecStocks.size}개</b> 종목 선택 — 
          {rawRecs.filter(r => selectedRecStocks.has(r.code)).map(r => {
            const g = gradeLabel(r.entry_grade);
            return `${r.name}(${g.text.split(' ')[1]||'보류'})`;
          }).join(', ')}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={handleRegister} style={{
            padding:'10px 24px', fontSize:14, fontWeight:700, borderRadius:8,
            border:'none', cursor:'pointer', background:COLORS.green, color:COLORS.white,
          }}>💰 가상투자 등록 →</button>
          <button onClick={() => onKisOrder('virtual')} style={{
            padding:'10px 18px', fontSize:13, fontWeight:700, borderRadius:8,
            border:'none', cursor:'pointer', background:'#1a6fff', color:'white',
          }}>🏦 모의투자</button>
          <button onClick={() => onKisOrder('real')} style={{
            padding:'10px 18px', fontSize:13, fontWeight:700, borderRadius:8,
            border:'none', cursor:'pointer', background:'#dc2626', color:'white',
          }}>🔴 실전투자</button>
        </div>
      </div>
    )}

    <div style={{ marginTop:16, padding:12, borderRadius:8, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', fontSize:11, color:COLORS.yellow, lineHeight:1.6 }}>⚠️ 패턴 유사도는 과거 데이터 기반 통계이며, 미래 수익을 보장하지 않습니다.</div>

    {/* ★ v6: 추천 종목 과거 패턴 백테스트 결과 */}
    <RecBacktestSection recBacktest={result.rec_backtest_result} />
  </div>);
}

function RecBacktestSection({ recBacktest }) {
  const [showDetail, setShowDetail] = useState(false);
  if (!recBacktest || !recBacktest.stock_results || recBacktest.total_occurrences === 0) return null;

  const { stock_results, strategy_summary, total_occurrences, total_stocks_tested, avg_win_rate } = recBacktest;
  const ranked = Object.entries(strategy_summary || {})
    .filter(([,v]) => v.total_trades > 0)
    .sort((a, b) => (a[1].rank || 99) - (b[1].rank || 99));

  const stratLabels = { smart: '🧠 스마트', aggressive: '🔥 공격', standard: '⚖️ 기본', conservative: '🛡️ 보수', longterm: '🐢 장기' };

  return (
    <div style={{ marginTop:20, background: COLORS.card, border:`1px solid ${COLORS.cardBorder}`, borderRadius:12, overflow:'hidden' }}>
      {/* 헤더 */}
      <div style={{ padding:'14px 18px', borderBottom:`1px solid ${COLORS.cardBorder}`, background:'rgba(139,92,246,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <span style={{ fontSize:14, fontWeight:700, color:'#a78bfa' }}>📊 추천 종목 과거 패턴 백테스트</span>
          <span style={{ fontSize:11, color:COLORS.textDim, marginLeft:10 }}>{total_stocks_tested}개 종목 · {total_occurrences}회 시뮬레이션</span>
        </div>
        <span style={{ fontSize:13, fontWeight:700, color: avg_win_rate >= 55 ? '#10b981' : avg_win_rate >= 45 ? '#f59e0b' : '#ef4444' }}>
          평균 승률 {avg_win_rate}%
        </span>
      </div>

      {/* 전략 비교표 */}
      {ranked.length > 0 && (
        <div style={{ padding:'12px 18px' }}>
          <div style={{ fontSize:12, fontWeight:600, color:COLORS.textDim, marginBottom:8 }}>📋 전략 비교표 / Strategy Comparison</div>
          <div style={{ display:'grid', gridTemplateColumns:'30px 1fr 65px 70px 55px 55px 55px 60px', padding:'8px 10px', fontSize:10, color:COLORS.textDim, fontWeight:600, borderBottom:`1px solid ${COLORS.cardBorder}`, background:'#0d1321' }}>
            <span>#</span><span>전략</span><span style={{textAlign:'right'}}>수익률</span><span style={{textAlign:'right'}}>수익금</span><span style={{textAlign:'center'}}>승률</span><span style={{textAlign:'center'}}>승/패</span><span style={{textAlign:'center'}}>MDD</span><span style={{textAlign:'center'}}>손익비</span>
          </div>
          {ranked.map(([key, s], idx) => {
            const retColor = s.avg_return > 0 ? '#10b981' : s.avg_return < 0 ? '#ef4444' : COLORS.textDim;
            return (
              <div key={key} style={{ display:'grid', gridTemplateColumns:'30px 1fr 65px 70px 55px 55px 55px 60px', padding:'8px 10px', fontSize:12, alignItems:'center', borderBottom:`1px solid ${COLORS.cardBorder}`, background: idx === 0 ? 'rgba(167,139,250,0.06)' : 'transparent' }}>
                <span style={{ fontWeight:700, color: idx === 0 ? '#a78bfa' : COLORS.textDim }}>{idx === 0 ? '🏆' : idx + 1}</span>
                <span style={{ fontWeight:600 }}>{stratLabels[key] || key}</span>
                <span style={{ textAlign:'right', fontWeight:700, color:retColor }}>{s.avg_return > 0 ? '+' : ''}{s.avg_return}%</span>
                <span style={{ textAlign:'right', fontWeight:600, color:retColor }}>{s.total_return > 0 ? '+' : ''}{(s.total_return * 10000).toLocaleString()}원</span>
                <span style={{ textAlign:'center', fontWeight:700, color: s.win_rate >= 55 ? '#10b981' : s.win_rate >= 45 ? '#f59e0b' : '#ef4444' }}>{s.win_rate}%</span>
                <span style={{ textAlign:'center', fontSize:11 }}>{s.wins}승/{s.losses || s.total_trades - s.wins}패</span>
                <span style={{ textAlign:'center', fontSize:11, color:'#ef4444' }}>-{s.mdd}%</span>
                <span style={{ textAlign:'center', fontSize:11, color: s.profit_loss_ratio >= 2 ? '#10b981' : '#f59e0b' }}>{s.profit_loss_ratio}:1</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 종목별 상세 토글 */}
      <div style={{ padding:'10px 18px', borderTop:`1px solid ${COLORS.cardBorder}` }}>
        <button onClick={() => setShowDetail(!showDetail)} style={{
          background:'transparent', border:`1px solid ${COLORS.cardBorder}`, color:COLORS.accent,
          padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer',
        }}>{showDetail ? '▲ 종목별 상세 닫기' : '▼ 종목별 상세 보기'}</button>
      </div>

      {showDetail && (
        <div style={{ padding:'0 18px 14px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 55px 65px 65px 65px', padding:'8px 10px', fontSize:10, color:COLORS.textDim, fontWeight:600, borderBottom:`1px solid ${COLORS.cardBorder}`, background:'#0d1321', borderRadius:'6px 6px 0 0' }}>
            <span>종목</span><span style={{textAlign:'center'}}>유사도</span><span style={{textAlign:'center'}}>발생횟수</span><span style={{textAlign:'center'}}>최적전략</span><span style={{textAlign:'center'}}>승률</span><span style={{textAlign:'center'}}>평균수익</span>
          </div>
          {stock_results.map((sr, idx) => {
            const bestKey = sr.best_strategy;
            const wr = sr.best_win_rate || 0;
            const ar = sr.best_avg_return || 0;
            const wrColor = wr >= 55 ? '#10b981' : wr >= 45 ? '#f59e0b' : '#ef4444';
            const arColor = ar > 0 ? '#10b981' : ar < 0 ? '#ef4444' : COLORS.textDim;
            return (
              <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 60px 55px 65px 65px 65px', padding:'8px 10px', fontSize:12, alignItems:'center', borderBottom:`1px solid ${COLORS.cardBorder}`, background: idx%2===0?'transparent':'rgba(255,255,255,0.02)' }}>
                <div><span style={{fontWeight:600}}>{sr.name}</span><span style={{fontSize:10,color:COLORS.textDim,marginLeft:6}}>{sr.code}</span></div>
                <span style={{textAlign:'center',fontWeight:600,color:COLORS.accent}}>{sr.current_similarity}%</span>
                <span style={{textAlign:'center',fontWeight:700,color: sr.occurrences > 0 ? '#a78bfa' : COLORS.textDim}}>{sr.occurrences}회</span>
                <span style={{textAlign:'center',fontSize:11}}>{sr.occurrences > 0 ? (stratLabels[bestKey] || '-') : '-'}</span>
                <span style={{textAlign:'center',fontWeight:700,color:sr.occurrences > 0 ? wrColor : COLORS.textDim}}>{sr.occurrences > 0 ? `${wr}%` : '-'}</span>
                <span style={{textAlign:'center',fontWeight:700,color:sr.occurrences > 0 ? arColor : COLORS.textDim}}>{sr.occurrences > 0 ? `${ar > 0 ? '+' : ''}${ar}%` : '-'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniReturnChart({ returns, label }) {
  if(!returns||returns.length===0) return null;
  const maxAbs=Math.max(...returns.map(Math.abs),1), W=300, H=60;
  const barW=Math.max(4,(W-20)/returns.length-2);
  return (<div>
    {label && <div style={{fontSize:11,color:COLORS.textDim,marginBottom:4}}>{label}</div>}
    <svg width={W} height={H} style={{display:'block'}}>
      <line x1={0} y1={H/2} x2={W} y2={H/2} stroke={COLORS.cardBorder} strokeWidth={1}/>
      {returns.map((r,i) => { const x=10+i*(barW+2), bH=(Math.abs(r)/maxAbs)*(H/2-4), y=r>=0?H/2-bH:H/2; return <rect key={i} x={x} y={y} width={barW} height={Math.max(bH,1)} fill={r>=0?COLORS.red:COLORS.accent} rx={1} opacity={0.8}/>; })}
      <text x={10} y={H-1} fontSize={8} fill={COLORS.textDim}>D-{returns.length}</text>
      <text x={W-20} y={H-1} fontSize={8} fill={COLORS.textDim}>D-1</text>
    </svg>
  </div>);
}

const OverlayChart = React.memo(function OverlayChart({ patterns, dataKey, yLabel }) {
  if(!patterns||patterns.length===0) return null;
  const W=700, H=220, PAD=40, plotW=W-PAD*2, plotH=H-PAD*2;
  const palette=['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#06b6d4','#84cc16','#e11d48'];
  const allSeries=patterns.map(p=>p[dataKey]||[]);
  const allVals=allSeries.flat(); if(allVals.length===0) return null;
  // ★ Math.min/max 스프레드 대신 reduce 사용 (대량 배열 스택오버플로 방지)
  let minVal=Infinity, maxVal=-Infinity;
  for(let i=0;i<allVals.length;i++){if(allVals[i]<minVal)minVal=allVals[i];if(allVals[i]>maxVal)maxVal=allVals[i];}
  const range=maxVal-minVal||1;
  const toX=(i,len)=>PAD+(i/Math.max(len-1,1))*plotW, toY=v=>PAD+(1-(v-minVal)/range)*plotH;
  return (
    <svg width={W} height={H} style={{display:'block',maxWidth:'100%'}}>
      <rect x={PAD} y={PAD} width={plotW} height={plotH} fill="rgba(13,19,33,0.5)" rx={4}/>
      {[0,0.25,0.5,0.75,1].map((pct,i) => { const y=PAD+pct*plotH, val=maxVal-pct*range; return (<g key={i}><line x1={PAD} y1={y} x2={PAD+plotW} y2={y} stroke={COLORS.cardBorder} strokeDasharray="3,3"/><text x={PAD-4} y={y+4} fontSize={9} fill={COLORS.textDim} textAnchor="end">{val.toFixed(1)}</text></g>); })}
      {dataKey==='returns'&&minVal<0&&maxVal>0 && <line x1={PAD} y1={toY(0)} x2={PAD+plotW} y2={toY(0)} stroke={COLORS.grayLight} strokeWidth={1} opacity={0.5}/>}
      {allSeries.slice(0,12).map((s,si) => { if(s.length<2) return null; const path=s.map((v,i)=>`${i===0?'M':'L'}${toX(i,s.length).toFixed(1)},${toY(v).toFixed(1)}`).join(' '); return <path key={si} d={path} fill="none" stroke={palette[si%palette.length]} strokeWidth={1.5} opacity={0.7}/>; })}
      <text x={12} y={PAD+plotH/2} fontSize={10} fill={COLORS.textDim} textAnchor="middle" transform={`rotate(-90, 12, ${PAD+plotH/2})`}>{yLabel}</text>
      {patterns.slice(0,8).map((p,i) => (<g key={i} transform={`translate(${PAD+8+(i%4)*160}, ${PAD+8+Math.floor(i/4)*14})`}><rect width={10} height={3} fill={palette[i%palette.length]} rx={1}/><text x={14} y={4} fontSize={9} fill={COLORS.textDim}>{p.name}</text></g>))}
    </svg>);
});

const MiniCandleChart = React.memo(function MiniCandleChart({ candles }) {
  if(!candles||candles.length===0) return null;
  const W=300, H=80;
  const allP=candles.flatMap(c=>[c.high,c.low]).filter(p=>p>0); if(allP.length===0) return null;
  // ★ reduce로 대량 배열 안전 처리
  let minP=Infinity, maxP=-Infinity;
  for(let i=0;i<allP.length;i++){if(allP[i]<minP)minP=allP[i];if(allP[i]>maxP)maxP=allP[i];}
  const rP=maxP-minP||1;
  const cw=(W-10)/candles.length, toY=p=>5+(1-(p-minP)/rP)*(H-10);
  return (<svg width={W} height={H} style={{display:'block'}}>
    {candles.map((c,i) => { const x=5+i*cw, isUp=c.close>=c.open, color=isUp?COLORS.red:COLORS.accent; const bT=toY(Math.max(c.open,c.close)), bB=toY(Math.min(c.open,c.close)), bH=Math.max(bB-bT,1); return (<g key={i}><line x1={x+cw/2} y1={toY(c.high)} x2={x+cw/2} y2={toY(c.low)} stroke={color} strokeWidth={0.8}/><rect x={x+1} y={bT} width={Math.max(cw-2,2)} height={bH} fill={color} rx={0.5}/></g>); })}
  </svg>);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 스캔 종목 표준 차트 (TradeCandleChart 동일 스펙)
// 영웅문 색상, MA5/MA20, 거래량, 급상승마커, 현재가선, clipPath
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ScanStockChart({ candles, stock }) {
  if (!candles || candles.length === 0) return null;

  const norm = (d) => d ? d.replace(/-/g, "").replace(/'/g, "").trim() : "";
  const fDate = (d) => { const s = norm(d); return s.length >= 8 ? `${s.slice(4,6)}/${s.slice(6,8)}` : d || "-"; };

  const vis = candles.slice(-90);
  if (vis.length < 5) return null;

  // 급상승일 인덱스
  const surgeDateN = norm(stock.latest_surge_date);
  let surgeIdx = -1;
  if (surgeDateN) surgeIdx = vis.findIndex(c => norm(c.date) === surgeDateN);

  const W = 740, H_CHART = 220, H_VOL = 50, GAP = 16;
  const PAD = { t: 20, b: 32, l: 68, r: 20 };
  const TOTAL_H = PAD.t + H_CHART + GAP + H_VOL + PAD.b;
  const plotW = W - PAD.l - PAD.r;
  const cw = plotW / vis.length;

  const allP = vis.flatMap(c => [c.high, c.low]).filter(p => p > 0);
  const pMin = Math.min(...allP), pMax = Math.max(...allP);
  const pPad = (pMax - pMin) * 0.08 || 100;
  const pLow = pMin - pPad, pHigh = pMax + pPad, pRange = pHigh - pLow || 1;
  const maxVol = Math.max(...vis.map(c => c.volume || 0), 1);

  const toX = (i) => PAD.l + i * cw;
  const toY = (p) => PAD.t + (1 - (p - pLow) / pRange) * H_CHART;
  const volBase = PAD.t + H_CHART + GAP + H_VOL;

  // MA (원본 candles에서 계산)
  const calcMA = (period) => {
    const full = candles.slice(-(90 + period));
    const offset = full.length - vis.length;
    return vis.map((_, i) => {
      const gi = offset + i;
      if (gi < period - 1) return null;
      let sum = 0;
      for (let j = 0; j < period; j++) sum += full[gi - j].close;
      return sum / period;
    });
  };
  const ma5 = calcMA(5);
  const ma20 = calcMA(20);

  const elems = [];

  // 배경
  elems.push(<rect key="bg" x={0} y={0} width={W} height={TOTAL_H} fill="rgba(8,15,30,0.95)" rx={8} />);

  // 클리핑
  elems.push(
    <defs key="clip-defs">
      <clipPath id={`scan-clip-${stock.code}`}>
        <rect x={PAD.l} y={PAD.t} width={plotW} height={H_CHART} />
      </clipPath>
    </defs>
  );

  // 급상승일 하이라이트
  if (surgeIdx >= 0) {
    const sx = toX(surgeIdx);
    elems.push(<rect key="surge-bg" x={sx} y={PAD.t} width={cw} height={H_CHART}
      fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.25)" strokeDasharray="4,3" rx={2} />);
  }

  // 가격 눈금
  for (let i = 0; i <= 5; i++) {
    const p = pLow + pRange * (i / 5);
    const y = toY(p);
    elems.push(<line key={`pg-${i}`} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(50,70,100,0.25)" strokeDasharray="3,3" />);
    elems.push(<text key={`pl-${i}`} x={PAD.l - 8} y={y + 4} fill="#d0d8e8" fontSize={11}
      fontFamily="monospace" textAnchor="end" fontWeight={500}>{Math.round(p).toLocaleString()}</text>);
  }

  // X축 날짜
  const dateStep = Math.max(1, Math.floor(vis.length / 12));
  vis.forEach((c, i) => {
    const isSurge = i === surgeIdx;
    if (i % dateStep === 0 || isSurge) {
      const x = toX(i) + cw / 2;
      elems.push(<text key={`dt-${i}`} x={x} y={TOTAL_H - 6}
        fill={isSurge ? "#FF4444" : "#c0c8d8"} fontSize={isSurge ? 11 : 10}
        fontFamily="monospace" textAnchor="middle" fontWeight={isSurge ? 700 : 400}>{fDate(c.date)}</text>);
    }
  });

  // 거래량 구분
  elems.push(<line key="vol-sep" x1={PAD.l} y1={PAD.t + H_CHART + GAP / 2} x2={W - PAD.r} y2={PAD.t + H_CHART + GAP / 2}
    stroke="rgba(50,70,100,0.3)" />);
  elems.push(<text key="vol-lbl" x={PAD.l - 8} y={volBase - H_VOL + 12} fill="#8899aa" fontSize={9} fontFamily="monospace" textAnchor="end">VOL</text>);

  // 거래량 바
  vis.forEach((c, i) => {
    const x = toX(i);
    const isUp = c.close >= c.open;
    const color = isUp ? "#FF0000" : "#0050FF";
    const barH = Math.max(((c.volume || 0) / maxVol) * H_VOL, 1);
    elems.push(<rect key={`vol-${i}`} x={x + 1} y={volBase - barH}
      width={Math.max(cw - 2, 2)} height={barH} fill={color} opacity={0.75} rx={1} />);
  });

  // 캔들 (영웅문)
  const candleEls = [];
  vis.forEach((c, i) => {
    const x = toX(i);
    const isUp = c.close >= c.open;
    const color = isUp ? "#FF0000" : "#0050FF";
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(bodyBot - bodyTop, 1.5);
    const cx = x + cw / 2;
    candleEls.push(
      <g key={`c-${i}`}>
        <line x1={cx} y1={toY(c.high)} x2={cx} y2={toY(c.low)} stroke={color} strokeWidth={1} />
        <rect x={x + 2} y={bodyTop} width={Math.max(cw - 4, 3)} height={bodyH} fill={color} rx={1} />
      </g>
    );
  });

  // MA5 노랑
  let ma5d = "";
  ma5.forEach((v, i) => { if (v !== null) ma5d += (ma5d ? "L" : "M") + `${toX(i) + cw / 2},${toY(v)} `; });
  if (ma5d) candleEls.push(<path key="ma5" d={ma5d} fill="none" stroke="#ffcc00" strokeWidth={1.5} opacity={0.8} />);

  // MA20 핑크
  let ma20d = "";
  ma20.forEach((v, i) => { if (v !== null) ma20d += (ma20d ? "L" : "M") + `${toX(i) + cw / 2},${toY(v)} `; });
  if (ma20d) candleEls.push(<path key="ma20" d={ma20d} fill="none" stroke="#ff6699" strokeWidth={1.5} opacity={0.7} />);

  // 클리핑 그룹
  elems.push(<g key="clipped-chart" clipPath={`url(#scan-clip-${stock.code})`}>{candleEls}</g>);

  // 현재가 수평선
  const lastPrice = vis[vis.length - 1].close;
  const lastY = toY(lastPrice);
  elems.push(<line key="cur-line" x1={PAD.l} y1={lastY} x2={W - PAD.r} y2={lastY}
    stroke="#ffd54f" strokeWidth={1} strokeDasharray="5,3" opacity={0.5} />);
  elems.push(<rect key="cur-bg" x={W - PAD.r - 72} y={lastY - 10} width={70} height={20}
    fill="rgba(255,213,79,0.2)" rx={3} />);
  elems.push(<text key="cur-txt" x={W - PAD.r - 37} y={lastY + 4} fill="#ffd54f" fontSize={11}
    fontFamily="monospace" textAnchor="middle" fontWeight={600}>{Math.round(lastPrice).toLocaleString()}</text>);

  // 급상승 마커
  if (surgeIdx >= 0 && surgeIdx < vis.length) {
    const sx = toX(surgeIdx) + cw / 2;
    const sy = toY(vis[surgeIdx].high) - 8;
    elems.push(
      <g key="surge-m">
        <line x1={sx} y1={PAD.t} x2={sx} y2={PAD.t + H_CHART} stroke="#FF4444" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
        <polygon points={`${sx},${sy - 14} ${sx - 7},${sy} ${sx + 7},${sy}`} fill="#FF4444" />
        <rect x={sx - 40} y={sy - 28} width={80} height={16} fill="rgba(239,68,68,0.15)" rx={4} />
        <text x={sx} y={sy - 16} fill="#FF4444" fontSize={10} fontFamily="sans-serif" textAnchor="middle" fontWeight={700}>
          급상승 +{stock.latest_rise_pct}%
        </text>
      </g>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          🕯️ {stock.name}
          <span style={{ color: "#778899", fontSize: 11, marginLeft: 6 }}>({stock.code})</span>
          <span style={{ color: "#ffd54f", fontSize: 11, marginLeft: 10 }}>현재가 {Math.round(lastPrice).toLocaleString()}원</span>
          {stock.latest_from_peak != null && (
            <span style={{ color: stock.latest_from_peak < -30 ? "#4fc3f7" : "#8899aa", fontSize: 11, marginLeft: 8 }}>
              고점대비 {stock.latest_from_peak}%
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, flexWrap: "wrap" }}>
          <span><span style={{ color: "#FF0000" }}>■</span> 양봉</span>
          <span><span style={{ color: "#0050FF" }}>■</span> 음봉</span>
          <span style={{ color: "#ffcc00" }}>── MA5</span>
          <span style={{ color: "#ff6699" }}>── MA20</span>
          <span><span style={{ color: "#FF4444" }}>▲</span> 급상승</span>
        </div>
      </div>
      <svg width={W} height={TOTAL_H} style={{ display: "block", maxWidth: "100%" }}>{elems}</svg>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ 패턴 라이브러리 탭
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabPatternLibrary({ patterns, loading, onRefresh, onDelete, onToggleActive, editingId, editingName, setEditingId, setEditingName, onSaveName, onScanWithPattern }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === patterns.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(patterns.map(p => p.id)));
  };
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}개 패턴을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    try {
      for (const id of selectedIds) {
        await fetch(`${API_BASE}/api/pattern/library/${id}`, { method: 'DELETE' });
      }
      setSelectedIds(new Set());
      onRefresh();
    } catch (e) { alert('삭제 실패: ' + e.message); }
    setDeleting(false);
  };

  if (loading) return <div style={{ textAlign:'center', padding:40, color:COLORS.textDim }}>⏳ 패턴 목록 로드 중...</div>;

  return (<div>
    {/* 헤더 바 */}
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:14, fontWeight:700, color:'#8b5cf6' }}>📚 저장된 패턴 라이브러리</div>
        {patterns.length > 0 && (
          <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:COLORS.textDim, cursor:'pointer' }}>
            <input type="checkbox" checked={selectedIds.size === patterns.length && patterns.length > 0}
              onChange={toggleSelectAll} style={{ accentColor:'#8b5cf6', width:13, height:13 }} />
            전체선택
          </label>
        )}
      </div>
      <div style={{ display:'flex', gap:6 }}>
        {selectedIds.size > 0 && (
          <button onClick={handleBulkDelete} disabled={deleting}
            style={{ padding:'4px 12px', fontSize:11, fontWeight:600, borderRadius:6,
              border:'1px solid #ef4444', background:'rgba(239,68,68,0.15)', color:'#ef4444', cursor:'pointer' }}>
            {deleting ? '삭제 중...' : `🗑 선택 삭제 (${selectedIds.size})`}
          </button>
        )}
        <button onClick={onRefresh} style={{ padding:'4px 12px', fontSize:11, fontWeight:600, borderRadius:6,
          border:'1px solid #8b5cf6', background:'rgba(139,92,246,0.12)', color:'#8b5cf6', cursor:'pointer' }}>
          🔄 새로고침
        </button>
      </div>
    </div>

    {patterns.length === 0 ? (
      <div style={{ textAlign:'center', padding:40, color:COLORS.textDim }}>
        <div style={{ fontSize:36, marginBottom:10 }}>📚</div>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>저장된 패턴이 없습니다</div>
        <div style={{ fontSize:11 }}>공통 패턴 탭에서 클러스터를 분석한 후 "💾 패턴 저장" 버튼으로 저장하세요</div>
      </div>
    ) : (
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {/* 테이블 헤더 */}
        <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 80px 50px 50px 48px 48px 48px 48px 60px 90px',
          gap:0, padding:'4px 8px', fontSize:10, color:COLORS.textDim, fontWeight:600, borderBottom:`1px solid ${COLORS.cardBorder}` }}>
          <div></div><div>패턴명</div><div style={{textAlign:'center'}}>등락률</div><div style={{textAlign:'center'}}>상승</div>
          <div style={{textAlign:'center'}}>기간</div><div style={{textAlign:'center'}}>종목</div><div style={{textAlign:'center'}}>유사도</div>
          <div style={{textAlign:'center'}}>매매</div><div style={{textAlign:'center'}}>승률</div><div style={{textAlign:'center'}}>수익</div>
          <div style={{textAlign:'right'}}>액션</div>
        </div>

        {patterns.map((p) => {
          const winRate = p.total_trades > 0 ? ((p.win_trades / p.total_trades) * 100).toFixed(0) : '-';
          const avgProfit = p.total_trades > 0 ? (p.total_profit_pct / p.total_trades).toFixed(1) : '-';
          const isEditing = editingId === p.id;
          const isSelected = selectedIds.has(p.id);

          return (
            <div key={p.id} style={{ display:'grid', gridTemplateColumns:'28px 1fr 80px 50px 50px 48px 48px 48px 48px 60px 90px',
              gap:0, alignItems:'center', padding:'6px 8px',
              background: isSelected ? 'rgba(139,92,246,0.08)' : COLORS.card,
              border:`1px solid ${isSelected ? 'rgba(139,92,246,0.4)' : p.is_active ? 'rgba(139,92,246,0.15)' : COLORS.cardBorder}`,
              borderRadius:8, opacity: p.is_active ? 1 : 0.55, transition:'all 0.15s', fontSize:12 }}>

              {/* 체크박스 */}
              <div><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                style={{ accentColor:'#8b5cf6', width:14, height:14, cursor:'pointer' }} /></div>

              {/* 패턴명 */}
              <div style={{ minWidth:0, paddingRight:6 }}>
                {isEditing ? (
                  <div style={{ display:'flex', gap:4 }}>
                    <input value={editingName} onChange={e => setEditingName(e.target.value)}
                      style={{ flex:1, padding:'2px 6px', fontSize:12, fontWeight:600, background:'#1a2234',
                        border:'1px solid #8b5cf6', borderRadius:4, color:COLORS.text, outline:'none', minWidth:0 }}
                      onKeyDown={e => { if (e.key === 'Enter') onSaveName(p.id); if (e.key === 'Escape') setEditingId(null); }} />
                    <button onClick={() => onSaveName(p.id)} style={{ padding:'2px 6px', fontSize:10, borderRadius:4,
                      border:'1px solid #10b981', background:'rgba(16,185,129,0.12)', color:'#10b981', cursor:'pointer', flexShrink:0 }}>✓</button>
                  </div>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:COLORS.text, overflow:'hidden', textOverflow:'ellipsis',
                      whiteSpace:'nowrap', cursor:'pointer', flex:1, minWidth:0 }}
                      onClick={() => { setEditingId(p.id); setEditingName(p.name); }} title={p.name}>
                      {p.name}
                    </div>
                    {p.description && (
                      <span title={p.description} style={{ fontSize:9, color:COLORS.textDim, flexShrink:0 }}>💬</span>
                    )}
                    <span style={{ fontSize:9, color:COLORS.textDim, flexShrink:0 }}>{p.created_at ? new Date(p.created_at).toLocaleDateString('ko') : ''}</span>
                  </div>
                )}
              </div>

              {/* 미니 등락률 차트 (인라인) */}
              <div style={{ height:20, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {p.avg_return_flow?.length > 0 ? (
                  <svg width={70} height={18} viewBox={`0 0 ${p.avg_return_flow.length} 18`} preserveAspectRatio="none">
                    {p.avg_return_flow.map((v, i) => {
                      const maxAbs = Math.max(...p.avg_return_flow.map(Math.abs), 1);
                      const h = Math.max(1, Math.abs(v) / maxAbs * 8);
                      return <rect key={i} x={i} y={v >= 0 ? 9-h : 9} width={0.8} height={h}
                        fill={v >= 0 ? '#ef4444' : '#3b82f6'} opacity={0.8} />;
                    })}
                  </svg>
                ) : <span style={{ color:COLORS.textDim, fontSize:9 }}>-</span>}
              </div>

              {/* 통계 칼럼들 */}
              <div style={{ textAlign:'center', fontWeight:700, color:COLORS.red, fontSize:11 }}>
                {p.avg_rise_pct ? `+${p.avg_rise_pct.toFixed(1)}%` : '-'}
              </div>
              <div style={{ textAlign:'center', color:COLORS.text, fontSize:11 }}>
                {p.avg_rise_days ? `${p.avg_rise_days.toFixed(0)}일` : '-'}
              </div>
              <div style={{ textAlign:'center', color:COLORS.accent, fontSize:11 }}>
                {p.member_count || 0}
              </div>
              <div style={{ textAlign:'center', color:'#4fc3f7', fontSize:11 }}>
                {p.avg_similarity ? `${p.avg_similarity.toFixed(0)}%` : '-'}
              </div>
              <div style={{ textAlign:'center', color:'#8b5cf6', fontSize:11 }}>
                {p.total_trades || 0}
              </div>
              <div style={{ textAlign:'center', fontWeight:600, fontSize:11,
                color: winRate !== '-' && parseFloat(winRate) >= 50 ? COLORS.green : winRate !== '-' ? COLORS.red : COLORS.textDim }}>
                {winRate !== '-' ? `${winRate}%` : '-'}
              </div>
              <div style={{ textAlign:'center', fontWeight:600, fontSize:11,
                color: avgProfit !== '-' && parseFloat(avgProfit) >= 0 ? COLORS.green : avgProfit !== '-' ? COLORS.red : COLORS.textDim }}>
                {avgProfit !== '-' ? `${avgProfit}%` : '-'}
              </div>

              {/* 액션 버튼 */}
              <div style={{ display:'flex', gap:3, justifyContent:'flex-end' }}>
                <button onClick={() => onToggleActive(p.id, p.is_active)} title={p.is_active ? '비활성화' : '활성화'}
                  style={{ padding:'2px 5px', fontSize:10, borderRadius:4, cursor:'pointer', lineHeight:1,
                    border:`1px solid ${p.is_active ? '#10b981' : '#6b7280'}`,
                    background: p.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                    color: p.is_active ? '#10b981' : '#6b7280' }}>
                  {p.is_active ? '활성' : '비활성'}
                </button>
                <button onClick={() => onScanWithPattern(p.id)} title="스캔"
                  style={{ padding:'2px 5px', fontSize:10, borderRadius:4, cursor:'pointer', lineHeight:1,
                    border:'1px solid #3b82f6', background:'rgba(59,130,246,0.12)', color:'#3b82f6' }}>
                  🔍
                </button>
                <button onClick={() => onDelete(p.id)} title="삭제"
                  style={{ padding:'2px 5px', fontSize:10, borderRadius:4, cursor:'pointer', lineHeight:1,
                    border:'1px solid #ef4444', background:'rgba(239,68,68,0.08)', color:'#ef4444' }}>
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>);
}
