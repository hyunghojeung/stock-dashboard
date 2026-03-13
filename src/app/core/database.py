"""Supabase 데이터베이스 클라이언트 (lazy 로딩)"""
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://auwqsmfuejhrqegfhzxe.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_db = None

def _get_db():
    global _db
    if _db is None and SUPABASE_SERVICE_ROLE_KEY:
        from supabase import create_client
        _db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _db

class _LazyDB:
    """속성 접근 시 실제 supabase 클라이언트로 위임"""
    def __getattr__(self, name):
        client = _get_db()
        if client is None:
            raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY 미설정")
        return getattr(client, name)

db = _LazyDB()
