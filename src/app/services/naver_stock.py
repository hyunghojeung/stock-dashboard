"""네이버 주식 데이터 조회"""
import requests
from typing import List, Dict, Tuple, Optional


def get_daily_candles_with_name(
    code: str, count: int = 365
) -> Tuple[List[Dict], Optional[str]]:
    """
    네이버 금융에서 일봉 데이터 + 종목명 조회
    Returns: (candles_list, stock_name)
    """
    candles = []
    name = None
    try:
        # 네이버 차트 API
        url = f"https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count={count}&requestType=0"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()

        # XML 파싱
        import xml.etree.ElementTree as ET
        root = ET.fromstring(resp.text)
        for item in root.iter("item"):
            data = item.get("data", "").split("|")
            if len(data) >= 6:
                try:
                    candles.append({
                        "date": data[0],
                        "open": int(data[1]),
                        "high": int(data[2]),
                        "low": int(data[3]),
                        "close": int(data[4]),
                        "volume": int(data[5]),
                    })
                except (ValueError, IndexError):
                    continue

        # 종목명 조회
        try:
            name_url = f"https://m.stock.naver.com/api/stock/{code}/basic"
            name_resp = requests.get(name_url, headers=headers, timeout=5)
            if name_resp.ok:
                name_data = name_resp.json()
                name = name_data.get("stockName", None)
        except Exception:
            pass

    except Exception as e:
        print(f"[naver_stock] {code} 일봉 조회 실패: {e}")

    return candles, name
