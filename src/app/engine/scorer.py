"""종목 점수 평가 및 선별 (stub)"""


async def score_and_select(stocks, top_n=30):
    """스캔된 종목에 점수를 매기고 상위 N개를 선별"""
    # TODO: 실제 구현
    return stocks[:top_n] if stocks else []
