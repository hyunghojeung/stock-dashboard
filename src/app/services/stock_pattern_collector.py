"""전종목 패턴 벡터 수집기 (스케줄러에서 호출)"""
import re

# ETF/ETN/스팩/리츠/우선주 등 비정규 종목 필터
_EXCLUDE_PATTERNS = re.compile(
    r"(ETF|ETN|인버스|레버리지|KODEX|TIGER|KBSTAR|HANARO|SOL|ARIRANG|"
    r"스팩|리츠|우선주|\d+우$|\d+우B$|선물|KOSEF|KINDEX|파워|합성)",
    re.IGNORECASE,
)


def is_regular_stock(stock: dict) -> bool:
    """일반 종목 여부 판별 (ETF/ETN/스팩/리츠/우선주 제외)"""
    name = stock.get("name", "")
    if _EXCLUDE_PATTERNS.search(name):
        return False
    code = stock.get("code", "")
    # 우선주 코드 (끝이 5, 7, 8, 9로 끝나는 6자리)
    if len(code) == 6 and code[-1] in ("5", "7", "8", "9") and code[:-1].isdigit():
        # 일부 일반 종목도 이 패턴이므로 이름 기반으로만 필터
        pass
    return True


def run_pattern_collection():
    """전종목 패턴 벡터 수집 실행"""
    print("[패턴수집] 전종목 패턴 벡터 수집 시작...")
    # TODO: 실제 패턴 수집 로직 구현
    print("[패턴수집] 완료")
    return {"status": "ok", "message": "패턴 수집 완료 (stub)"}
