"""스케줄러 초기화 (lifespan에서 호출)"""


def setup_scheduler():
    """기본 스케줄러 설정 — 실제 스케줄은 main.py lifespan에서 등록"""
    print("[스케줄러] 초기화 완료")
