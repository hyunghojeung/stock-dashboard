"""서버 설정"""
import os
import pytz

KST = pytz.timezone("Asia/Seoul")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://auwqsmfuejhrqegfhzxe.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


class Config:
    PORT = int(os.environ.get("PORT", 8000))
    SITE_PASSWORD = os.environ.get("SITE_PASSWORD", "")
    _supabase = None

    @property
    def supabase(self):
        if self._supabase is None and SUPABASE_SERVICE_ROLE_KEY:
            try:
                from supabase import create_client
                self._supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
            except Exception as e:
                print(f"[config] Supabase 연결 실패: {e}")
                return None
        return self._supabase


config = Config()
