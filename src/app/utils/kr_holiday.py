"""한국 주식시장 휴장일 및 시장 상태 판단"""
from datetime import datetime, date, timedelta
import pytz

KST = pytz.timezone("Asia/Seoul")

# 2026년 한국 공휴일 (필요시 매년 업데이트)
KR_HOLIDAYS_2026 = {
    date(2026, 1, 1): "신정",
    date(2026, 1, 16): "설날 연휴",
    date(2026, 1, 17): "설날",
    date(2026, 1, 18): "설날 연휴",
    date(2026, 1, 19): "대체공휴일(설날)",
    date(2026, 3, 1): "삼일절",
    date(2026, 5, 5): "어린이날",
    date(2026, 5, 24): "부처님오신날",
    date(2026, 6, 6): "현충일",
    date(2026, 8, 15): "광복절",
    date(2026, 9, 24): "추석 연휴",
    date(2026, 9, 25): "추석",
    date(2026, 9, 26): "추석 연휴",
    date(2026, 10, 3): "개천절",
    date(2026, 10, 9): "한글날",
    date(2026, 12, 25): "크리스마스",
}

# 2025년 공휴일도 포함
KR_HOLIDAYS_2025 = {
    date(2025, 1, 1): "신정",
    date(2025, 1, 28): "설날 연휴",
    date(2025, 1, 29): "설날",
    date(2025, 1, 30): "설날 연휴",
    date(2025, 3, 1): "삼일절",
    date(2025, 5, 5): "어린이날",
    date(2025, 5, 6): "대체공휴일(어린이날)",
    date(2025, 5, 15): "부처님오신날",
    date(2025, 6, 6): "현충일",
    date(2025, 8, 15): "광복절",
    date(2025, 10, 3): "개천절",
    date(2025, 10, 5): "추석 연휴",
    date(2025, 10, 6): "추석",
    date(2025, 10, 7): "추석 연휴",
    date(2025, 10, 8): "대체공휴일(추석)",
    date(2025, 10, 9): "한글날",
    date(2025, 12, 25): "크리스마스",
}

ALL_HOLIDAYS = {**KR_HOLIDAYS_2025, **KR_HOLIDAYS_2026}


def get_holiday_name(d: date) -> str | None:
    """해당 날짜의 공휴일 이름 반환, 공휴일 아니면 None"""
    return ALL_HOLIDAYS.get(d)


def is_holiday(d: date) -> bool:
    return d in ALL_HOLIDAYS


def is_weekend(d: date) -> bool:
    return d.weekday() >= 5  # 토(5), 일(6)


def is_market_day(d: date) -> bool:
    """해당 날짜가 장 열리는 날인지"""
    return not is_weekend(d) and not is_holiday(d)


def is_market_open_now(now: datetime = None) -> bool:
    """현재 시각 기준 장 열려있는지 (09:00~15:30)"""
    if now is None:
        now = datetime.now(KST)
    if now.tzinfo is None:
        now = KST.localize(now)

    d = now.date()
    if not is_market_day(d):
        return False

    t = now.time()
    from datetime import time
    return time(9, 0) <= t <= time(15, 30)


def get_market_status(now: datetime = None) -> str:
    """시장 상태 문자열 반환"""
    if now is None:
        now = datetime.now(KST)
    if now.tzinfo is None:
        now = KST.localize(now)

    d = now.date()
    holiday = get_holiday_name(d)

    if holiday:
        return f"휴장 ({holiday})"
    if is_weekend(d):
        return "휴장 (주말)"

    from datetime import time
    t = now.time()
    if t < time(9, 0):
        return "장 시작 전"
    elif t <= time(15, 30):
        return "장중"
    else:
        return "장 마감"


def get_next_market_day(d: date) -> date:
    """다음 장 열리는 날짜"""
    next_d = d + timedelta(days=1)
    while not is_market_day(next_d):
        next_d += timedelta(days=1)
    return next_d
