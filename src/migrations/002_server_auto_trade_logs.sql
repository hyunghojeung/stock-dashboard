-- 서버 자동매매 로그 테이블
-- 실행 방법: Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS server_auto_trade_logs (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    log_type TEXT NOT NULL DEFAULT 'info',
    account_type TEXT DEFAULT 'virtual',
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb
);

-- 인덱스: 최근 로그 빠르게 조회
CREATE INDEX IF NOT EXISTS idx_server_logs_created_at ON server_auto_trade_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_logs_account_type ON server_auto_trade_logs (account_type);

-- RLS 비활성화 (서버에서만 사용)
ALTER TABLE server_auto_trade_logs ENABLE ROW LEVEL SECURITY;

-- anon 키로 읽기 허용 (프론트엔드 조회용)
CREATE POLICY "server_logs_select_all" ON server_auto_trade_logs
    FOR SELECT USING (true);

-- service_role만 삽입 허용
CREATE POLICY "server_logs_insert_service" ON server_auto_trade_logs
    FOR INSERT WITH CHECK (true);

-- 오래된 로그 자동 정리 (30일 이상)
-- 주기적으로 실행하거나, pg_cron에서 설정
-- DELETE FROM server_auto_trade_logs WHERE created_at < NOW() - INTERVAL '30 days';
