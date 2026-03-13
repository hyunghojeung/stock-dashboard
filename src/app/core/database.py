"""Supabase 데이터베이스 클라이언트"""
import os
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://auwqsmfuejhrqegfhzxe.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.")

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
