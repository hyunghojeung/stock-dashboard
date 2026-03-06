/**
 * Vercel Serverless Function: KIS Open API Proxy
 * Handles all /api/kis/* routes
 *
 * Frontend sends credentials via headers:
 *   x-kis-appkey, x-kis-appsecret, x-kis-account, x-kis-virtual, x-kis-token
 */

const VIRT_BASE = "https://openapivts.koreainvestment.com:29443";
const REAL_BASE = "https://openapi.koreainvestment.com:9443";

// ── Helpers ──────────────────────────────────────────

async function kisGet(baseUrl, path, trId, params, token, appKey, appSecret) {
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const resp = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: trId,
    },
  });
  return resp.json();
}

async function kisPost(baseUrl, path, trId, body, token, appKey, appSecret) {
  const resp = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: trId,
    },
    body: JSON.stringify(body),
  });
  return resp.json();
}

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function safeInt(v, def = 0) {
  const n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}
function safeFloat(v, def = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? def : n;
}

// ── Main Handler ─────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,x-kis-appkey,x-kis-appsecret,x-kis-account,x-kis-virtual,x-kis-token"
  );
  if (req.method === "OPTIONS") return res.status(200).end();

  // Parse route and query params from URL directly (req.query unreliable for catch-all)
  const fullUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const qp = Object.fromEntries(fullUrl.searchParams);

  // Route: prefer _route query param, fall back to URL path segments
  const urlPath = fullUrl.pathname.replace(/^\/api\/kis\/?/, "");
  const pathSegments = urlPath.split("/").filter(Boolean);
  const routeName = qp._route || pathSegments[0] || "";
  const routeSub = pathSegments[1] || "";

  // Read credentials from query params (primary) or headers (fallback)
  const appKey = qp._ak || req.headers["x-kis-appkey"] || "";
  const appSecret = qp._as || req.headers["x-kis-appsecret"] || "";
  const accountNo = (qp._acct || req.headers["x-kis-account"] || "").replace(/-/g, "");
  const isVirtual = (qp._virt || req.headers["x-kis-virtual"] || "true") !== "false";
  const token = qp._token || req.headers["x-kis-token"] || "";

  const baseUrl = isVirtual ? VIRT_BASE : REAL_BASE;
  const cano = accountNo.slice(0, 8);
  const acntPrdtCd = accountNo.slice(8, 10);

  try {
    // ── debug (GET): show routing info ──
    if (routeName === "debug") {
      return res.json({ url: req.url, routeName, pathSegments, method: req.method, hasAppKey: !!appKey, hasToken: !!token, qp });
    }

    // ── config (POST): authenticate ──
    if (routeName === "config" && req.method === "POST") {
      const body = req.body || {};
      const ak = body.app_key;
      const as = body.app_secret;
      const acct = (body.account_no || "").replace(/-/g, "");
      const isV = body.is_virtual !== false;
      const base = isV ? VIRT_BASE : REAL_BASE;

      const tokenResp = await fetch(`${base}/oauth2/tokenP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          appkey: ak,
          appsecret: as,
        }),
      });
      const tokenData = await tokenResp.json();

      if (tokenData.access_token) {
        return res.json({
          success: true,
          message: "KIS API 설정 완료",
          access_token: tokenData.access_token,
          token_preview: tokenData.access_token.slice(0, 20) + "...",
          is_virtual: isV,
        });
      }
      return res.status(400).json({
        success: false,
        detail: `KIS API 설정 실패: ${tokenData.msg1 || JSON.stringify(tokenData)}`,
      });
    }

    // ── status (GET) ──
    if (routeName === "status") {
      return res.json({
        configured: !!(appKey && appSecret && accountNo),
        token_valid: !!token,
        is_virtual: isVirtual,
        account_no: accountNo
          ? accountNo.slice(0, 4) + "****" + accountNo.slice(-2)
          : "",
      });
    }

    // All other routes require token
    if (!token || !appKey) {
      return res
        .status(400)
        .json({ success: false, detail: "KIS API 키가 설정되지 않았습니다" });
    }

    // ── balance (GET) ──
    if (routeName === "balance") {
      const trId = isVirtual ? "VTTC8434R" : "TTTC8434R";
      const result = await kisGet(
        baseUrl,
        "/uapi/domestic-stock/v1/trading/inquire-balance",
        trId,
        {
          CANO: cano,
          ACNT_PRDT_CD: acntPrdtCd,
          AFHR_FLPR_YN: "N",
          OFL_YN: "",
          INQR_DVSN: "02",
          UNPR_DVSN: "01",
          FUND_STTL_ICLD_YN: "N",
          FNCG_AMT_AUTO_RDPT_YN: "N",
          PRCS_DVSN: "00",
          CTX_AREA_FK100: "",
          CTX_AREA_NK100: "",
        },
        token,
        appKey,
        appSecret
      );

      const holdings = result.output1 || [];
      const summary = (result.output2 || [{}])[0] || {};
      const positions = holdings
        .filter((h) => safeInt(h.hldg_qty) > 0)
        .map((h) => ({
          stock_code: h.pdno || "",
          stock_name: h.prdt_name || "",
          qty: safeInt(h.hldg_qty),
          avg_price: safeFloat(h.pchs_avg_pric),
          current_price: safeInt(h.prpr),
          eval_amount: safeInt(h.evlu_amt),
          profit_loss: safeInt(h.evlu_pfls_amt),
          profit_rate: safeFloat(h.evlu_pfls_rt),
          buy_amount: safeInt(h.pchs_amt),
        }));

      return res.json({
        success: true,
        positions,
        summary: {
          total_eval: safeInt(summary.tot_evlu_amt),
          total_profit: safeInt(summary.evlu_pfls_smtl_amt),
          deposit: safeInt(summary.dnca_tot_amt),
          total_buy: safeInt(summary.pchs_amt_smtl_amt),
          profit_rate: safeFloat(summary.tot_evlu_pfls_rt),
        },
      });
    }

    // ── orders (GET): execution history ──
    if (routeName === "orders") {
      const startDate = qp.start_date || today();
      const endDate = qp.end_date || startDate;
      const trId = isVirtual ? "VTTC8001R" : "TTTC8001R";
      const result = await kisGet(
        baseUrl,
        "/uapi/domestic-stock/v1/trading/inquire-daily-ccld",
        trId,
        {
          CANO: cano,
          ACNT_PRDT_CD: acntPrdtCd,
          INQR_STRT_DT: startDate,
          INQR_END_DT: endDate,
          SLL_BUY_DVSN_CD: "00",
          INQR_DVSN: "00",
          PDNO: "",
          CCLD_DVSN: "00",
          ORD_GNO_BRNO: "",
          ODNO: "",
          INQR_DVSN_3: "00",
          INQR_DVSN_1: "",
          CTX_AREA_FK100: "",
          CTX_AREA_NK100: "",
        },
        token,
        appKey,
        appSecret
      );

      const orders = (result.output1 || []).map((o) => ({
        order_no: o.odno || "",
        order_date: o.ord_dt || "",
        order_time: o.ord_tmd || "",
        stock_code: o.pdno || "",
        stock_name: o.prdt_name || "",
        side: o.sll_buy_dvsn_cd === "02" ? "매수" : "매도",
        order_qty: safeInt(o.ord_qty),
        order_price: safeInt(o.ord_unpr),
        exec_qty: safeInt(o.tot_ccld_qty),
        exec_price: safeInt(o.avg_prvs),
        status: o.ord_dvsn_name || "",
      }));
      return res.json({ success: true, orders });
    }

    // ── order/buy, order/sell (POST) ──
    if (
      (routeName === "order/buy" || routeName === "order/sell" ||
       (routeName === "order" && (routeSub === "buy" || routeSub === "sell"))) &&
      req.method === "POST"
    ) {
      const isBuy = routeName === "order/buy" || routeSub === "buy";
      const body = req.body || {};
      const trId = isVirtual
        ? isBuy
          ? "VTTC0802U"
          : "VTTC0801U"
        : isBuy
          ? "TTTC0802U"
          : "TTTC0801U";

      const result = await kisPost(
        baseUrl,
        "/uapi/domestic-stock/v1/trading/order-cash",
        trId,
        {
          CANO: cano,
          ACNT_PRDT_CD: acntPrdtCd,
          PDNO: body.stock_code,
          ORD_DVSN: body.order_type || "00",
          ORD_QTY: String(body.qty),
          ORD_UNPR: body.order_type === "00" ? String(body.price || 0) : "0",
        },
        token,
        appKey,
        appSecret
      );

      const success = result.rt_cd === "0";
      return res.json({
        success,
        message: result.msg1 || "",
        order_no: (result.output || {}).ODNO || "",
        data: result.output || {},
      });
    }

    // ── order/cancel (POST) ──
    if ((routeName === "order/cancel" || (routeName === "order" && routeSub === "cancel")) && req.method === "POST") {
      const body = req.body || {};
      const trId = isVirtual ? "VTTC0803U" : "TTTC0803U";
      const result = await kisPost(
        baseUrl,
        "/uapi/domestic-stock/v1/trading/order-rvsecncl",
        trId,
        {
          CANO: cano,
          ACNT_PRDT_CD: acntPrdtCd,
          KRX_FWDG_ORD_ORGNO: "",
          ORGN_ODNO: body.org_order_no,
          ORD_DVSN: "00",
          RVSE_CNCL_DVSN_CD: "02",
          ORD_QTY: String(body.qty),
          ORD_UNPR: String(body.price || 0),
          QTY_ALL_ORD_YN: "Y",
        },
        token,
        appKey,
        appSecret
      );
      return res.json({
        success: result.rt_cd === "0",
        message: result.msg1 || "",
        data: result.output || {},
      });
    }

    // ── buyable (GET) ──
    if (routeName === "buyable") {
      const trId = isVirtual ? "VTTC8908R" : "TTTC8908R";
      const result = await kisGet(
        baseUrl,
        "/uapi/domestic-stock/v1/trading/inquire-psbl-order",
        trId,
        {
          CANO: cano,
          ACNT_PRDT_CD: acntPrdtCd,
          PDNO: qp.stock_code,
          ORD_UNPR: String(qp.price),
          ORD_DVSN: "00",
          CMA_EVLU_AMT_ICLD_YN: "Y",
          OVRS_ICLD_YN: "Y",
        },
        token,
        appKey,
        appSecret
      );
      const output = result.output || {};
      return res.json({
        success: true,
        max_qty: safeInt(output.nrcvb_buy_qty),
        max_amount: safeInt(output.nrcvb_buy_amt),
        deposit: safeInt(output.dnca_tot_amt),
      });
    }

    // ── quote/:code (GET) ──
    if (routeName === "quote" && (qp.code || pathSegments[1])) {
      const code = qp.code || pathSegments[1];
      const result = await kisGet(
        baseUrl,
        "/uapi/domestic-stock/v1/quotations/inquire-price",
        "FHKST01010100",
        { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code },
        token,
        appKey,
        appSecret
      );
      const o = result.output || {};
      return res.json({
        success: true,
        stock_code: code,
        name: o.rprs_mrkt_kor_name || o.hts_kor_isnm || "",
        price: safeInt(o.stck_prpr),
        change: safeInt(o.prdy_vrss),
        change_rate: safeFloat(o.prdy_ctrt),
        change_sign: o.prdy_vrss_sign || "",
        volume: safeInt(o.acml_vol),
        trade_amount: safeInt(o.acml_tr_pbmn),
        high: safeInt(o.stck_hgpr),
        low: safeInt(o.stck_lwpr),
        open: safeInt(o.stck_oprc),
        prev_close: safeInt(o.stck_sdpr),
        per: safeFloat(o.per),
        pbr: safeFloat(o.pbr),
        eps: safeFloat(o.eps),
        market_cap: safeInt(o.hts_avls),
        "52w_high": safeInt(o.stck_dryc_hgpr),
        "52w_low": safeInt(o.stck_dryc_lwpr),
      });
    }

    // ── chart/:code (GET) ──
    if (routeName === "chart" && (qp.code || pathSegments[1])) {
      const code = qp.code || pathSegments[1];
      const period = qp.period || "D";
      const endDate = qp.end_date || today();
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      const startDate =
        qp.start_date || d.toISOString().slice(0, 10).replace(/-/g, "");

      const result = await kisGet(
        baseUrl,
        "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
        "FHKST03010100",
        {
          FID_COND_MRKT_DIV_CODE: "J",
          FID_INPUT_ISCD: code,
          FID_INPUT_DATE_1: startDate,
          FID_INPUT_DATE_2: endDate,
          FID_PERIOD_DIV_CODE: period,
          FID_ORG_ADJ_PRC: "0",
        },
        token,
        appKey,
        appSecret
      );

      const candles = (result.output2 || [])
        .filter((c) => c.stck_bsop_date)
        .map((c) => ({
          date: c.stck_bsop_date || "",
          open: safeInt(c.stck_oprc),
          high: safeInt(c.stck_hgpr),
          low: safeInt(c.stck_lwpr),
          close: safeInt(c.stck_clpr),
          volume: safeInt(c.acml_vol),
          amount: safeInt(c.acml_tr_pbmn),
        }));
      return res.json({
        success: true,
        candles,
        info: result.output1 || {},
      });
    }

    // ── asking/:code (GET) ──
    if (routeName === "asking" && (qp.code || pathSegments[1])) {
      const code = qp.code || pathSegments[1];
      const result = await kisGet(
        baseUrl,
        "/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn",
        "FHKST01010200",
        { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code },
        token,
        appKey,
        appSecret
      );
      const o = result.output1 || {};
      const asks = [];
      const bids = [];
      for (let i = 1; i <= 10; i++) {
        asks.push({
          price: safeInt(o[`askp${i}`]),
          qty: safeInt(o[`askp_rsqn${i}`]),
        });
        bids.push({
          price: safeInt(o[`bidp${i}`]),
          qty: safeInt(o[`bidp_rsqn${i}`]),
        });
      }
      return res.json({
        success: true,
        asks,
        bids,
        total_ask_qty: safeInt(o.total_askp_rsqn),
        total_bid_qty: safeInt(o.total_bidp_rsqn),
      });
    }

    // ── finance/:code (GET) ──
    if (routeName === "finance" && (qp.code || pathSegments[1])) {
      const code = qp.code || pathSegments[1];
      // Finance data is reference data - always use real server
      const financeBase = REAL_BASE;
      try {
        const [ratio, income, growth] = await Promise.all([
          kisGet(
            financeBase,
            "/uapi/domestic-stock/v1/finance/financial-ratio",
            "FHKST66430300",
            { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code },
            token,
            appKey,
            appSecret
          ).catch(e => ({ error: e.message })),
          kisGet(
            financeBase,
            "/uapi/domestic-stock/v1/finance/income-statement",
            "FHKST66430200",
            { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code },
            token,
            appKey,
            appSecret
          ).catch(e => ({ error: e.message })),
          kisGet(
            financeBase,
            "/uapi/domestic-stock/v1/finance/growth-ratio",
            "FHKST66430800",
            { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code },
            token,
            appKey,
            appSecret
          ).catch(e => ({ error: e.message })),
        ]);
        // Check if all failed
        if (ratio.error && income.error && growth.error) {
          return res.status(502).json({ success: false, detail: `KIS 재무정보 API 오류: ${ratio.error}` });
        }
        return res.json({
          success: true,
          financial_ratio: ratio.output || [],
          income_statement: income.output || [],
          growth_ratio: growth.output || [],
        });
      } catch (e) {
        return res.status(502).json({ success: false, detail: `재무정보 조회 실패: ${e.message}` });
      }
    }

    // ── ranking/volume (GET) ──
    if (routeName === "ranking/volume" || (routeName === "ranking" && routeSub === "volume")) {
      const market = qp.market || "J";
      const result = await kisGet(
        baseUrl,
        "/uapi/domestic-stock/v1/quotations/volume-rank",
        "FHPST01710000",
        {
          FID_COND_MRKT_DIV_CODE: market,
          FID_COND_SCR_DIV_CODE: "20171",
          FID_INPUT_ISCD: "0000",
          FID_DIV_CLS_CODE: "0",
          FID_BLNG_CLS_CODE: "0",
          FID_TRGT_CLS_CODE: "111111111",
          FID_TRGT_EXLS_CLS_CODE: "000000",
          FID_INPUT_PRICE_1: "",
          FID_INPUT_PRICE_2: "",
          FID_VOL_CNT: "",
          FID_INPUT_DATE_1: "",
        },
        token,
        appKey,
        appSecret
      );
      const items = (result.output || []).slice(0, 30).map((item) => ({
        rank: safeInt(item.data_rank),
        stock_code: item.mksc_shrn_iscd || "",
        stock_name: item.hts_kor_isnm || "",
        price: safeInt(item.stck_prpr),
        change: safeInt(item.prdy_vrss),
        change_rate: safeFloat(item.prdy_ctrt),
        volume: safeInt(item.acml_vol),
        trade_amount: safeInt(item.acml_tr_pbmn),
        change_sign: item.prdy_vrss_sign || "",
      }));
      return res.json({ success: true, items });
    }

    // ── ranking/fluctuation (GET) ──
    if (routeName === "ranking/fluctuation" || (routeName === "ranking" && routeSub === "fluctuation")) {
      const market = qp.market || "J";
      const sort = qp.sort || "0";
      const result = await kisGet(
        baseUrl,
        "/uapi/domestic-stock/v1/quotations/fluctuation",
        "FHPST01740000",
        {
          FID_COND_MRKT_DIV_CODE: market,
          FID_COND_SCR_DIV_CODE: "20174",
          FID_INPUT_ISCD: "0000",
          FID_RANK_SORT_CLS_CODE: sort,
          FID_INPUT_CNT_1: "0",
          FID_PRC_CLS_CODE: "0",
          FID_INPUT_PRICE_1: "",
          FID_INPUT_PRICE_2: "",
          FID_VOL_CNT: "",
          FID_TRGT_CLS_CODE: "0",
          FID_TRGT_EXLS_CLS_CODE: "0",
          FID_DIV_CLS_CODE: "0",
          FID_RSFL_RATE1: "",
          FID_RSFL_RATE2: "",
        },
        token,
        appKey,
        appSecret
      );
      const items = (result.output || []).slice(0, 30).map((item) => ({
        rank: safeInt(item.data_rank),
        stock_code: item.mksc_shrn_iscd || item.stck_shrn_iscd || "",
        stock_name: item.hts_kor_isnm || "",
        price: safeInt(item.stck_prpr),
        change: safeInt(item.prdy_vrss),
        change_rate: safeFloat(item.prdy_ctrt),
        volume: safeInt(item.acml_vol),
        change_sign: item.prdy_vrss_sign || "",
      }));
      return res.json({ success: true, items });
    }

    // ── index (GET): KOSPI/KOSDAQ ──
    if (routeName === "index") {
      const [kospi, kosdaq] = await Promise.all([
        kisGet(
          baseUrl,
          "/uapi/domestic-stock/v1/quotations/inquire-index-price",
          "FHPUP02100000",
          { FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: "0001" },
          token,
          appKey,
          appSecret
        ),
        kisGet(
          baseUrl,
          "/uapi/domestic-stock/v1/quotations/inquire-index-price",
          "FHPUP02100000",
          { FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: "1001" },
          token,
          appKey,
          appSecret
        ),
      ]);

      function parseIndex(data) {
        const o = data.output || {};
        return {
          price: safeFloat(o.bstp_nmix_prpr),
          change: safeFloat(o.bstp_nmix_prdy_vrss),
          change_rate: safeFloat(o.bstp_nmix_prdy_ctrt),
          volume: safeInt(o.acml_vol),
          trade_amount: safeInt(o.acml_tr_pbmn),
        };
      }
      return res.json({
        success: true,
        kospi: parseIndex(kospi),
        kosdaq: parseIndex(kosdaq),
      });
    }

    // ── token (POST): refresh ──
    if (routeName === "token" && req.method === "POST") {
      const tokenResp = await fetch(`${baseUrl}/oauth2/tokenP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          appkey: appKey,
          appsecret: appSecret,
        }),
      });
      const tokenData = await tokenResp.json();
      if (tokenData.access_token) {
        return res.json({
          success: true,
          access_token: tokenData.access_token,
        });
      }
      return res
        .status(400)
        .json({ success: false, detail: tokenData.msg1 || "Token refresh failed" });
    }

    return res.status(404).json({ success: false, detail: "Not Found" });
  } catch (e) {
    return res.status(500).json({ success: false, detail: e.message });
  }
}
