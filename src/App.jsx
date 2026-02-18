import { useState, useEffect, useCallback } from "react";

// ============================================================
// API Helper - 백엔드 실시간 연동 / Real Backend Connection
// ============================================================
const API_BASE = "https://web-production-139e9.up.railway.app";

async function api(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ============================================================
// 한국 공휴일 DB (2025~2027) / Korean Holidays
// ============================================================
const KR_HOLIDAYS = {
  "2025-01-01":"신정","2025-01-28":"설날연휴","2025-01-29":"설날","2025-01-30":"설날연휴",
  "2025-03-01":"삼일절","2025-05-05":"어린이날·부처님오신날","2025-05-06":"대체공휴일",
  "2025-06-06":"현충일","2025-08-15":"광복절","2025-10-03":"개천절",
  "2025-10-05":"추석연휴","2025-10-06":"추석","2025-10-07":"추석연휴","2025-10-08":"대체공휴일(추석)",
  "2025-10-09":"한글날","2025-12-25":"크리스마스",
  "2026-01-01":"신정","2026-02-16":"설날연휴","2026-02-17":"설날","2026-02-18":"대체공휴일(설날)",
  "2026-03-01":"삼일절","2026-03-02":"대체공휴일(삼일절)",
  "2026-05-05":"어린이날","2026-05-24":"부처님오신날","2026-05-25":"대체공휴일(부처님오신날)",
  "2026-06-06":"현충일","2026-08-15":"광복절","2026-08-17":"대체공휴일(광복절)",
  "2026-09-24":"추석연휴","2026-09-25":"추석","2026-09-26":"추석연휴",
  "2026-10-03":"개천절","2026-10-05":"대체공휴일(개천절)","2026-10-09":"한글날","2026-12-25":"크리스마스",
  "2027-01-01":"신정","2027-02-05":"설날연휴","2027-02-06":"설날","2027-02-07":"설날연휴","2027-02-08":"대체공휴일(설날)",
  "2027-03-01":"삼일절","2027-05-05":"어린이날","2027-05-13":"부처님오신날",
  "2027-06-06":"현충일","2027-08-15":"광복절",
  "2027-09-14":"추석연휴","2027-09-15":"추석","2027-09-16":"추석연휴",
  "2027-10-03":"개천절","2027-10-09":"한글날","2027-12-25":"크리스마스",
};

function getMarketStatus(d) {
  const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const h = d.getHours(), m = d.getMinutes(), day = d.getDay();
  if (day===0||day===6) return {isOpen:false, status:"휴장 (주말)"};
  if (KR_HOLIDAYS[ds]) return {isOpen:false, status:`휴장 (${KR_HOLIDAYS[ds]})`};
  const open = h>=9 && (h<15||(h===15&&m<=30));
  if (!open) return {isOpen:false, status: h<9?"장 시작 전":"장 마감"};
  return {isOpen:true, status:"장 운영 중"};
}

// ============================================================
// Helpers
// ============================================================
const fmt = (n) => n?.toLocaleString("ko-KR") ?? "—";
const fmtWon = (n) => n!=null ? `${n>=0?"+":""}${n.toLocaleString("ko-KR")}원` : "—";
const fmtPct = (n) => n!=null ? `${n>=0?"+":""}${n.toFixed(2)}%` : "—";
const clr = (n) => n>0 ? "#4cff8b" : n<0 ? "#ff4c4c" : "#8899aa";

// ============================================================
// Hook: 주기적 API 호출 / Periodic API Fetching
// ============================================================
function useApi(path, interval=60000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    const r = await api(path);
    if (r!==null) { setData(r); setError(false); } else { setError(true); }
    setLoading(false);
  }, [path]);
  useEffect(() => {
    load();
    if (interval>0) { const t=setInterval(load, interval); return ()=>clearInterval(t); }
  }, [load, interval]);
  return { data, loading, error, refetch: load };
}

// ============================================================
// UI Components
// ============================================================
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(t); }, []);
  const ms = getMarketStatus(now);
  return (
    <div style={{display:"flex",alignItems:"center",gap:16}}>
      <span style={{color:"#8899aa",fontSize:14}}>{now.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"short"})}</span>
      <span style={{color:"#e0e6f0",fontSize:14,fontFamily:"'JetBrains Mono',monospace"}}>{now.toLocaleTimeString("ko-KR")}</span>
      <span style={{background:ms.isOpen?"rgba(76,255,139,0.15)":"rgba(255,152,0,0.15)",color:ms.isOpen?"#4cff8b":"#ff9800",padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:600}}>● {ms.status}</span>
    </div>
  );
}

function Card({title,value,sub,color="#e0e6f0",icon}) {
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:"18px 20px",flex:1,minWidth:200}}>
      <div style={{color:"#6688aa",fontSize:12,marginBottom:6}}>{icon} {title}</div>
      <div style={{color,fontSize:22,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{value}</div>
      <div style={{color:color==="#e0e6f0"?"#6688aa":color,fontSize:12,marginTop:4}}>{sub}</div>
    </div>
  );
}

const Loader = ({t="로딩 중..."}) => <div style={{textAlign:"center",padding:"40px 0",color:"#6688aa",fontSize:13}}>⏳ {t}</div>;
const Err = ({t="서버 연결 실패",fn}) => <div style={{textAlign:"center",padding:"30px 0"}}><div style={{color:"#ff9800",fontSize:13}}>⚠️ {t}</div>{fn&&<button onClick={fn} style={{marginTop:8,padding:"4px 14px",background:"rgba(26,58,110,0.6)",color:"#64b5f6",border:"1px solid rgba(100,140,200,0.2)",borderRadius:6,fontSize:11,cursor:"pointer"}}>다시 시도</button>}</div>;
const Closed = ({s}) => <div style={{textAlign:"center",padding:"30px 0"}}><div style={{fontSize:32,marginBottom:8}}>🏖️</div><div style={{color:"#ff9800",fontSize:14,fontWeight:600}}>{s}</div><div style={{color:"#6688aa",fontSize:12,marginTop:6}}>오늘은 매매가 진행되지 않습니다</div></div>;

function MiniChart({data,width=500,height=120,color="#4cff8b"}) {
  if (!data||!data.length) return <div style={{color:"#556677",fontSize:12,textAlign:"center",padding:20}}>데이터 없음</div>;
  const vals=data.map(d=>d.total_asset), mn=Math.min(...vals)*0.998, mx=Math.max(...vals)*1.002, rng=mx-mn||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*width},${height-((v-mn)/rng)*(height-20)-10}`).join(" ");
  return (
    <svg width={width} height={height} style={{display:"block"}}>
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={pts+` ${width},${height-5} 0,${height-5}`} fill="url(#cg)"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"/>
      {vals.map((v,i)=><circle key={i} cx={(i/(vals.length-1))*width} cy={height-((v-mn)/rng)*(height-20)-10} r="3" fill={color}/>)}
    </svg>
  );
}

function CandleChart({code,width=560,height=280}) {
  const {data:candles} = useApi(code?`/api/stock/minute/${code}`:null, 60000);
  const dc = candles&&candles.length>5 ? candles.slice(0,35).reverse() : null;
  if (!dc) return <div style={{width,height,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(8,15,30,0.8)",borderRadius:4}}><span style={{color:"#556677",fontSize:12}}>{code?"분봉 데이터 로딩...":"종목을 선택하세요"}</span></div>;
  const ap=dc.flatMap(c=>[c.high,c.low]), mn=Math.min(...ap)-500, mx=Math.max(...ap)+500, rng=mx-mn||1, cw=(width-40)/dc.length;
  const toY=p=>20+(1-(p-mn)/rng)*(height-60);
  return (
    <svg width={width} height={height} style={{display:"block"}}>
      <rect x="0" y="0" width={width} height={height} fill="rgba(8,15,30,0.8)" rx="4"/>
      {[0.25,0.5,0.75].map(p=><g key={p}><line x1="30" y1={toY(mn+rng*p)} x2={width-10} y2={toY(mn+rng*p)} stroke="rgba(50,70,100,0.3)" strokeDasharray="3,3"/><text x="2" y={toY(mn+rng*p)+4} fill="#445566" fontSize="9" fontFamily="monospace">{fmt(Math.round(mn+rng*p))}</text></g>)}
      {dc.map((c,i)=>{const x=35+i*cw,up=c.close>=c.open,co=up?"#ff4444":"#4488ff",bt=toY(Math.max(c.open,c.close)),bb=toY(Math.min(c.open,c.close)),bh=Math.max(bb-bt,1);return(<g key={i}><line x1={x+cw/2} y1={toY(c.high)} x2={x+cw/2} y2={toY(c.low)} stroke={co} strokeWidth="1"/><rect x={x+1} y={bt} width={cw-2} height={bh} fill={co} rx="1"/><rect x={x+1} y={height-35} width={cw-2} height={Math.min(c.volume/500000*25,25)} fill={co} opacity="0.3"/></g>);})}
    </svg>
  );
}

// ============================================================
// Pages - 모두 실제 API 연동 / All Real API
// ============================================================
function DashboardPage() {
  const mkt = getMarketStatus(new Date());
  const iv = mkt.isOpen ? 30000 : 0;
  const {data:trades,loading:tL,error:tE,refetch:tR} = useApi("/api/trades/today", iv);
  const {data:holdings,loading:hL,error:hE} = useApi("/api/portfolio/holdings", iv);
  const {data:watchlist,loading:wL} = useApi("/api/watchlist/", mkt.isOpen?60000:0);
  const {data:assetHistory} = useApi("/api/portfolio/asset-history", 0);
  const {data:summary} = useApi("/api/portfolio/summary", iv);
  const {data:strategies} = useApi("/api/strategy/", 0);

  const tList=trades||[], hList=holdings||[], wList=watchlist||[];
  const hist=(assetHistory||[]).sort((a,b)=>a.record_date?.localeCompare(b.record_date));
  const sells=tList.filter(t=>t.trade_type==="sell");
  const todayProfit=sells.reduce((s,t)=>s+(t.net_profit||0),0);
  const wins=sells.filter(t=>(t.net_profit||0)>0).length, losses=sells.filter(t=>(t.net_profit||0)<=0).length;
  const totalUnrealized=hList.reduce((s,h)=>s+(h.unrealized_profit||0),0);
  const initCap=strategies?.[0]?.initial_capital||1000000;
  const totalAsset=hist.length?hist[hist.length-1]?.total_asset:null;
  const cumRet=totalAsset?((totalAsset-initCap)/initCap*100):0;
  const tgtPct=totalAsset?(totalAsset/1e9*100):0;
  const chartStock=hList[0]||wList[0]||null;
  const chartCode=mkt.isOpen?(chartStock?.stock_code||""):"";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <Card icon="💰" title="총 자산" value={totalAsset?`${fmt(totalAsset)}원`:"—"} sub={totalAsset?fmtPct(cumRet):"로딩..."} color={totalAsset?"#4cff8b":"#e0e6f0"}/>
        <Card icon="📈" title="오늘 순수익" value={!mkt.isOpen?"—":fmtWon(todayProfit)} sub={!mkt.isOpen?mkt.status:"수수료·세금 차감"} color={!mkt.isOpen?"#ff9800":clr(todayProfit)}/>
        <Card icon="💼" title="보유 종목" value={`${hList.length} 종목`} sub={`미실현 ${fmtWon(totalUnrealized)}`} color="#64b5f6"/>
        <Card icon="🔄" title="오늘 매매" value={!mkt.isOpen?"0회 (휴장)":`${sells.length}회 (${wins}승 ${losses}패)`} sub={!mkt.isOpen?mkt.status:`승률 ${sells.length?Math.round(wins/sells.length*100):0}%`} color={!mkt.isOpen?"#ff9800":"#ffd54f"}/>
      </div>

      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 550px",background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div><span style={{color:"#e0e6f0",fontWeight:600,fontSize:15}}>📈 실시간 차트</span><span style={{color:"#6688aa",fontSize:12,marginLeft:12}}>{chartStock?`${chartStock.stock_name} (${chartStock.stock_code})`:"종목 없음"}</span></div>
            {chartStock?.current_price&&<span style={{color:clr(chartStock.unrealized_pct||0),fontSize:16,fontWeight:700,fontFamily:"monospace"}}>{fmt(chartStock.current_price)}원</span>}
          </div>
          <CandleChart code={chartCode}/>
        </div>
        <div style={{flex:"1 1 400px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
            <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>🔍 오늘의 감시 종목</div>
            {!mkt.isOpen?<div style={{textAlign:"center",padding:"20px 0",color:"#6688aa",fontSize:12}}>{mkt.status} — 감시 종목 없음</div>
            :wL?<Loader t="감시종목 로딩..."/>:wList.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#556677",fontSize:12}}>감시 종목 없음</div>
            :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{color:"#556677"}}><td style={{padding:"6px 4px"}}>종목명</td><td>점수</td><td>상태</td></tr></thead>
            <tbody>{wList.slice(0,7).map((s,i)=><tr key={i} style={{background:i%2===0?"rgba(10,18,40,0.5)":"transparent"}}><td style={{padding:"6px 4px",color:"#e0e6f0"}}>{s.stock_name}</td><td style={{color:"#ffd54f",fontFamily:"monospace"}}>{s.score}</td><td><span style={{color:s.status==="매수완료"?"#4cff8b":s.status==="눌림목감지"?"#ffd54f":"#6688aa",fontSize:11}}>{s.status}</span></td></tr>)}</tbody></table>}
          </div>
          <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
            <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>💼 보유 종목</div>
            {hL?<Loader t="보유종목 로딩..."/>:hE?<Err t="보유종목 조회 실패"/>:hList.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#556677",fontSize:12}}>보유 종목 없음</div>
            :<><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{color:"#556677"}}><td style={{padding:"6px 4px"}}>종목</td><td>매수가</td><td>현재가</td><td>수익률</td><td>미실현</td></tr></thead>
            <tbody>{hList.map((h,i)=><tr key={i} style={{background:i%2===0?"rgba(10,18,40,0.5)":"transparent"}}><td style={{padding:"6px 4px",color:"#e0e6f0"}}>{h.stock_name}</td><td style={{color:"#6688aa",fontFamily:"monospace"}}>{fmt(h.buy_price)}</td><td style={{color:"#e0e6f0",fontFamily:"monospace"}}>{fmt(h.current_price)}</td><td style={{color:clr(h.unrealized_pct),fontFamily:"monospace"}}>{fmtPct(h.unrealized_pct)}</td><td style={{color:clr(h.unrealized_profit),fontFamily:"monospace"}}>{fmtWon(h.unrealized_profit)}</td></tr>)}</tbody></table>
            <div style={{borderTop:"1px solid rgba(100,140,200,0.15)",marginTop:8,paddingTop:8,display:"flex",justifyContent:"space-between"}}><span style={{color:"#6688aa",fontSize:12}}>합계</span><span style={{color:clr(totalUnrealized),fontSize:13,fontWeight:600,fontFamily:"monospace"}}>{fmtWon(totalUnrealized)}</span></div></>}
          </div>
        </div>
      </div>

      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 550px",background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
          <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>📋 오늘 매매 로그</div>
          {!mkt.isOpen?<Closed s={mkt.status}/>:tL?<Loader t="매매 로그 로딩..."/>:tE?<Err t="매매 로그 조회 실패" fn={tR}/>:tList.length===0?<div style={{textAlign:"center",padding:"30px 0",color:"#556677",fontSize:12}}>오늘 매매 기록 없음</div>
          :<><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{color:"#556677"}}><td style={{padding:"6px 4px"}}>시간</td><td>구분</td><td>종목</td><td>매수가</td><td>매도가</td><td>현재가</td><td>순수익</td></tr></thead>
          <tbody>{tList.map((t,i)=><tr key={i} style={{background:i%2===0?"rgba(10,18,40,0.5)":"transparent"}}><td style={{padding:"6px 4px",color:"#6688aa",fontFamily:"monospace"}}>{(t.traded_at||"").split("T")[1]?.slice(0,5)||"—"}</td><td style={{color:t.trade_type==="buy"?"#64b5f6":clr(t.net_profit)}}>{t.trade_type==="buy"?"매수":"매도"}</td><td style={{color:"#e0e6f0"}}>{t.stock_name}</td><td style={{color:"#6688aa",fontFamily:"monospace"}}>{fmt(t.buy_price)}</td><td style={{color:t.sell_price?"#e0e6f0":"#334455",fontFamily:"monospace"}}>{t.sell_price?fmt(t.sell_price):"—"}</td><td style={{color:"#e0e6f0",fontFamily:"monospace"}}>{fmt(t.current_price)}</td><td style={{color:t.net_profit!=null?clr(t.net_profit):"#334455",fontFamily:"monospace"}}>{t.net_profit!=null?fmtWon(t.net_profit):"—"}</td></tr>)}</tbody></table>
          <div style={{borderTop:"1px solid rgba(100,140,200,0.15)",marginTop:8,paddingTop:8,display:"flex",gap:20}}><span style={{color:"#6688aa",fontSize:12}}>매매 {sells.length}회 | {wins}승 {losses}패 | 승률 {sells.length?Math.round(wins/sells.length*100):0}%</span><span style={{color:clr(todayProfit),fontSize:13,fontWeight:600,fontFamily:"monospace"}}>실현 순수익: {fmtWon(todayProfit)}</span></div></>}
        </div>
        <div style={{flex:"1 1 400px",background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
          <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>🎯 100만원 → 10억 여정</div>
          <MiniChart data={hist} width={420} height={130}/>
          {hist.length>0&&<div style={{display:"flex",justifyContent:"space-between",marginTop:4,padding:"0 4px"}}><span style={{color:"#556677",fontSize:10}}>{hist[0]?.record_date?.slice(5)}</span><span style={{color:"#556677",fontSize:10}}>{hist[hist.length-1]?.record_date?.slice(5)}</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:12,gap:8}}>
            {[["시작금액",`${fmt(initCap)}원`,"#e0e6f0"],["현재자산",totalAsset?`${fmt(totalAsset)}원`:"—","#4cff8b"],["남은금액",totalAsset?`${fmt(1e9-totalAsset)}원`:"—","#ffd54f"]].map(([l,v,c])=><div key={l} style={{flex:1}}><div style={{color:"#556677",fontSize:11}}>{l}</div><div style={{color:c,fontSize:13,fontWeight:600,fontFamily:"monospace"}}>{v}</div></div>)}
          </div>
          <div style={{marginTop:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:"#556677"}}>목표 진행률</span><span style={{color:"#64b5f6"}}>{tgtPct.toFixed(2)}%</span></div><div style={{background:"rgba(10,18,40,0.8)",borderRadius:6,height:8,marginTop:4,overflow:"hidden"}}><div style={{background:"linear-gradient(90deg,#4fc3f7,#4cff8b)",width:`${Math.max(tgtPct,0.1)}%`,minWidth:4,height:"100%",borderRadius:6}}/></div></div>
        </div>
      </div>
    </div>
  );
}

function HistoryPage() {
  const {data:trades,loading,error} = useApi("/api/trades/?limit=100", 0);
  if (loading) return <Loader t="매매이력 로딩..."/>;
  if (error) return <Err t="매매이력 조회 실패"/>;
  const tl=trades||[];
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
      <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>📋 전체 매매 이력 (최근 100건)</div>
      {tl.length===0?<div style={{textAlign:"center",padding:"30px 0",color:"#556677",fontSize:12}}>매매 이력 없음</div>
      :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{color:"#556677"}}><td style={{padding:"6px 4px"}}>날짜</td><td>시간</td><td>구분</td><td>종목</td><td>매수가</td><td>매도가</td><td>수량</td><td>순수익</td><td>사유</td></tr></thead>
      <tbody>{tl.map((t,i)=><tr key={i} style={{background:i%2===0?"rgba(10,18,40,0.5)":"transparent"}}><td style={{padding:"6px 4px",color:"#6688aa",fontFamily:"monospace"}}>{(t.traded_at||"").split("T")[0]?.slice(5)}</td><td style={{color:"#6688aa",fontFamily:"monospace"}}>{(t.traded_at||"").split("T")[1]?.slice(0,5)||"—"}</td><td style={{color:t.trade_type==="buy"?"#64b5f6":clr(t.net_profit)}}>{t.trade_type==="buy"?"매수":"매도"}</td><td style={{color:"#e0e6f0"}}>{t.stock_name}</td><td style={{color:"#6688aa",fontFamily:"monospace"}}>{fmt(t.buy_price)}</td><td style={{color:t.sell_price?"#e0e6f0":"#334455",fontFamily:"monospace"}}>{t.sell_price?fmt(t.sell_price):"—"}</td><td style={{color:"#aabbcc",fontFamily:"monospace"}}>{t.quantity}</td><td style={{color:t.net_profit!=null?clr(t.net_profit):"#334455",fontFamily:"monospace"}}>{t.net_profit!=null?fmtWon(t.net_profit):"—"}</td><td style={{color:"#556677",fontSize:11}}>{t.trade_reason||"—"}</td></tr>)}</tbody></table>}
    </div>
  );
}

function PerformancePage() {
  const {data:reports,loading} = useApi("/api/portfolio/daily-report?days=30", 0);
  const {data:summary} = useApi("/api/portfolio/summary", 0);
  if (loading) return <Loader t="수익분석 로딩..."/>;
  const rl=(reports||[]).sort((a,b)=>a.report_date?.localeCompare(b.report_date));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {summary&&<div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <Card icon="💰" title="총 투자금" value={`${fmt(summary.total_invested)}원`} sub={`${summary.holdings_count}종목`} color="#64b5f6"/>
        <Card icon="📈" title="실현 수익" value={fmtWon(summary.realized_profit)} sub="매도 완료" color={clr(summary.realized_profit)}/>
        <Card icon="📊" title="미실현 수익" value={fmtWon(summary.unrealized_profit)} sub="보유 중" color={clr(summary.unrealized_profit)}/>
        <Card icon="🎯" title="총 수익" value={fmtWon(summary.total_profit)} sub="실현+미실현" color={clr(summary.total_profit)}/>
      </div>}
      <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
        <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>📊 일별 리포트 (최근 30일)</div>
        {rl.length===0?<div style={{textAlign:"center",padding:"30px 0",color:"#556677",fontSize:12}}>리포트 없음</div>
        :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{color:"#556677"}}><td style={{padding:"6px 4px"}}>날짜</td><td>매매</td><td>승</td><td>패</td><td>승률</td><td>수익</td></tr></thead>
        <tbody>{rl.map((r,i)=><tr key={i} style={{background:i%2===0?"rgba(10,18,40,0.5)":"transparent"}}><td style={{padding:"6px 4px",color:"#6688aa",fontFamily:"monospace"}}>{r.report_date?.slice(5)}</td><td style={{color:"#e0e6f0"}}>{r.total_trades}회</td><td style={{color:"#4cff8b"}}>{r.win_count}</td><td style={{color:"#ff4c4c"}}>{r.lose_count}</td><td style={{color:"#ffd54f",fontFamily:"monospace"}}>{r.win_rate}%</td><td style={{color:clr(r.total_profit),fontFamily:"monospace"}}>{fmtWon(r.total_profit)}</td></tr>)}</tbody></table>}
      </div>
    </div>
  );
}

function GrowthPage() {
  const {data:ah,loading} = useApi("/api/portfolio/asset-history", 0);
  const {data:st} = useApi("/api/strategy/", 0);
  if (loading) return <Loader t="성장 여정 로딩..."/>;
  const hist=(ah||[]).sort((a,b)=>a.record_date?.localeCompare(b.record_date));
  const ic=st?.[0]?.initial_capital||1000000;
  const la=hist.length?hist[hist.length-1]?.total_asset:ic;
  const tp=la/1e9*100;
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:24}}>
      <div style={{color:"#e0e6f0",fontWeight:600,fontSize:18,marginBottom:16}}>🎯 100만원 → 10억 여정</div>
      <MiniChart data={hist} width={700} height={200}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:20,gap:16}}>
        {[["시작금액",`${fmt(ic)}원`,"#e0e6f0"],["현재자산",`${fmt(la)}원`,"#4cff8b"],["목표","1,000,000,000원","#ffd54f"],["남은금액",`${fmt(1e9-la)}원`,"#ff9800"]].map(([l,v,c])=><div key={l} style={{flex:1}}><div style={{color:"#556677",fontSize:12}}>{l}</div><div style={{color:c,fontSize:16,fontWeight:600,fontFamily:"monospace"}}>{v}</div></div>)}
      </div>
      <div style={{marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#556677"}}>목표 진행률</span><span style={{color:"#64b5f6"}}>{tp.toFixed(4)}%</span></div><div style={{background:"rgba(10,18,40,0.8)",borderRadius:6,height:10,marginTop:6,overflow:"hidden"}}><div style={{background:"linear-gradient(90deg,#4fc3f7,#4cff8b)",width:`${Math.max(tp,0.1)}%`,minWidth:4,height:"100%",borderRadius:6}}/></div></div>
      <div style={{marginTop:12,color:"#556677",fontSize:12}}>경과일: {hist.length}일</div>
    </div>
  );
}

function ComparePage() {
  const {data,loading,error} = useApi("/api/strategy/compare/all", 0);
  if (loading) return <Loader t="전략 비교 로딩..."/>;
  if (error) return <Err t="전략 비교 조회 실패"/>;
  const sl=data||[];
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:24,textAlign:"center"}}>
      <div style={{color:"#ffd54f",fontSize:16,marginBottom:8}}>📊 전략 비교</div>
      {sl.length<=1&&<div style={{color:"#6688aa",fontSize:13}}>현재 {sl.length===1?`${sl[0]?.strategy?.name}만`:"전략이"} 가동 중</div>}
      {sl.map((item,i)=><div key={i} style={{marginTop:16,background:"rgba(10,18,40,0.5)",borderRadius:8,padding:16,display:"inline-block",minWidth:250}}>
        <div style={{color:"#64b5f6",fontWeight:600}}>{item.strategy?.name}</div>
        <div style={{color:"#6688aa",fontSize:12,marginTop:4}}>ATR×{item.strategy?.atr_multiplier} | 손절 {item.strategy?.stop_loss_pct}%</div>
        <div style={{marginTop:8,display:"flex",gap:16,justifyContent:"center"}}>
          <div><div style={{color:"#556677",fontSize:11}}>총 자산</div><div style={{color:"#4cff8b",fontFamily:"monospace",fontSize:14}}>{fmt(item.total_asset)}원</div></div>
          <div><div style={{color:"#556677",fontSize:11}}>총 수익</div><div style={{color:clr(item.total_profit),fontFamily:"monospace",fontSize:14}}>{fmtWon(item.total_profit)}</div></div>
          <div><div style={{color:"#556677",fontSize:11}}>승률</div><div style={{color:"#ffd54f",fontFamily:"monospace",fontSize:14}}>{item.win_rate}%</div></div>
        </div>
        <div style={{marginTop:8,color:item.strategy?.is_live?"#ff4444":"#ffd54f",fontSize:12}}>{item.strategy?.is_live?"🔴 실전":"🟡 모의"}</div>
      </div>)}
    </div>
  );
}

function StrategyPage() {
  const {data:strategies,loading} = useApi("/api/strategy/", 0);
  if (loading) return <Loader t="전략 로딩..."/>;
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:24}}>
      <h2 style={{color:"#e0e6f0",fontSize:18,margin:"0 0 20px"}}>📖 매매 전략 정리</h2>
      {[{title:"1. 종목 선정 (점수제 100점)",items:["거래량 (30점): 최근 거래량 추세 평가","상승추세 (25점): 가격 변동률 기반","테마/관심도 (20점): 거래대금 기반","기술적 신호 (15점): RSI, MACD 등","수급 (10점): 매수/매도 잔량 비율"],color:"#64b5f6"},
        {title:"2. 매수 타이밍 (눌림목 7가지 신호)",items:["✅ 필수: ATR 범위 내 하락 + 봉차트 반등 패턴","선택: 거래량 감소, MA 지지, RSI 반등, VWAP 지지, 호가창 매수우세","7개 중 필수 2개 포함 4개 이상 → 매수"],color:"#4cff8b"},
        {title:"3. 익절 (트레일링 스톱)",items:["스톱가 = 최고점 - (ATR × 배수)","가격 상승 시 스톱가도 상승","변동성 자동 적응 (ATR 기반)"],color:"#ff9800"},
        {title:"4. 손절 (3단계 안전장치)",items:["1차: VWAP - (ATR × 0.5) 이탈","2차: 5분봉 20MA 2봉 연속 이탈","3차: 매수가 대비 절대 -3%"],color:"#ff4444"},
        {title:"5. 매매 원칙",items:["손실 종목 3일간 재매수 금지","연속 3회 손절 → 당일 매매 중지","수익 = 수수료 + 세금 차감 순수익","수익금 전액 복리 재투자"],color:"#ce93d8"},
      ].map(({title,items,color})=><div key={title} style={{marginBottom:20}}>
        <h3 style={{color,fontSize:15,margin:"0 0 10px",borderLeft:`3px solid ${color}`,paddingLeft:10}}>{title}</h3>
        {items.map((item,i)=><div key={i} style={{color:"#aabbcc",fontSize:13,padding:"4px 0 4px 20px",lineHeight:1.6}}>{item}</div>)}
      </div>)}
      {strategies&&strategies.length>0&&<div style={{borderTop:"1px solid rgba(100,140,200,0.15)",marginTop:20,paddingTop:20}}>
        <h3 style={{color:"#64b5f6",fontSize:15,margin:"0 0 12px"}}>🔧 등록된 전략</h3>
        {strategies.map((s,i)=><div key={i} style={{background:"rgba(10,18,40,0.5)",borderRadius:8,padding:12,marginBottom:8}}>
          <div style={{color:"#e0e6f0",fontWeight:600}}>{s.name}</div>
          <div style={{color:"#6688aa",fontSize:12,marginTop:4}}>ATR×{s.atr_multiplier} | 손절 {s.stop_loss_pct}% | 초기자금 {fmt(s.initial_capital)}원</div>
          <div style={{marginTop:6,color:s.is_live?"#ff4444":"#ffd54f",fontSize:12}}>{s.is_live?"🔴 실전 매매 중":"🟡 모의투자 중"}</div>
        </div>)}
      </div>}
    </div>
  );
}

function SettingsPage() {
  const [dark,setDark] = useState(true);
  const {data:sys} = useApi("/api/system/status", 10000);
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:24}}>
      <h2 style={{color:"#e0e6f0",fontSize:18,margin:"0 0 20px"}}>⚙️ 설정</h2>
      {[["다크/라이트 모드",<button style={{background:dark?"#1a3a6e":"#ddd",color:dark?"#64b5f6":"#333",border:"none",borderRadius:6,padding:"6px 16px",cursor:"pointer"}} onClick={()=>setDark(!dark)}>{dark?"🌙 다크":"☀️ 라이트"}</button>],
        ["카카오톡 알림",<span style={{color:"#4cff8b"}}>ON</span>],
        ["서버 상태",<span style={{color:sys?"#4cff8b":"#ff4444"}}>{sys?"● Running":"● 연결 실패"}</span>],
        ["시장 상태",<span style={{color:sys?.is_market_open?"#4cff8b":"#ff9800"}}>{sys?.market_status||"확인 중..."}</span>],
        ["서버 시간",<span style={{color:"#e0e6f0",fontFamily:"monospace"}}>{sys?.time_kr||"—"}</span>],
        ["공휴일",<span style={{color:"#ffd54f"}}>{sys?.holiday||"없음"}</span>],
        ["다음 장 운영일",<span style={{color:"#64b5f6"}}>{sys?.next_market_day||"—"}</span>],
      ].map(([l,c],i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid rgba(100,140,200,0.1)"}}><span style={{color:"#aabbcc",fontSize:14}}>{l}</span>{c}</div>)}
    </div>
  );
}

// ============================================================
// Main App
// ============================================================
const MENU = [
  {id:"dashboard",icon:"📊",label:"대시보드"},{id:"compare",icon:"⚖️",label:"전략 비교"},
  {id:"portfolio",icon:"💼",label:"보유종목"},{id:"history",icon:"📋",label:"매매이력"},
  {id:"watchlist",icon:"🔍",label:"감시종목"},{id:"performance",icon:"📈",label:"수익분석"},
  {id:"growth",icon:"🎯",label:"성장여정"},{id:"strategy",icon:"📖",label:"전략정리"},
  {id:"settings",icon:"⚙️",label:"설정"},
];

export default function App() {
  const [auth,setAuth]=useState(false),[pw,setPw]=useState(""),[page,setPage]=useState("dashboard"),[sideOpen,setSideOpen]=useState(true);
  const {data:st} = useApi("/api/strategy/", 0);
  const {data:ah} = useApi("/api/portfolio/asset-history", 60000);
  const hist=(ah||[]).sort((a,b)=>a.record_date?.localeCompare(b.record_date));
  const ta=hist.length?hist[hist.length-1]?.total_asset:null;
  const tp=ta?(ta/1e9*100):0;

  const doAuth=async()=>{const r=await api(`/api/auth?password=${encodeURIComponent(pw)}`);r?.authenticated?setAuth(true):alert("비밀번호가 틀렸습니다");};

  if (!auth) return (
    <div style={{background:"radial-gradient(ellipse at 30% 20%,rgba(20,40,80,1) 0%,rgba(8,12,24,1) 70%)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans KR',sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.95),rgba(12,18,38,0.98))",border:"1px solid rgba(100,140,200,0.2)",borderRadius:16,padding:"48px 40px",textAlign:"center",width:340,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
        <div style={{fontSize:40,marginBottom:12}}>💰</div>
        <h1 style={{color:"#e0e6f0",fontSize:20,fontWeight:700,margin:"0 0 6px"}}>10억 만들기</h1>
        <p style={{color:"#6688aa",fontSize:13,margin:"0 0 28px"}}>주식 자동매매 시스템</p>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doAuth()} placeholder="비밀번호 입력" style={{width:"100%",padding:"12px 16px",borderRadius:8,border:"1px solid rgba(100,140,200,0.2)",background:"rgba(10,18,40,0.8)",color:"#e0e6f0",fontSize:15,outline:"none",boxSizing:"border-box",textAlign:"center",letterSpacing:8}}/>
        <button onClick={doAuth} style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#1a5276,#2471a3)",color:"#e0e6f0",fontSize:14,fontWeight:600,cursor:"pointer",marginTop:12}}>접속하기</button>
      </div>
    </div>
  );

  const render=()=>{switch(page){case"dashboard":case"portfolio":case"watchlist":return<DashboardPage/>;case"compare":return<ComparePage/>;case"history":return<HistoryPage/>;case"performance":return<PerformancePage/>;case"growth":return<GrowthPage/>;case"strategy":return<StrategyPage/>;case"settings":return<SettingsPage/>;default:return<DashboardPage/>;}};

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"radial-gradient(ellipse at 30% 20%,rgba(14,24,50,1) 0%,rgba(8,12,24,1) 70%)",fontFamily:"'Noto Sans KR',sans-serif",color:"#e0e6f0"}}>
      <div style={{width:sideOpen?200:56,transition:"width 0.2s",background:"rgba(8,14,30,0.95)",borderRight:"1px solid rgba(100,140,200,0.1)",display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:sideOpen?"16px 16px 12px":"16px 8px 12px",cursor:"pointer"}} onClick={()=>setSideOpen(!sideOpen)}>{sideOpen?<span style={{color:"#ffd54f",fontWeight:700,fontSize:15}}>💰 10억 만들기</span>:<span style={{fontSize:20}}>💰</span>}</div>
        <div style={{borderBottom:"1px solid rgba(100,140,200,0.1)",margin:"0 8px 8px"}}/>
        {MENU.map(m=><div key={m.id} onClick={()=>setPage(m.id)} style={{padding:sideOpen?"10px 16px":"10px 0",cursor:"pointer",background:page===m.id?"rgba(26,58,110,0.6)":"transparent",borderRadius:6,margin:"1px 6px",color:page===m.id?"#64b5f6":"#6688aa",fontSize:13,textAlign:sideOpen?"left":"center",transition:"background 0.15s"}}>{m.icon}{sideOpen?` ${m.label}`:""}</div>)}
        <div style={{flex:1}}/>
        <div style={{borderTop:"1px solid rgba(100,140,200,0.1)",margin:"0 8px",padding:sideOpen?16:8}}>
          {sideOpen&&<><div style={{color:"#556677",fontSize:11}}>총 자산</div><div style={{color:"#4cff8b",fontSize:14,fontWeight:600,fontFamily:"monospace"}}>{ta?`${fmt(ta)}원`:"—"}</div><div style={{color:"#556677",fontSize:11,marginTop:8}}>목표 진행률</div><div style={{background:"rgba(10,18,40,0.8)",borderRadius:6,height:6,marginTop:4,overflow:"hidden"}}><div style={{background:"#64b5f6",width:`${Math.max(tp,0.1)}%`,minWidth:3,height:"100%",borderRadius:6}}/></div><div style={{color:"#445566",fontSize:10,marginTop:3}}>{tp.toFixed(2)}% / 10억</div></>}
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{background:"rgba(8,14,30,0.9)",borderBottom:"1px solid rgba(100,140,200,0.1)",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15}}>{MENU.find(m=>m.id===page)?.icon} {MENU.find(m=>m.id===page)?.label}</div>
          <Clock/>
        </div>
        <div style={{background:"rgba(10,16,32,0.8)",borderBottom:"1px solid rgba(100,140,200,0.1)",padding:"0 20px",display:"flex",gap:0,flexShrink:0}}>
          {(st||[]).length>0?<>{(st||[]).map((s,i)=><div key={i} style={{padding:"10px 20px",fontSize:12,color:"#64b5f6",borderBottom:"2px solid #64b5f6",cursor:"pointer"}}>{s.name} {s.is_live?"🔴":"🟡"}</div>)}</>
          :<div style={{padding:"10px 20px",fontSize:12,color:"#556677"}}>전략 로딩 중...</div>}
        </div>
        <div style={{flex:1,overflow:"auto",padding:16}}>{render()}</div>
      </div>
    </div>
  );
}
