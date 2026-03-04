/**
 * DB 백업 관리 페이지 / Database Backup Manager
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 파일경로: src/pages/DatabaseBackup.jsx
 * 배포경로: src/pages/DatabaseBackup.jsx (Vercel)
 *
 * 기능:
 *  - 전체 테이블 목록 + 행 수 조회
 *  - 개별 테이블 CSV 다운로드
 *  - 전체 DB ZIP 백업 다운로드
 *  - 테이블 데이터 미리보기 (10행)
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = "https://web-production-139e9.up.railway.app";

const COLORS = {
  bg: '#0a0f1c', card: '#111827', cardBorder: 'rgba(100,140,200,0.12)',
  accent: '#3b82f6', accentDim: 'rgba(59,130,246,0.1)',
  white: '#f0f4f8', text: '#c0c8d8', textDim: '#667788',
  green: '#00E676', greenDim: 'rgba(0,230,118,0.08)',
  red: '#ff4444', redDim: 'rgba(255,68,68,0.08)',
  yellow: '#ffd54f', yellowDim: 'rgba(255,213,79,0.1)',
  purple: '#8b5cf6', purpleDim: 'rgba(139,92,246,0.08)',
};

const fmt = (n) => n?.toLocaleString() ?? '-';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function DatabaseBackup() {
  const [tables, setTables] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [timestamp, setTimestamp] = useState('');
  const [loading, setLoading] = useState(false);
  const [fullBackupLoading, setFullBackupLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [previewTable, setPreviewTable] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState('');

  // 테이블 목록 조회
  const fetchTables = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/backup/tables`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setTables(data.tables || []);
      setTotalRows(data.total_rows || 0);
      setTimestamp(data.timestamp || '');
      // 기본 전체 선택
      const okTables = (data.tables || []).filter(t => t.status === 'ok' && t.rows > 0);
      setSelected(new Set(okTables.map(t => t.name)));
    } catch (e) {
      setError(`연결 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  // 개별 CSV 다운로드
  const downloadCsv = async (tableName) => {
    setDownloadingCsv(tableName);
    try {
      const res = await fetch(`${API_BASE}/api/backup/csv/${tableName}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || `${tableName}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`다운로드 실패: ${e.message}`);
    } finally {
      setDownloadingCsv('');
    }
  };

  // 전체 ZIP 백업
  const downloadFullBackup = async () => {
    setFullBackupLoading(true);
    setProgress('전체 DB 백업 생성 중... (테이블 수에 따라 1~3분 소요)');
    try {
      const res = await fetch(`${API_BASE}/api/backup/full`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'db_backup.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setProgress(`✅ 백업 완료! (${formatBytes(blob.size)})`);
    } catch (e) {
      setProgress(`❌ 백업 실패: ${e.message}`);
    } finally {
      setFullBackupLoading(false);
    }
  };

  // 데이터 미리보기
  const togglePreview = async (tableName) => {
    if (previewTable === tableName) {
      setPreviewTable(null); setPreviewData(null);
      return;
    }
    setPreviewTable(tableName); setPreviewLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/backup/table/${tableName}?limit=10`);
      const data = await res.json();
      setPreviewData(data);
    } catch (e) {
      setPreviewData({ error: e.message });
    } finally {
      setPreviewLoading(false);
    }
  };

  // 선택 토글
  const toggleSelect = (name) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    const okTables = tables.filter(t => t.status === 'ok' && t.rows > 0);
    setSelected(new Set(okTables.map(t => t.name)));
  };
  const selectNone = () => setSelected(new Set());

  const selectedRows = tables.filter(t => selected.has(t.name)).reduce((s, t) => s + t.rows, 0);

  // 선택 테이블 일괄 CSV 다운로드
  const downloadSelected = async () => {
    const targets = tables.filter(t => selected.has(t.name) && t.status === 'ok' && t.rows > 0);
    if (!targets.length) { alert('다운로드할 테이블을 선택하세요'); return; }

    setFullBackupLoading(true);
    for (let i = 0; i < targets.length; i++) {
      setProgress(`다운로드 중... ${i + 1}/${targets.length} (${targets[i].name})`);
      await downloadCsv(targets[i].name);
      await new Promise(r => setTimeout(r, 500)); // 연속 다운로드 간격
    }
    setProgress(`✅ ${targets.length}개 테이블 다운로드 완료!`);
    setFullBackupLoading(false);
  };

  const statusIcon = (s) => {
    if (s === 'ok') return '✅';
    if (s === 'not_found') return '⬜';
    if (s === 'empty') return '📭';
    return '❌';
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* 헤더 */}
      <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.white, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
        💾 DB 백업 관리
      </h1>
      <p style={{ fontSize: 13, color: COLORS.textDim, marginBottom: 24 }}>
        Supabase 데이터베이스 테이블을 CSV 또는 ZIP으로 백업합니다
      </p>

      {error && (
        <div style={{ background: COLORS.redDim, border: `1px solid rgba(255,68,68,0.3)`, borderRadius: 10, padding: 14, marginBottom: 16, color: COLORS.red, fontSize: 13 }}>
          ❌ {error}
        </div>
      )}

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: '총 테이블', value: tables.filter(t => t.status === 'ok').length, unit: '개', color: COLORS.accent },
          { label: '총 데이터', value: fmt(totalRows), unit: '행', color: COLORS.green },
          { label: '선택됨', value: selected.size, unit: `개 (${fmt(selectedRows)}행)`, color: COLORS.yellow },
          { label: '조회 시간', value: timestamp || '-', unit: '', color: COLORS.textDim, small: true },
        ].map((item, i) => (
          <div key={i} style={{
            background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 12, padding: '16px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: item.small ? 12 : 22, fontWeight: 800, color: item.color, fontFamily: item.small ? 'inherit' : 'JetBrains Mono, monospace' }}>
              {item.value}
            </div>
            {item.unit && <div style={{ fontSize: 10, color: COLORS.textDim }}>{item.unit}</div>}
          </div>
        ))}
      </div>

      {/* 액션 버튼 */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
        background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12, padding: '14px 18px',
      }}>
        <button onClick={fetchTables} disabled={loading}
          style={{ ...btnStyle, background: 'rgba(59,130,246,0.15)', color: COLORS.accent, border: '1px solid rgba(59,130,246,0.3)' }}>
          {loading ? '⏳ 조회 중...' : '🔄 테이블 새로고침'}
        </button>

        <button onClick={downloadFullBackup} disabled={fullBackupLoading}
          style={{ ...btnStyle, background: 'rgba(0,230,118,0.15)', color: COLORS.green, border: '1px solid rgba(0,230,118,0.3)', fontWeight: 700 }}>
          {fullBackupLoading ? '⏳ 백업 중...' : '📦 전체 DB ZIP 백업'}
        </button>

        <button onClick={downloadSelected} disabled={fullBackupLoading || selected.size === 0}
          style={{ ...btnStyle, background: 'rgba(255,213,79,0.12)', color: COLORS.yellow, border: '1px solid rgba(255,213,79,0.3)' }}>
          📥 선택 테이블 CSV ({selected.size}개)
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={selectAll} style={{ ...btnSmall, color: COLORS.accent }}>전체 선택</button>
        <button onClick={selectNone} style={{ ...btnSmall, color: COLORS.textDim }}>선택 해제</button>
      </div>

      {/* 진행 상태 */}
      {progress && (
        <div style={{
          background: progress.includes('✅') ? COLORS.greenDim : progress.includes('❌') ? COLORS.redDim : COLORS.yellowDim,
          border: `1px solid ${progress.includes('✅') ? 'rgba(0,230,118,0.3)' : progress.includes('❌') ? 'rgba(255,68,68,0.3)' : 'rgba(255,213,79,0.3)'}`,
          borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13,
          color: progress.includes('✅') ? COLORS.green : progress.includes('❌') ? COLORS.red : COLORS.yellow,
        }}>
          {progress}
        </div>
      )}

      {/* 테이블 목록 */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 100px 80px 140px',
          padding: '12px 16px', fontSize: 11, color: COLORS.textDim, fontWeight: 600,
          background: '#0d1321', borderBottom: `1px solid ${COLORS.cardBorder}`,
        }}>
          <span></span>
          <span>테이블명</span>
          <span style={{ textAlign: 'right' }}>행 수</span>
          <span style={{ textAlign: 'center' }}>상태</span>
          <span style={{ textAlign: 'center' }}>액션</span>
        </div>

        {loading && !tables.length ? (
          <div style={{ padding: 40, textAlign: 'center', color: COLORS.textDim }}>
            ⏳ 테이블 목록 조회 중...
          </div>
        ) : tables.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: COLORS.textDim }}>
            테이블 정보가 없습니다. 새로고침을 눌러주세요.
          </div>
        ) : (
          tables.map((t, i) => (
            <React.Fragment key={t.name}>
              <div style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 100px 80px 140px',
                padding: '10px 16px', alignItems: 'center',
                borderBottom: `1px solid ${COLORS.cardBorder}`,
                background: previewTable === t.name ? 'rgba(59,130,246,0.06)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              }}>
                {/* 체크박스 */}
                <div style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={selected.has(t.name)}
                    onChange={() => toggleSelect(t.name)}
                    disabled={t.status !== 'ok' || t.rows === 0}
                    style={{ cursor: 'pointer', accentColor: COLORS.accent, width: 16, height: 16 }} />
                </div>

                {/* 테이블명 */}
                <div>
                  <span onClick={() => togglePreview(t.name)}
                    style={{ fontSize: 13, fontWeight: 600, color: COLORS.white, cursor: 'pointer',
                      fontFamily: 'JetBrains Mono, monospace' }}>
                    {previewTable === t.name ? '▼' : '▶'} {t.name}
                  </span>
                </div>

                {/* 행 수 */}
                <div style={{ textAlign: 'right', fontSize: 13, fontFamily: 'JetBrains Mono, monospace',
                  color: t.rows > 0 ? COLORS.green : COLORS.textDim, fontWeight: 600 }}>
                  {fmt(t.rows)}
                </div>

                {/* 상태 */}
                <div style={{ textAlign: 'center', fontSize: 12 }}>
                  {statusIcon(t.status)}
                </div>

                {/* 액션 */}
                <div style={{ textAlign: 'center', display: 'flex', gap: 6, justifyContent: 'center' }}>
                  <button onClick={() => downloadCsv(t.name)}
                    disabled={t.status !== 'ok' || t.rows === 0 || downloadingCsv === t.name}
                    style={{
                      ...btnSmall,
                      color: t.status === 'ok' && t.rows > 0 ? COLORS.accent : '#444',
                      opacity: t.status !== 'ok' || t.rows === 0 ? 0.3 : 1,
                    }}>
                    {downloadingCsv === t.name ? '⏳' : '📥'} CSV
                  </button>
                  <button onClick={() => togglePreview(t.name)}
                    disabled={t.status !== 'ok' || t.rows === 0}
                    style={{
                      ...btnSmall,
                      color: t.status === 'ok' && t.rows > 0 ? COLORS.yellow : '#444',
                      opacity: t.status !== 'ok' || t.rows === 0 ? 0.3 : 1,
                    }}>
                    👁 미리보기
                  </button>
                </div>
              </div>

              {/* 데이터 미리보기 */}
              {previewTable === t.name && (
                <div style={{ padding: '12px 20px', background: 'rgba(0,0,0,0.3)', borderBottom: `1px solid ${COLORS.cardBorder}` }}>
                  {previewLoading ? (
                    <div style={{ color: COLORS.textDim, fontSize: 12 }}>⏳ 데이터 로드 중...</div>
                  ) : previewData?.error ? (
                    <div style={{ color: COLORS.red, fontSize: 12 }}>❌ {previewData.error}</div>
                  ) : previewData?.rows?.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>
                        미리보기 (상위 10행 / 전체 {fmt(previewData.count)}행)
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
                        <thead>
                          <tr>
                            {Object.keys(previewData.rows[0]).map(col => (
                              <th key={col} style={{
                                padding: '6px 10px', textAlign: 'left', color: COLORS.accent,
                                borderBottom: `1px solid ${COLORS.cardBorder}`, whiteSpace: 'nowrap',
                                fontWeight: 600, fontSize: 10,
                              }}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.map((row, ri) => (
                            <tr key={ri} style={{ background: ri % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                              {Object.values(row).map((val, ci) => (
                                <td key={ci} style={{
                                  padding: '5px 10px', color: COLORS.text, whiteSpace: 'nowrap',
                                  borderBottom: `1px solid rgba(100,140,200,0.06)`,
                                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {val === null ? <span style={{ color: '#555' }}>null</span>
                                    : typeof val === 'object' ? JSON.stringify(val).substring(0, 60)
                                    : String(val).substring(0, 80)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ color: COLORS.textDim, fontSize: 12 }}>데이터 없음</div>
                  )}
                </div>
              )}
            </React.Fragment>
          ))
        )}
      </div>

      {/* 하단 안내 */}
      <div style={{ marginTop: 16, fontSize: 11, color: COLORS.textDim, lineHeight: 1.8 }}>
        <div>💡 <strong>ZIP 백업</strong>: 모든 테이블을 CSV로 변환하여 하나의 ZIP 파일로 다운로드</div>
        <div>💡 <strong>CSV 다운로드</strong>: 개별 테이블을 엑셀 호환 CSV(UTF-8 BOM)로 다운로드</div>
        <div>💡 <strong>미리보기</strong>: 테이블 상위 10행을 브라우저에서 확인</div>
        <div>⚠️ 테이블당 최대 50,000행까지 백업됩니다 (대용량 테이블은 분할 필요)</div>
      </div>
    </div>
  );
}

const btnStyle = {
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
};

const btnSmall = {
  padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(100,140,200,0.15)',
  background: 'transparent', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
};
