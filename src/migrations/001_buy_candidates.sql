-- 매수 후보 파이프라인 테이블
-- 실행 방법: Supabase Dashboard > SQL Editor에서 실행

-- 1. 매수 후보 풀
CREATE TABLE IF NOT EXISTS buy_candidates (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  composite_score FLOAT DEFAULT 0,
  manip_score FLOAT DEFAULT 0,
  entry_score FLOAT DEFAULT 0,
  pattern_match_pct FLOAT,
  entry_grade TEXT,
  current_price INT,
  recommended_buy_price INT,
  source TEXT DEFAULT 'manual',
  scan_session_id INT,
  pattern_name TEXT,
  reason TEXT,
  status TEXT DEFAULT 'active',
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  filters_applied JSONB
);

-- 2. 자동화 설정
CREATE TABLE IF NOT EXISTS candidate_settings (
  id SERIAL PRIMARY KEY,
  auto_register BOOLEAN DEFAULT false,
  min_composite_score FLOAT DEFAULT 60,
  min_entry_score FLOAT DEFAULT 50,
  required_entry_grades TEXT[] DEFAULT '{auto_buy}',
  max_candidates INT DEFAULT 10,
  expire_days INT DEFAULT 3,
  auto_buy_virtual BOOLEAN DEFAULT false,
  auto_buy_kis BOOLEAN DEFAULT false,
  capital_per_stock INT DEFAULT 300000,
  exclude_ma5_down BOOLEAN DEFAULT true,
  exclude_rsi_overbought BOOLEAN DEFAULT true,
  min_trading_value BIGINT DEFAULT 500000000,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 기본 설정 레코드
INSERT INTO candidate_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_buy_candidates_status ON buy_candidates(status);
CREATE INDEX IF NOT EXISTS idx_buy_candidates_code ON buy_candidates(code);
CREATE INDEX IF NOT EXISTS idx_buy_candidates_score ON buy_candidates(composite_score DESC);

-- RLS 비활성화 (서비스키 사용)
ALTER TABLE buy_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_settings ENABLE ROW LEVEL SECURITY;

-- 서비스 키에 대한 풀 접근 정책
CREATE POLICY IF NOT EXISTS "service_full_access_candidates" ON buy_candidates FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_full_access_settings" ON candidate_settings FOR ALL USING (true);
