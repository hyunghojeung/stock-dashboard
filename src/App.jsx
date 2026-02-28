import { useState, useEffect, useCallback } from "react";
import SwingBacktest from "./SwingBacktest";
import PatternDetector from "./PatternDetector";
import VirtualPortfolioTracker from "./VirtualPortfolioTracker";
// ============================================================
// API Helper
// ============================================================
const API_BASE = "https://web-production-139e9.up.railway.app";

async function api(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ============================================================
// 한국 공휴일 DB (2025~2027)
// ============================================================
const KR_HOLIDAYS = {
  "2025-01-01":"신정","2025-01-28":"설날연휴","2025-01-29":"설날","2025-01-30":"설날연휴",
  "2025-03-01":"삼일절","2025-05-05":"어린이날·부처님오신날","2025-05-06":"대체공휴일",
  "2025-06-06":"현충일","2025-08-15":"광복절",
  "2025-10-03":"개천절","2025-10-05":"추석연휴","2025-10-06":"추석","2025-10-07":"추석연휴","2025-10-08":"대체공휴일(추석)",
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
  const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const h=d.getHours(),m=d.getMinutes(),day=d.getDay();
  if (day===0||day===6) return {isOpen:false,status:"휴장 (주말)"};
  if (KR_HOLIDAYS[ds]) return {isOpen:false,status:`휴장 (${KR_HOLIDAYS[ds]})`};
  const isOpen=h>=9&&(h<15||(h===15&&m<=30));
  if (!isOpen) return {isOpen:false,status:h<9?"장 시작 전":"장 마감"};
  return {isOpen:true,status:"장 운영 중"};
}

// ============================================================
// Helpers
// ============================================================
const fmt=(n)=>n?.toLocaleString("ko-KR")??"—";
const fmtWon=(n)=>n!=null?`${n>=0?"+":""}${n.toLocaleString("ko-KR")}원`:"—";
const fmtPct=(n)=>n!=null?`${n>=0?"+":""}${n.toFixed(2)}%`:"—";
const clr=(n)=>n>0?"#4cff8b":n<0?"#ff4c4c":"#8899aa";

// ============================================================
// Hook: useApi
// ============================================================
function useApi(path, interval=60000) {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const load=useCallback(async()=>{
    if(!path){setLoading(false);return;}
    const r=await api(path);
    if(r!==null){setData(r);setError(false);}else{setError(true);}
    setLoading(false);
  },[path]);
  useEffect(()=>{
    load();
    if(interval>0){const t=setInterval(load,interval);return()=>clearInterval(t);}
  },[load,interval]);
  return {data,loading,error,refetch:load};
}

// ============================================================
// UI Components
// ============================================================
function Clock() {
  const [now,setNow]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);
  const ms=getMarketStatus(now);
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

function Loader({t="로딩 중..."}){return <div style={{textAlign:"center",padding:"40px 0",color:"#6688aa",fontSize:13}}>⏳ {t}</div>;}
function Err({t="서버 연결 실패"}){return <div style={{textAlign:"center",padding:"30px 0"}}><div style={{fontSize:28,marginBottom:8}}>⚠️</div><div style={{color:"#ff9800",fontSize:13}}>{t}</div></div>;}

function MiniChart({data,width=500,height=120,color="#4cff8b"}) {
  if(!data||!data.length) return <div style={{color:"#556677",fontSize:12,textAlign:"center",padding:20}}>차트 데이터 없음</div>;
  const vals=data.map(d=>d.total_asset);
  const min=Math.min(...vals)*0.998,max=Math.max(...vals)*1.002,range=max-min||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*width},${height-((v-min)/range)*(height-20)-10}`).join(" ");
  const area=pts+` ${width},${height-5} 0,${height-5}`;
  return (
    <svg width={width} height={height} style={{display:"block"}}>
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={area} fill="url(#cg)"/><polyline points={pts} fill="none" stroke={color} strokeWidth="2"/>
      {vals.map((v,i)=><circle key={i} cx={(i/(vals.length-1))*width} cy={height-((v-min)/range)*(height-20)-10} r="3" fill={color}/>)}
    </svg>
  );
}

function CandleChart({code,width=560,height=280}) {
  const {data:candles}=useApi(code?`/api/stock/minute/${code}`:null,60000);
  const dc=(candles&&candles.length>5)?candles.slice(0,35).reverse():null;
  if(!dc) return <div style={{width,height,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(8,15,30,0.8)",borderRadius:4}}><span style={{color:"#556677",fontSize:12}}>{code?"분봉 데이터 로딩 중...":"종목을 선택하세요"}</span></div>;
  const ap=dc.flatMap(c=>[c.high,c.low]);const mn=Math.min(...ap)-500,mx=Math.max(...ap)+500,rg=mx-mn||1;
  const cw=(width-40)/dc.length;const toY=p=>20+(1-(p-mn)/rg)*(height-60);
  return (
    <svg width={width} height={height} style={{display:"block"}}>
      <rect x="0" y="0" width={width} height={height} fill="rgba(8,15,30,0.8)" rx="4"/>
      {[0.25,0.5,0.75].map(p=><g key={p}><line x1="30" y1={toY(mn+rg*p)} x2={width-10} y2={toY(mn+rg*p)} stroke="rgba(50,70,100,0.3)" strokeDasharray="3,3"/><text x="2" y={toY(mn+rg*p)+4} fill="#445566" fontSize="9" fontFamily="monospace">{fmt(Math.round(mn+rg*p))}</text></g>)}
      {dc.map((c,i)=>{const x=35+i*cw,up=c.close>=c.open,co=up?"#ff4444":"#4488ff",bt=toY(Math.max(c.open,c.close)),bb=toY(Math.min(c.open,c.close)),bh=Math.max(bb-bt,1);return(<g key={i}><line x1={x+cw/2} y1={toY(c.high)} x2={x+cw/2} y2={toY(c.low)} stroke={co} strokeWidth="1"/><rect x={x+1} y={bt} width={cw-2} height={bh} fill={co} rx="1"/><rect x={x+1} y={height-35} width={cw-2} height={Math.min(c.volume/500000*25,25)} fill={co} opacity="0.3"/></g>);})}
    </svg>
  );
}

// ============================================================
// Pages
// ============================================================
function DashboardPage() {
  const mkt=getMarketStatus(new Date());
  const iv=mkt.isOpen?30000:0;
  const {data:trades,loading:tL}=useApi("/api/trades/today",iv);
  const {data:holdings,loading:hL}=useApi("/api/portfolio/holdings",iv);
  const {data:watchlist,loading:wL}=useApi("/api/watchlist/",mkt.isOpen?60000:0);
  const {data:assetHistory}=useApi("/api/portfolio/asset-history",0);
  const {data:summary}=useApi("/api/portfolio/summary",iv);
  const {data:strategies}=useApi("/api/strategy/",0);

  const tList=trades||[],hList=holdings||[],wList=watchlist||[];
  const hist=(assetHistory||[]).sort((a,b)=>a.record_date?.localeCompare(b.record_date));
  const sells=tList.filter(t=>t.trade_type==="sell");
  const todayProfit=sells.reduce((s,t)=>s+(t.net_profit||0),0);
  const wins=sells.filter(t=>(t.net_profit||0)>0).length,losses=sells.filter(t=>(t.net_profit||0)<=0).length;
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
        {/* Chart */}
        <div style={{flex:"1 1 550px",background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div><span style={{color:"#e0e6f0",fontWeight:600,fontSize:15}}>📈 실시간 차트</span><span style={{color:"#6688aa",fontSize:12,marginLeft:12}}>{chartStock?`${chartStock.stock_name} (${chartStock.stock_code})`:"종목 없음"}</span></div>
            {chartStock?.current_price&&<span style={{color:clr(chartStock.unrealized_pct||0),fontSize:16,fontWeight:700,fontFamily:"monospace"}}>{fmt(chartStock.current_price)}원</span>}
          </div>
          <CandleChart code={chartCode}/>
          <div style={{display:"flex",gap:6,marginTop:8}}>{["1분","3분","5분","15분","일봉"].map((tf,i)=><button key={tf} style={{background:i===2?"rgba(79,195,247,0.2)":"transparent",color:i===2?"#4fc3f7":"#556677",border:"1px solid "+(i===2?"rgba(79,195,247,0.3)":"transparent"),borderRadius:6,padding:"4px 12px",fontSize:11,cursor:"pointer"}}>{tf}</button>)}</div>
        </div>

        {/* Watchlist + Holdings */}
        <div style={{flex:"1 1 400px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
            <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>🔍 오늘의 감시 종목</div>
            {!mkt.isOpen?<div style={{textAlign:"center",padding:"20px 0",color:"#6688aa",fontSize:12}}>{mkt.status} — 감시 종목 없음</div>
            :wL?<Loader t="감시종목 로딩..."/>:wList.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#6688aa",fontSize:12}}>감시 종목 없음</div>
            :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:"1px solid rgba(100,140,200,0.2)"}}>{["종목명","현재가","등락률","점수","상태"].map(h=><th key={h} style={{padding:"6px 4px",color:"#6688aa",textAlign:"left"}}>{h}</th>)}</tr></thead>
              <tbody>{wList.map((w,i)=><tr key={i} style={{borderBottom:"1px solid rgba(100,140,200,0.08)"}}><td style={{padding:"6px 4px",color:"#e0e6f0",fontWeight:600}}>{w.stock_name}</td><td style={{color:"#e0e6f0",fontFamily:"monospace"}}>{fmt(w.current_price)}</td><td style={{color:clr(w.change_pct),fontFamily:"monospace"}}>{fmtPct(w.change_pct)}</td><td style={{color:"#ffd54f",fontFamily:"monospace"}}>{w.score}</td><td style={{color:w.status==="매수 완료"?"#4cff8b":w.status==="눌림목 감지"?"#ff9800":"#6688aa"}}>{w.status||"감시 중"}</td></tr>)}</tbody>
            </table>}
          </div>
          <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
            <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>💼 보유 종목</div>
            {hL?<Loader t="보유종목 로딩..."/>:hList.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#6688aa",fontSize:12}}>보유 종목 없음</div>
            :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:"1px solid rgba(100,140,200,0.2)"}}>{["종목","매수가","현재가","수익률","미실현수익"].map(h=><th key={h} style={{padding:"6px 4px",color:"#6688aa",textAlign:"left"}}>{h}</th>)}</tr></thead>
              <tbody>{hList.map((h,i)=><tr key={i} style={{borderBottom:"1px solid rgba(100,140,200,0.08)"}}><td style={{padding:"6px 4px",color:"#e0e6f0",fontWeight:600}}>{h.stock_name}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{fmt(h.buy_price)}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{fmt(h.current_price)}</td><td style={{fontFamily:"monospace",color:clr(h.unrealized_pct)}}>{fmtPct(h.unrealized_pct)}</td><td style={{fontFamily:"monospace",color:clr(h.unrealized_profit)}}>{fmtWon(h.unrealized_profit)}</td></tr>)}</tbody>
            </table>}
          </div>
        </div>
      </div>

      {/* Trade Log + Growth */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 500px",background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
          <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>📋 오늘 매매 로그</div>
          {!mkt.isOpen?<div style={{textAlign:"center",padding:"20px 0",color:"#6688aa",fontSize:12}}>{mkt.status} — 오늘은 매매가 진행되지 않습니다</div>
          :tL?<Loader t="매매 로그 로딩..."/>:tList.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#6688aa",fontSize:12}}>오늘 매매 기록 없음</div>
          :<><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{borderBottom:"1px solid rgba(100,140,200,0.2)"}}>{["시간","구분","종목","매수가","매도가","현재가","순수익"].map(h=><th key={h} style={{padding:"6px 4px",color:"#6688aa",textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>{tList.map((t,i)=><tr key={i} style={{borderBottom:"1px solid rgba(100,140,200,0.08)"}}><td style={{padding:"6px 4px",color:"#6688aa",fontFamily:"monospace"}}>{t.trade_time?.slice(11,16)}</td><td style={{color:t.trade_type==="buy"?"#4cff8b":"#ff4c4c",fontWeight:600}}>{t.trade_type==="buy"?"매수":"매도"}</td><td style={{color:"#e0e6f0"}}>{t.stock_name}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{fmt(t.buy_price)}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{t.sell_price?fmt(t.sell_price):"-"}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{fmt(t.current_price)}</td><td style={{fontFamily:"monospace",color:t.net_profit!=null?clr(t.net_profit):"#334455"}}>{t.net_profit!=null?fmtWon(t.net_profit):"—"}</td></tr>)}</tbody>
          </table>
          <div style={{borderTop:"1px solid rgba(100,140,200,0.15)",marginTop:8,paddingTop:8,display:"flex",gap:20}}>
            <span style={{color:"#6688aa",fontSize:12}}>매매 {sells.length}회 | {wins}승 {losses}패 | 승률 {sells.length?Math.round(wins/sells.length*100):0}%</span>
            <span style={{color:clr(todayProfit),fontSize:13,fontWeight:600,fontFamily:"monospace"}}>실현 순수익: {fmtWon(todayProfit)}</span>
          </div></>}
        </div>
        <div style={{flex:"1 1 400px",background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
          <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>🎯 100만원 → 10억 여정</div>
          <MiniChart data={hist} width={420} height={130}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:12,gap:8}}>
            {[["시작금액",`${fmt(initCap)}원`,"#e0e6f0"],["현재자산",totalAsset?`${fmt(totalAsset)}원`:"—","#4cff8b"],["남은금액",totalAsset?`${fmt(1000000000-totalAsset)}원`:"—","#ffd54f"]].map(([l,v,c])=><div key={l} style={{flex:1}}><div style={{color:"#556677",fontSize:11}}>{l}</div><div style={{color:c,fontSize:13,fontWeight:600,fontFamily:"monospace"}}>{v}</div></div>)}
          </div>
          <div style={{marginTop:10}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:"#556677"}}>목표 진행률</span><span style={{color:"#64b5f6"}}>{tgtPct.toFixed(2)}%</span></div>
            <div style={{background:"rgba(10,18,40,0.8)",borderRadius:6,height:8,marginTop:4,overflow:"hidden"}}><div style={{background:"linear-gradient(90deg,#4fc3f7,#4cff8b)",width:`${Math.max(tgtPct,0.1)}%`,minWidth:4,height:"100%",borderRadius:6}}/></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryPage() {
  const {data,loading,error}=useApi("/api/trades/?limit=100",0);
  if(loading) return <Loader t="매매이력 로딩..."/>;
  if(error) return <Err t="매매이력 조회 실패"/>;
  const tl=data||[];
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
      <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>📋 전체 매매이력 (최근 100건)</div>
      {tl.length===0?<div style={{textAlign:"center",padding:30,color:"#6688aa"}}>매매 기록 없음</div>
      :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr style={{borderBottom:"1px solid rgba(100,140,200,0.2)"}}>{["날짜","시간","구분","종목","매수가","매도가","수량","순수익"].map(h=><th key={h} style={{padding:"6px 4px",color:"#6688aa",textAlign:"left"}}>{h}</th>)}</tr></thead>
        <tbody>{tl.map((t,i)=><tr key={i} style={{borderBottom:"1px solid rgba(100,140,200,0.08)",background:i%2===0?"rgba(10,18,40,0.3)":"transparent"}}><td style={{padding:"6px 4px",color:"#6688aa",fontFamily:"monospace"}}>{t.trade_time?.slice(0,10)}</td><td style={{color:"#6688aa",fontFamily:"monospace"}}>{t.trade_time?.slice(11,16)}</td><td style={{color:t.trade_type==="buy"?"#4cff8b":"#ff4c4c",fontWeight:600}}>{t.trade_type==="buy"?"매수":"매도"}</td><td style={{color:"#e0e6f0"}}>{t.stock_name}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{fmt(t.buy_price)}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{t.sell_price?fmt(t.sell_price):"-"}</td><td style={{color:"#e0e6f0"}}>{t.quantity}</td><td style={{fontFamily:"monospace",color:t.net_profit!=null?clr(t.net_profit):"#334455"}}>{t.net_profit!=null?fmtWon(t.net_profit):"—"}</td></tr>)}</tbody>
      </table>}
    </div>
  );
}

function WatchlistPage() {
  const {data,loading}=useApi("/api/watchlist/",60000);
  if(loading) return <Loader t="감시종목 로딩..."/>;
  const wl=data||[];
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
      <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>🔍 감시종목</div>
      {wl.length===0?<div style={{textAlign:"center",padding:30,color:"#6688aa"}}>감시 종목 없음</div>
      :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr style={{borderBottom:"1px solid rgba(100,140,200,0.2)"}}>{["종목명","종목코드","현재가","등락률","점수","상태","등록시간"].map(h=><th key={h} style={{padding:"8px 4px",color:"#6688aa",textAlign:"left"}}>{h}</th>)}</tr></thead>
        <tbody>{wl.map((w,i)=><tr key={i} style={{borderBottom:"1px solid rgba(100,140,200,0.08)"}}><td style={{padding:"8px 4px",color:"#e0e6f0",fontWeight:600}}>{w.stock_name}</td><td style={{color:"#6688aa",fontFamily:"monospace"}}>{w.stock_code}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{fmt(w.current_price)}</td><td style={{fontFamily:"monospace",color:clr(w.change_pct)}}>{fmtPct(w.change_pct)}</td><td style={{color:"#ffd54f",fontFamily:"monospace",fontWeight:600}}>{w.score}</td><td style={{color:w.status==="매수 완료"?"#4cff8b":"#6688aa"}}>{w.status||"감시 중"}</td><td style={{color:"#556677",fontFamily:"monospace"}}>{w.created_at?.slice(11,16)}</td></tr>)}</tbody>
      </table>}
    </div>
  );
}

function PortfolioPage() {
  const {data,loading}=useApi("/api/portfolio/holdings",30000);
  if(loading) return <Loader t="보유종목 로딩..."/>;
  const hl=data||[];
  const total=hl.reduce((s,h)=>s+(h.unrealized_profit||0),0);
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div style={{color:"#e0e6f0",fontWeight:600,fontSize:15}}>💼 보유종목</div><div style={{color:clr(total),fontFamily:"monospace",fontSize:14}}>미실현 합계: {fmtWon(total)}</div></div>
      {hl.length===0?<div style={{textAlign:"center",padding:30,color:"#6688aa"}}>보유 종목 없음</div>
      :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr style={{borderBottom:"1px solid rgba(100,140,200,0.2)"}}>{["종목","매수가","현재가","수량","수익률","미실현수익","매수시간"].map(h=><th key={h} style={{padding:"8px 4px",color:"#6688aa",textAlign:"left"}}>{h}</th>)}</tr></thead>
        <tbody>{hl.map((h,i)=><tr key={i} style={{borderBottom:"1px solid rgba(100,140,200,0.08)"}}><td style={{padding:"8px 4px",color:"#e0e6f0",fontWeight:600}}>{h.stock_name}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{fmt(h.buy_price)}</td><td style={{fontFamily:"monospace",color:"#e0e6f0"}}>{fmt(h.current_price)}</td><td style={{color:"#e0e6f0"}}>{h.quantity}</td><td style={{fontFamily:"monospace",color:clr(h.unrealized_pct)}}>{fmtPct(h.unrealized_pct)}</td><td style={{fontFamily:"monospace",color:clr(h.unrealized_profit)}}>{fmtWon(h.unrealized_profit)}</td><td style={{color:"#556677",fontFamily:"monospace"}}>{h.buy_time?.slice(11,16)}</td></tr>)}</tbody>
      </table>}
    </div>
  );
}

function PerformancePage() {
  const {data:reports,loading:rL}=useApi("/api/portfolio/daily-report",0);
  const {data:summary}=useApi("/api/portfolio/summary",0);
  if(rL) return <Loader t="수익 분석 로딩..."/>;
  const rl=reports||[];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <Card icon="📊" title="총 매매 횟수" value={summary?.total_trades?`${summary.total_trades}회`:"—"} color="#64b5f6"/>
        <Card icon="🏆" title="승률" value={summary?.win_rate?`${summary.win_rate}%`:"—"} color="#ffd54f"/>
        <Card icon="💰" title="총 수익" value={summary?.total_profit!=null?fmtWon(summary.total_profit):"—"} color={clr(summary?.total_profit)}/>
      </div>
      <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:16}}>
        <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:12}}>📈 일별 수익 리포트</div>
        {rl.length===0?<div style={{textAlign:"center",padding:30,color:"#6688aa"}}>리포트 데이터 없음</div>
        :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:"1px solid rgba(100,140,200,0.2)"}}>{["날짜","매매수","승","패","승률","순수익"].map(h=><th key={h} style={{padding:"6px 4px",color:"#6688aa",textAlign:"left"}}>{h}</th>)}</tr></thead>
          <tbody>{rl.map((r,i)=><tr key={i} style={{background:i%2===0?"rgba(10,18,40,0.5)":"transparent"}}><td style={{padding:"6px 4px",color:"#6688aa",fontFamily:"monospace"}}>{r.report_date?.slice(5)}</td><td style={{color:"#e0e6f0"}}>{r.total_trades}회</td><td style={{color:"#4cff8b"}}>{r.win_count}</td><td style={{color:"#ff4c4c"}}>{r.lose_count}</td><td style={{color:"#ffd54f",fontFamily:"monospace"}}>{r.win_rate}%</td><td style={{color:clr(r.total_profit),fontFamily:"monospace"}}>{fmtWon(r.total_profit)}</td></tr>)}</tbody>
        </table>}
      </div>
    </div>
  );
}

function GrowthPage() {
  const {data:ah,loading}=useApi("/api/portfolio/asset-history",0);
  const {data:st}=useApi("/api/strategy/",0);
  if(loading) return <Loader t="성장 여정 로딩..."/>;
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
  const {data,loading,error}=useApi("/api/strategy/compare/all",0);
  if(loading) return <Loader t="전략 비교 로딩..."/>;
  if(error) return <Err t="전략 비교 조회 실패"/>;
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

// ============================================================
// StrategyPage — 눌림목 + 갭상승 탭
// ============================================================
function StrategyPage() {
  const [tab,setTab]=useState("overview");
  const {data:strategies,loading}=useApi("/api/strategy/",0);
  if(loading) return <Loader t="전략 정보 로딩..."/>;
  const tabs=[{id:"overview",label:"📊 전체 요약",color:"#64b5f6"},{id:"dip",label:"📉 눌림목전략",color:"#4cff8b"},{id:"gap",label:"📈 갭상승전략",color:"#ffd54f"}];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:4,padding:4,background:"rgba(10,18,40,0.6)",borderRadius:10,border:"1px solid rgba(100,140,200,0.1)"}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 16px",background:tab===t.id?"rgba(26,58,110,0.6)":"transparent",color:tab===t.id?t.color:"#556677",border:tab===t.id?`1px solid ${t.color}33`:"1px solid transparent",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:tab===t.id?600:400,fontFamily:"'Noto Sans KR',sans-serif",transition:"all 0.2s"}}>{t.label}</button>)}
      </div>
      {tab==="overview"&&<StrategyOverviewTab/>}
      {tab==="dip"&&<DipStrategyTab/>}
      {tab==="gap"&&<GapStrategyTab/>}
    </div>
  );
}

function StrategyOverviewTab() {
  const strats=[
    {name:"눌림목전략 (Dip-Buy)",icon:"📉",status:"가동 중",sc:"#4cff8b",desc:"장 시작 30분 후 분봉 데이터 축적 → 7가지 복합 신호로 눌림목 감지 → 자동 매수",time:"09:30 ~ 15:00",signals:"ATR범위내하락, 봉차트반등, 거래량감소, MA지지, RSI반등, VWAP지지, 호가매수우세",exit:"트레일링 스톱 + 3단계 손절"},
    {name:"갭상승전략 (Gap-Up)",icon:"📈",status:"가동 중",sc:"#ffd54f",desc:"전일 종가 대비 +2% 이상 갭상승 종목 → 장 초반 초기 눌림 후 돌파 시 매수",time:"09:00 ~ 09:30",signals:"갭비율 2~15%, 거래량급증, 시가지지, 초기눌림반등, 호가매수우세",exit:"빠른 트레일링 스톱 (ATR×1.2) + 갭하단 손절"}
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        {strats.map((s,i)=><div key={i} style={{flex:"1 1 340px",background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:`1px solid ${s.sc}22`,borderRadius:12,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{color:"#e0e6f0",fontWeight:600,fontSize:15}}>{s.icon} {s.name}</div><span style={{padding:"3px 10px",borderRadius:12,fontSize:11,fontWeight:600,background:`${s.sc}15`,color:s.sc,border:`1px solid ${s.sc}33`}}>{s.status}</span></div>
          <div style={{color:"#8899aa",fontSize:12,lineHeight:1.6,marginBottom:14}}>{s.desc}</div>
          {[["매매 시간대",s.time],["매수 신호",s.signals],["매도 전략",s.exit]].map(([l,v])=><div key={l} style={{marginBottom:8}}><div style={{color:"#556677",fontSize:11,marginBottom:2}}>{l}</div><div style={{color:s.sc,fontSize:12,fontFamily:"monospace"}}>{v}</div></div>)}
        </div>)}
      </div>
      <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:20}}>
        <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:16}}>⏱️ 시간대별 전략 운영</div>
        <div style={{position:"relative",height:80}}>
          <div style={{position:"absolute",top:28,left:0,right:0,height:24,background:"rgba(10,18,40,0.6)",borderRadius:12}}/>
          <div style={{position:"absolute",top:28,left:"0%",width:"7.7%",height:24,background:"linear-gradient(90deg,#ffd54f33,#ffd54f55)",borderRadius:"12px 0 0 12px",borderRight:"2px solid #ffd54f"}}/>
          <div style={{position:"absolute",top:8,left:"0%",color:"#ffd54f",fontSize:11,fontWeight:600}}>갭상승</div>
          <div style={{position:"absolute",top:28,left:"7.7%",width:"7.7%",height:24,background:"rgba(100,140,200,0.1)",borderRight:"1px dashed rgba(100,140,200,0.3)"}}/>
          <div style={{position:"absolute",top:56,left:"7.7%",color:"#556677",fontSize:10}}>데이터 축적</div>
          <div style={{position:"absolute",top:28,left:"15.4%",width:"84.6%",height:24,background:"linear-gradient(90deg,#4cff8b33,#4cff8b22)",borderRadius:"0 12px 12px 0"}}/>
          <div style={{position:"absolute",top:8,left:"15.4%",color:"#4cff8b",fontSize:11,fontWeight:600}}>눌림목</div>
          {["09:00","09:15","09:30","12:00","15:00","15:30"].map((t,i)=>{const pos=[0,3.85,7.7,46,92.3,100];return <div key={t} style={{position:"absolute",bottom:-4,left:`${pos[i]}%`,color:"#445566",fontSize:9,fontFamily:"monospace",transform:i>0&&i<5?"translateX(-50%)":i===5?"translateX(-100%)":"none"}}>{t}</div>;})}
        </div>
      </div>
      <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:20}}>
        <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15,marginBottom:16}}>🔧 공통 시스템 구조</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
          {[["야간 스캔","18:00 전종목 분석 → 후보 선별","#64b5f6"],["감시종목","08:30 후보 최종 확인 → 5~10개 확정","#4fc3f7"],["종목 점수제","거래량30 + 추세25 + 테마20 + 기술15 + 수급10","#81c784"],["카카오 알림","매수/매도/시스템 이벤트 실시간 알림","#ffd54f"],["리스크 관리","일일 최대 손실 한도 + 연패 자동 중지","#ff4444"],["수수료 계산","매수 0.015% + 매도 0.015% + 세금 0.18%","#ff9800"]].map(([t,d,c])=><div key={t} style={{flex:"1 1 200px",padding:12,background:"rgba(10,18,40,0.5)",borderRadius:8,borderLeft:`3px solid ${c}`}}><div style={{color:c,fontSize:12,fontWeight:600,marginBottom:4}}>{t}</div><div style={{color:"#8899aa",fontSize:11,lineHeight:1.5}}>{d}</div></div>)}
        </div>
      </div>
    </div>
  );
}

function StrategySection({sections}) {
  return sections.map((s,idx)=><div key={idx} style={{marginBottom:16,padding:14,background:"rgba(10,18,40,0.4)",borderRadius:8,borderLeft:`3px solid ${s.color}`}}><div style={{color:s.color,fontWeight:600,fontSize:14,marginBottom:8}}>{s.title}</div>{s.items.map((item,i)=><div key={i} style={{color:"#aabbcc",fontSize:12,lineHeight:1.8,paddingLeft:12,position:"relative"}}><span style={{position:"absolute",left:0,color:s.color}}>•</span>{item}</div>)}</div>);
}

function DipStrategyTab() {
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:24}}>
      <h2 style={{color:"#e0e6f0",fontSize:18,margin:"0 0 20px"}}>📉 눌림목전략 상세 (Dip-Buy Strategy)</h2>
      <StrategySection sections={[
        {title:"1. 종목 선정 (점수제 100점)",color:"#64b5f6",items:["거래량 (30점): 최근 거래량 추세 평가","상승추세 (25점): 가격 변동률 기반","테마/관심도 (20점): 거래대금 기반","기술적 신호 (15점): RSI, MACD 등","수급 (10점): 매수/매도 잔량 비율"]},
        {title:"2. 매수 타이밍 (7가지 복합 신호)",color:"#4cff8b",items:["✅ 필수: ATR 범위 내 하락 + 봉차트 반등 패턴","선택: 거래량 감소, MA 지지, RSI 반등, VWAP 지지, 호가창 매수우세","7개 중 필수 2개 포함 4개 이상 → 매수"]},
        {title:"3. 봉차트 패턴 점수",color:"#ffd54f",items:["반등: 샛별형(+30), 상승장악형(+25), 망치형(+20), 상승잉태형(+15), 역망치형(+10)","하락: 하락장악형(차단), 저녁별형(차단), 교수형(-20)"]},
        {title:"4. 익절 (트레일링 스톱)",color:"#ff9800",items:["스톱가 = 최고점 - (ATR × 배수)","가격 상승 시 스톱가도 상승 (절대 하락 안 함)","변동성 자동 적응 (ATR 기반)"]},
        {title:"5. 손절 (3단계 안전장치)",color:"#ff4444",items:["1차: VWAP - (ATR × 0.5) 이탈","2차: 5분봉 20MA 2봉 연속 이탈","3차: 매수가 대비 절대 -3% (최후 안전장치)"]},
        {title:"6. 매매 시간",color:"#ce93d8",items:["매수 가능: 09:30 ~ 14:30 (분봉 데이터 축적 후)","매도 가능: 09:30 ~ 15:20","15:20 이후 보유종목 → 강제 청산"]}
      ]}/>
    </div>
  );
}

function GapStrategyTab() {
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:24}}>
      <h2 style={{color:"#e0e6f0",fontSize:18,margin:"0 0 20px"}}>📈 갭상승전략 상세 (Gap-Up Strategy)</h2>
      <div style={{background:"rgba(255,213,79,0.08)",border:"1px solid rgba(255,213,79,0.2)",borderRadius:8,padding:14,marginBottom:20}}>
        <div style={{color:"#ffd54f",fontSize:13,fontWeight:600,marginBottom:6}}>💡 전략 핵심</div>
        <div style={{color:"#aabbcc",fontSize:12,lineHeight:1.7}}>전일 종가 대비 +2% 이상 갭상승한 종목 중, 장 초반 9:00~9:30 시간대에 초기 눌림 후 반등하는 종목을 포착하여 매수합니다. 눌림목전략이 분봉 데이터를 축적하는 동안(09:00~09:30) 공백을 메우는 보완 전략입니다.</div>
      </div>
      <StrategySection sections={[
        {title:"1. 갭상승 종목 필터링",color:"#ffd54f",items:["갭비율: 전일 종가 대비 시가 +2% ~ +15%","거래량: 전일 평균 거래량 대비 200% 이상","시가총액: 1,000억 이상 (잡주 제외)","갭이 너무 크면(+15% 초과) 제외 — 급등주 추격 방지"]},
        {title:"2. 매수 타이밍 (5가지 신호)",color:"#4cff8b",items:["✅ 필수: 갭비율 2~15% + 거래량 급증","선택: 시가 지지 (시가 밑으로 안 빠짐)","선택: 초기 눌림 후 반등 (고점 대비 1~3% 하락 후 양봉)","선택: 호가창 매수 우세 (매수잔량 > 매도잔량 × 1.5)","5개 중 필수 2개 포함 3개 이상 → 매수"]},
        {title:"3. 진입 가격 계산",color:"#64b5f6",items:["기본: 현재가 (시장가 매수)","갭 하단 지지: 시가 - (시가 × 0.5%)","ATR 기반 스톱가 계산: 매수가 - (ATR × 1.0)"]},
        {title:"4. 익절 (빠른 트레일링 스톱)",color:"#ff9800",items:["스톱가 = 최고점 - (ATR × 1.2) — 눌림목보다 타이트","갭상승은 빠른 움직임 → 빠른 수익 확정이 핵심","갭비율의 50% 수익 달성 시 스톱가 공격적으로 올림"]},
        {title:"5. 손절 (갭 기반 안전장치)",color:"#ff4444",items:["1차: 시가(갭 하단) 이탈 시 즉시 손절","2차: 매수가 대비 -2% (눌림목보다 타이트한 손절)","갭을 메우는 방향으로 가면 → 전략 실패, 즉시 청산"]},
        {title:"6. 매매 시간",color:"#ce93d8",items:["매수 가능: 09:05 ~ 09:25 (장 초반 5분은 변동성 회피)","매도 가능: 09:05 ~ 09:35","09:30 이후 보유종목 → 눌림목전략으로 이관 또는 청산"]}
      ]}/>
      <div style={{marginTop:8,padding:14,background:"rgba(10,18,40,0.4)",borderRadius:8,borderLeft:"3px solid #64b5f6"}}>
        <div style={{color:"#64b5f6",fontWeight:600,fontSize:14,marginBottom:12}}>📊 눌림목 vs 갭상승 비교</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:"1px solid rgba(100,140,200,0.2)"}}>{["항목","눌림목전략","갭상승전략"].map(h=><th key={h} style={{padding:"8px 6px",color:"#6688aa",fontWeight:600,textAlign:"left"}}>{h}</th>)}</tr></thead>
          <tbody>{[["매매 시간","09:30 ~ 15:00","09:05 ~ 09:30"],["매수 조건","7가지 신호 중 4개+","5가지 신호 중 3개+"],["트레일링 ATR","ATR × 2.0","ATR × 1.2"],["절대 손절","-3%","-2%"],["목표 수익","중기 (수시간)","단기 (수십분)"],["특징","안정적, 데이터 기반","빠른 판단, 모멘텀 활용"]].map(([k,v1,v2],i)=><tr key={i} style={{borderBottom:"1px solid rgba(100,140,200,0.08)"}}><td style={{padding:"8px 6px",color:"#6688aa"}}>{k}</td><td style={{padding:"8px 6px",color:"#4cff8b",fontFamily:"monospace"}}>{v1}</td><td style={{padding:"8px 6px",color:"#ffd54f",fontFamily:"monospace"}}>{v2}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsPage() {
  const {data:sys}=useApi("/api/system/status",10000);
  return (
    <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))",border:"1px solid rgba(100,140,200,0.15)",borderRadius:12,padding:24}}>
      <div style={{color:"#e0e6f0",fontWeight:600,fontSize:18,marginBottom:20}}>⚙️ 설정</div>
      {[["카카오톡 알림",<span style={{color:"#4cff8b"}}>ON</span>],
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
const MENU=[
  {id:"dashboard",icon:"📊",label:"대시보드"},
  {id:"compare",icon:"⚖️",label:"전략 비교"},
  {id:"history",icon:"📋",label:"매매이력"},
  {id:"watchlist",icon:"🔍",label:"감시종목"},
  {id:"performance",icon:"📈",label:"수익분석"},
  {id:"growth",icon:"🎯",label:"성장여정"},
  {id:"strategy",icon:"📖",label:"전략정리"},
   {id:"swing",icon:"📊",label:"스윙백테스트"},
  {id:"pattern",icon:"🔍",label:"패턴탐지기"},
  {id:"virtual-portfolio",icon:"📊",label:"실시간 추적"},
  {id:"settings",icon:"⚙️",label:"설정"},

];

export default function App() {
  const [auth,setAuth]=useState(true);
  const [pw,setPw]=useState("");
  const [page,setPage]=useState("dashboard");
  const [sideOpen,setSideOpen]=useState(true);
  const {data:st}=useApi("/api/strategy/",0);
  const {data:ah}=useApi("/api/portfolio/asset-history",60000);
  const hist=(ah||[]).sort((a,b)=>a.record_date?.localeCompare(b.record_date));
  const ta=hist.length?hist[hist.length-1]?.total_asset:null;
  const tp=ta?(ta/1e9*100):0;

  const doLogin=async()=>{
    const r=await api(`/api/auth?password=${pw}`);
    if(r&&r.authenticated) setAuth(true);
    else alert("비밀번호가 틀렸습니다");
  };

  if(!auth) return (
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 30% 20%,rgba(14,24,50,1) 0%,rgba(8,12,24,1) 70%)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"linear-gradient(135deg,rgba(25,35,65,0.95),rgba(15,22,48,0.98))",border:"1px solid rgba(100,140,200,0.2)",borderRadius:16,padding:40,textAlign:"center",width:340}}>
        <div style={{fontSize:40,marginBottom:12}}>💰</div>
        <div style={{color:"#e0e6f0",fontSize:20,fontWeight:700,marginBottom:4}}>10억 만들기</div>
        <div style={{color:"#6688aa",fontSize:12,marginBottom:24}}>한국 주식 자동매매 시스템</div>
        <input value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()} type="password" placeholder="비밀번호 입력" style={{width:"100%",padding:"12px 16px",background:"rgba(10,18,40,0.8)",border:"1px solid rgba(100,140,200,0.2)",borderRadius:8,color:"#e0e6f0",fontSize:14,marginBottom:12,outline:"none"}}/>
        <button onClick={doLogin} style={{width:"100%",padding:"12px",background:"linear-gradient(135deg,#1a3a6e,#2a5098)",color:"#e0e6f0",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>로그인</button>
      </div>
    </div>
  );

  const render=()=>{
    switch(page){
      case "dashboard": return <DashboardPage/>;
      case "compare": return <ComparePage/>;
      case "history": return <HistoryPage/>;
      case "watchlist": return <WatchlistPage/>;
      case "portfolio": return <PortfolioPage/>;
      case "performance": return <PerformancePage/>;
      case "growth": return <GrowthPage/>;
      case "strategy": return <StrategyPage/>;
      case "swing": return <SwingBacktest/>;
      case "settings": return <SettingsPage/>;
      case "pattern": return <PatternDetector/>;
      case "virtual-portfolio": return <VirtualPortfolioTracker/>;
      default: return <DashboardPage/>;
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 30% 20%,rgba(14,24,50,1) 0%,rgba(8,12,24,1) 70%)",fontFamily:"'Noto Sans KR',sans-serif",color:"#e0e6f0",display:"flex"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:rgba(10,18,40,0.5);}::-webkit-scrollbar-thumb{background:rgba(100,140,200,0.3);border-radius:3px;}`}</style>
      {/* Sidebar */}
      <div style={{width:sideOpen?200:60,background:"rgba(8,14,30,0.95)",borderRight:"1px solid rgba(100,140,200,0.1)",display:"flex",flexDirection:"column",transition:"width 0.2s",flexShrink:0}}>
        <div style={{padding:sideOpen?"16px 16px 12px":"16px 8px 12px",cursor:"pointer"}} onClick={()=>setSideOpen(!sideOpen)}>{sideOpen?<span style={{color:"#ffd54f",fontWeight:700,fontSize:15}}>💰 10억 만들기</span>:<span style={{fontSize:20}}>💰</span>}</div>
        <div style={{borderBottom:"1px solid rgba(100,140,200,0.1)",margin:"0 8px 8px"}}/>
        {MENU.map(m=><div key={m.id} onClick={()=>setPage(m.id)} style={{padding:sideOpen?"10px 16px":"10px 0",cursor:"pointer",background:page===m.id?"rgba(26,58,110,0.6)":"transparent",borderRadius:6,margin:"1px 6px",color:page===m.id?"#64b5f6":"#6688aa",fontSize:13,textAlign:sideOpen?"left":"center",transition:"background 0.15s"}}>{m.icon}{sideOpen?` ${m.label}`:""}</div>)}
        <div style={{flex:1}}/>
        <div style={{borderTop:"1px solid rgba(100,140,200,0.1)",margin:"0 8px",padding:sideOpen?16:8}}>
          {sideOpen&&<><div style={{color:"#556677",fontSize:11}}>총 자산</div><div style={{color:"#4cff8b",fontSize:14,fontWeight:600,fontFamily:"monospace"}}>{ta?`${fmt(ta)}원`:"—"}</div><div style={{color:"#556677",fontSize:11,marginTop:8}}>목표 진행률</div><div style={{background:"rgba(10,18,40,0.8)",borderRadius:6,height:6,marginTop:4,overflow:"hidden"}}><div style={{background:"#64b5f6",width:`${Math.max(tp,0.1)}%`,minWidth:3,height:"100%",borderRadius:6}}/></div><div style={{color:"#445566",fontSize:10,marginTop:3}}>{tp.toFixed(2)}% / 10억</div></>}
        </div>
      </div>
      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{background:"rgba(8,14,30,0.9)",borderBottom:"1px solid rgba(100,140,200,0.1)",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{color:"#e0e6f0",fontWeight:600,fontSize:15}}>{MENU.find(m=>m.id===page)?.icon} {MENU.find(m=>m.id===page)?.label}</div>
          <Clock/>
        </div>
        <div style={{background:"rgba(10,16,32,0.8)",borderBottom:"1px solid rgba(100,140,200,0.1)",padding:"0 20px",display:"flex",gap:0,flexShrink:0}}>
          {(st||[]).length>0?(st||[]).map((s,i)=><div key={i} style={{padding:"10px 20px",fontSize:12,color:"#64b5f6",borderBottom:"2px solid #64b5f6",cursor:"pointer"}}>{s.name} {s.is_live?"🔴":"🟡"}</div>)
          :<div style={{padding:"10px 20px",fontSize:12,color:"#556677"}}>전략 로딩 중...</div>}
        </div>
        <div style={{flex:1,overflow:"auto",padding:16}}>{render()}</div>
      </div>
    </div>
  );
}
