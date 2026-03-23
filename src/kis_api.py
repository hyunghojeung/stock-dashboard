"""
KIS (한국투자증권) Open API 클라이언트
- 모의투자 서버 기본 설정
- 인증, 주문, 잔고, 시세, 순위, 재무제표
"""
import os
import time
import json
import asyncio
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import httpx

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 설정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 모의투자 서버
VIRT_BASE = "https://openapivts.koreainvestment.com:29443"
# 실전 서버
REAL_BASE = "https://openapi.koreainvestment.com:9443"
# WebSocket
WS_VIRT = "ws://ops.koreainvestment.com:31000"
WS_REAL = "ws://ops.koreainvestment.com:21000"


class KISClient:
    """KIS Open API 통합 클라이언트"""

    def __init__(
        self,
        app_key: str = "",
        app_secret: str = "",
        account_no: str = "",
        is_virtual: bool = True,
    ):
        self.app_key = app_key or os.getenv("KIS_APP_KEY", "")
        self.app_secret = app_secret or os.getenv("KIS_APP_SECRET", "")
        # 계좌번호: 하이픈 제거하여 순수 숫자 10자리로 정규화
        raw_account = account_no or os.getenv("KIS_ACCOUNT_NO", "")
        self.account_no = raw_account.replace("-", "")
        self.is_virtual = is_virtual
        self.base_url = VIRT_BASE if is_virtual else REAL_BASE

        # 토큰 관리
        self._access_token: Optional[str] = None
        self._token_expires: Optional[datetime] = None
        self._websocket_key: Optional[str] = None

        # 계좌번호 분리 (8자리 + 2자리)
        self.cano = self.account_no[:8] if len(self.account_no) >= 10 else ""
        self.acnt_prdt_cd = self.account_no[8:10] if len(self.account_no) >= 10 else ""

    @property
    def is_configured(self) -> bool:
        return bool(self.app_key and self.app_secret and self.account_no)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 인증
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def get_access_token(self) -> str:
        """접근 토큰 발급 (캐시 활용)"""
        if self._access_token and self._token_expires and datetime.now() < self._token_expires:
            return self._access_token

        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.post(
                f"{self.base_url}/oauth2/tokenP",
                json={
                    "grant_type": "client_credentials",
                    "appkey": self.app_key,
                    "appsecret": self.app_secret,
                },
            )
            data = resp.json()

        if "access_token" not in data:
            raise Exception(f"토큰 발급 실패: {data.get('msg1', data)}")

        self._access_token = data["access_token"]
        # 토큰 유효기간: 보통 24시간, 안전하게 23시간으로 설정
        self._token_expires = datetime.now() + timedelta(hours=23)
        return self._access_token

    async def get_websocket_key(self) -> str:
        """WebSocket 접속키 발급"""
        if self._websocket_key:
            return self._websocket_key

        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.post(
                f"{self.base_url}/oauth2/Approval",
                json={
                    "grant_type": "client_credentials",
                    "appkey": self.app_key,
                    "secretkey": self.app_secret,
                },
            )
            data = resp.json()

        self._websocket_key = data.get("approval_key", "")
        return self._websocket_key

    async def _headers(self, tr_id: str, extra: dict = None) -> dict:
        """공통 요청 헤더"""
        token = await self.get_access_token()
        h = {
            "Content-Type": "application/json; charset=utf-8",
            "authorization": f"Bearer {token}",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
            "tr_id": tr_id,
        }
        if extra:
            h.update(extra)
        return h

    async def _get(self, path: str, tr_id: str, params: dict = None, use_real: bool = False) -> dict:
        """GET 요청 (use_real=True면 모의투자여도 실전서버로 시세 조회)"""
        headers = await self._headers(tr_id)
        base = REAL_BASE if use_real else self.base_url
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            resp = await client.get(f"{base}{path}", headers=headers, params=params or {})
            return resp.json()

    async def _post(self, path: str, tr_id: str, body: dict = None) -> dict:
        """POST 요청"""
        headers = await self._headers(tr_id)
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            resp = await client.post(f"{self.base_url}{path}", headers=headers, json=body or {})
            return resp.json()

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 1단계: 모의투자 매매
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def order_buy(self, stock_code: str, qty: int, price: int = 0, order_type: str = "00") -> dict:
        """매수 주문
        order_type: 00=지정가, 01=시장가
        """
        tr_id = "VTTC0802U" if self.is_virtual else "TTTC0802U"
        body = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "PDNO": stock_code,
            "ORD_DVSN": order_type,
            "ORD_QTY": str(qty),
            "ORD_UNPR": str(price) if order_type == "00" else "0",
        }
        return await self._post("/uapi/domestic-stock/v1/trading/order-cash", tr_id, body)

    async def order_sell(self, stock_code: str, qty: int, price: int = 0, order_type: str = "00") -> dict:
        """매도 주문"""
        tr_id = "VTTC0801U" if self.is_virtual else "TTTC0801U"
        body = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "PDNO": stock_code,
            "ORD_DVSN": order_type,
            "ORD_QTY": str(qty),
            "ORD_UNPR": str(price) if order_type == "00" else "0",
        }
        return await self._post("/uapi/domestic-stock/v1/trading/order-cash", tr_id, body)

    async def order_cancel(self, org_order_no: str, stock_code: str, qty: int, price: int = 0) -> dict:
        """주문 취소"""
        tr_id = "VTTC0803U" if self.is_virtual else "TTTC0803U"
        body = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "KRX_FWDG_ORD_ORGNO": "",
            "ORGN_ODNO": org_order_no,
            "ORD_DVSN": "00",
            "RVSE_CNCL_DVSN_CD": "02",  # 02=취소
            "ORD_QTY": str(qty),
            "ORD_UNPR": str(price),
            "QTY_ALL_ORD_YN": "Y",
        }
        return await self._post("/uapi/domestic-stock/v1/trading/order-rvsecncl", tr_id, body)

    async def order_modify(self, org_order_no: str, stock_code: str, qty: int, price: int) -> dict:
        """주문 정정"""
        tr_id = "VTTC0803U" if self.is_virtual else "TTTC0803U"
        body = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "KRX_FWDG_ORD_ORGNO": "",
            "ORGN_ODNO": org_order_no,
            "ORD_DVSN": "00",
            "RVSE_CNCL_DVSN_CD": "01",  # 01=정정
            "ORD_QTY": str(qty),
            "ORD_UNPR": str(price),
            "QTY_ALL_ORD_YN": "N",
        }
        return await self._post("/uapi/domestic-stock/v1/trading/order-rvsecncl", tr_id, body)

    async def get_balance(self) -> dict:
        """잔고 조회"""
        tr_id = "VTTC8434R" if self.is_virtual else "TTTC8434R"
        params = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "AFHR_FLPR_YN": "N",
            "OFL_YN": "",
            "INQR_DVSN": "02",
            "UNPR_DVSN": "01",
            "FUND_STTL_ICLD_YN": "N",
            "FNCG_AMT_AUTO_RDPT_YN": "N",
            "PRCS_DVSN": "00",
            "CTX_AREA_FK100": "",
            "CTX_AREA_NK100": "",
        }
        return await self._get("/uapi/domestic-stock/v1/trading/inquire-balance", tr_id, params)

    async def get_order_history(self, start_date: str = "", end_date: str = "") -> dict:
        """체결내역 조회"""
        if not start_date:
            start_date = datetime.now().strftime("%Y%m%d")
        if not end_date:
            end_date = start_date

        tr_id = "VTTC8001R" if self.is_virtual else "TTTC8001R"
        params = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "INQR_STRT_DT": start_date,
            "INQR_END_DT": end_date,
            "SLL_BUY_DVSN_CD": "00",  # 00=전체
            "INQR_DVSN": "00",
            "PDNO": "",
            "CCLD_DVSN": "00",
            "ORD_GNO_BRNO": "",
            "ODNO": "",
            "INQR_DVSN_3": "00",
            "INQR_DVSN_1": "",
            "CTX_AREA_FK100": "",
            "CTX_AREA_NK100": "",
        }
        return await self._get("/uapi/domestic-stock/v1/trading/inquire-daily-ccld", tr_id, params)

    async def get_pending_orders(self) -> dict:
        """미체결 주문 조회"""
        tr_id = "VTTC8001R" if self.is_virtual else "TTTC8001R"
        params = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "INQR_STRT_DT": datetime.now().strftime("%Y%m%d"),
            "INQR_END_DT": datetime.now().strftime("%Y%m%d"),
            "SLL_BUY_DVSN_CD": "00",
            "INQR_DVSN": "00",
            "PDNO": "",
            "CCLD_DVSN": "01",  # 01=미체결
            "ORD_GNO_BRNO": "",
            "ODNO": "",
            "INQR_DVSN_3": "00",
            "INQR_DVSN_1": "",
            "CTX_AREA_FK100": "",
            "CTX_AREA_NK100": "",
        }
        return await self._get("/uapi/domestic-stock/v1/trading/inquire-daily-ccld", tr_id, params)

    async def get_buyable_amount(self, stock_code: str, price: int) -> dict:
        """매수가능금액 조회"""
        tr_id = "VTTC8908R" if self.is_virtual else "TTTC8908R"
        params = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "PDNO": stock_code,
            "ORD_UNPR": str(price),
            "ORD_DVSN": "00",
            "CMA_EVLU_AMT_ICLD_YN": "Y",
            "OVRS_ICLD_YN": "Y",
        }
        return await self._get("/uapi/domestic-stock/v1/trading/inquire-psbl-order", tr_id, params)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 2단계: 시세 데이터
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def get_current_price(self, stock_code: str) -> dict:
        """현재가 조회"""
        tr_id = "FHKST01010100"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/inquire-price", tr_id, params)

    async def get_daily_chart(self, stock_code: str, period: str = "D", start_date: str = "", end_date: str = "") -> dict:
        """일/주/월 차트 (기간별 시세)
        period: D=일, W=주, M=월, Y=년
        """
        if not end_date:
            end_date = datetime.now().strftime("%Y%m%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")

        tr_id = "FHKST03010100"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
            "FID_INPUT_DATE_1": start_date,
            "FID_INPUT_DATE_2": end_date,
            "FID_PERIOD_DIV_CODE": period,
            "FID_ORG_ADJ_PRC": "0",
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice", tr_id, params)

    async def get_minute_chart(self, stock_code: str, time_unit: str = "30") -> dict:
        """분봉 차트
        time_unit: 1, 3, 5, 10, 15, 30, 60
        """
        tr_id = "FHKST03010200"
        params = {
            "FID_ETC_CLS_CODE": "",
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
            "FID_INPUT_HOUR_1": datetime.now().strftime("%H%M%S"),
            "FID_PW_DATA_INCU_YN": "Y",
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice", tr_id, params)

    async def get_asking_price(self, stock_code: str) -> dict:
        """호가 조회"""
        tr_id = "FHKST01010200"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn", tr_id, params)

    async def get_investor(self, stock_code: str) -> dict:
        """투자자별 매매동향"""
        tr_id = "FHKST01010900"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/inquire-investor", tr_id, params)

    async def get_multi_price(self, stock_codes: list) -> dict:
        """멀티종목 시세 일괄조회 (최대 20종목)"""
        tr_id = "FHKST11300000"
        codes = stock_codes[:20]
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": ",".join(codes),
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/intstock-multprice", tr_id, params)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 3단계: 시장 분석
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def get_volume_rank(self, market: str = "J") -> dict:
        """거래량 순위
        market: J=전체, 0=코스피, 1=코스닥
        """
        tr_id = "FHPST01710000"
        params = {
            "FID_COND_MRKT_DIV_CODE": market,
            "FID_COND_SCR_DIV_CODE": "20171",
            "FID_INPUT_ISCD": "0000",
            "FID_DIV_CLS_CODE": "0",
            "FID_BLNG_CLS_CODE": "0",
            "FID_TRGT_CLS_CODE": "111111111",
            "FID_TRGT_EXLS_CLS_CODE": "000000",
            "FID_INPUT_PRICE_1": "",
            "FID_INPUT_PRICE_2": "",
            "FID_VOL_CNT": "",
            "FID_INPUT_DATE_1": "",
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/volume-rank", tr_id, params, use_real=True)

    async def get_fluctuation_rank(self, market: str = "J", sort: str = "0") -> dict:
        """등락률 순위
        sort: 0=상승, 1=하락
        """
        tr_id = "FHPST01740000"
        params = {
            "FID_COND_MRKT_DIV_CODE": market,
            "FID_COND_SCR_DIV_CODE": "20174",
            "FID_INPUT_ISCD": "0000",
            "FID_RANK_SORT_CLS_CODE": sort,
            "FID_INPUT_CNT_1": "0",
            "FID_PRC_CLS_CODE": "0",
            "FID_INPUT_PRICE_1": "",
            "FID_INPUT_PRICE_2": "",
            "FID_VOL_CNT": "",
            "FID_TRGT_CLS_CODE": "0",
            "FID_TRGT_EXLS_CLS_CODE": "0",
            "FID_DIV_CLS_CODE": "0",
            "FID_RSFL_RATE1": "",
            "FID_RSFL_RATE2": "",
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/fluctuation", tr_id, params, use_real=True)

    async def get_foreign_institution(self, stock_code: str) -> dict:
        """외인/기관 매매 집계"""
        tr_id = "FHKST01010800"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/inquire-daily-trade", tr_id, params, use_real=True)

    async def get_market_index(self, index_code: str = "0001") -> dict:
        """시장 지수 (0001=코스피, 1001=코스닥)"""
        tr_id = "FHPUP02100000"
        params = {
            "FID_COND_MRKT_DIV_CODE": "U",
            "FID_INPUT_ISCD": index_code,
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/inquire-index-price", tr_id, params, use_real=True)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 재무제표
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def get_financial_ratio(self, stock_code: str) -> dict:
        """재무비율 (PER/PBR/ROE 등)"""
        tr_id = "FHKST66430300"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
        }
        return await self._get("/uapi/domestic-stock/v1/finance/financial-ratio", tr_id, params)

    async def get_income_statement(self, stock_code: str) -> dict:
        """손익계산서"""
        tr_id = "FHKST66430200"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
        }
        return await self._get("/uapi/domestic-stock/v1/finance/income-statement", tr_id, params)

    async def get_balance_sheet(self, stock_code: str) -> dict:
        """대차대조표"""
        tr_id = "FHKST66430100"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
        }
        return await self._get("/uapi/domestic-stock/v1/finance/balance-sheet", tr_id, params)

    async def get_growth_ratio(self, stock_code: str) -> dict:
        """성장성비율"""
        tr_id = "FHKST66430800"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
        }
        return await self._get("/uapi/domestic-stock/v1/finance/growth-ratio", tr_id, params)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 조건검색
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def get_search_titles(self) -> dict:
        """조건검색 목록 조회"""
        tr_id = "HHKST03900300"
        params = {
            "user_id": "",
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/psearch-title", tr_id, params)

    async def get_search_result(self, seq: str) -> dict:
        """조건검색 결과 조회"""
        tr_id = "HHKST03900400"
        params = {
            "user_id": "",
            "seq": seq,
        }
        return await self._get("/uapi/domestic-stock/v1/quotations/psearch-result", tr_id, params)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 싱글턴 인스턴스
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_kis_client: Optional[KISClient] = None


def get_kis_client() -> KISClient:
    """KIS 클라이언트 싱글턴 반환"""
    global _kis_client
    if _kis_client is None:
        _kis_client = KISClient()
    return _kis_client


def reset_kis_client(app_key: str, app_secret: str, account_no: str, is_virtual: bool = True) -> KISClient:
    """KIS 클라이언트 재설정"""
    global _kis_client
    _kis_client = KISClient(app_key, app_secret, account_no, is_virtual)
    return _kis_client
