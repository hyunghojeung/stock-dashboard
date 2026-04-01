"use client";

import { useState } from "react";

type View = "list" | "write" | "print";

export default function OrdersPage() {
  const [view, setView] = useState<View>("list");

  const orders = [
    { no: 1, poNo: "O20260330-2", date: "2026/03/30 -2", supplier: "천지페이퍼", person: "정형호", paper: "드라이보루지 1800g [0] 외 2건" },
    { no: 2, poNo: "O20260330-1", date: "2026/03/30 -1", supplier: "천지페이퍼", person: "정형호", paper: "드라이보루지 1800g [0] 외 1건" },
    { no: 3, poNo: "O20260327-1", date: "2026/03/27 -1", supplier: "(주)대흥지류", person: "백승한", paper: "100g 미색모조 [자가]" },
    { no: 4, poNo: "O20260324-2", date: "2026/03/24 -2", supplier: "(주)대흥지류", person: "백승한", paper: "150g스노우 [자가] 외 1건" },
    { no: 5, poNo: "O20260324-1", date: "2026/03/24 -1", supplier: "(주)대흥지류", person: "백승한", paper: "250g 스노우 [자가]" },
  ];

  if (view === "write") {
    return (
      <div className="max-w-5xl mx-auto">
        <h2 className="text-base font-bold text-gray-800 mb-3">발주서입력</h2>
        <div className="bg-white border border-gray-300 rounded p-4 mb-3">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="w-[70px] font-semibold text-gray-600 text-xs py-1">발주No.</td>
                <td className="py-1"><input type="text" readOnly className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-gray-100 text-gray-400" value="자동생성" /></td>
                <td className="w-[60px] font-semibold text-gray-600 text-xs py-1 text-right pr-2">일자</td>
                <td className="py-1"><input type="date" defaultValue="2026-04-01" className="px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
              </tr>
              <tr>
                <td className="font-semibold text-gray-600 text-xs py-1">
                  <button className="px-2 py-0.5 bg-gray-700 text-white rounded text-xs">발주처</button>
                </td>
                <td className="py-1">
                  <select className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                    <option>발주처 선택</option><option>천지페이퍼</option><option>(주)대흥지류</option><option>삼원특수지</option><option>한솔제지</option>
                  </select>
                </td>
                <td className="font-semibold text-gray-600 text-xs py-1 text-right pr-2">발주자</td>
                <td className="py-1"><input type="text" placeholder="발주자" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
              </tr>
              <tr>
                <td className="font-semibold text-gray-600 text-xs py-1">연락처</td>
                <td colSpan={3} className="py-1"><input type="text" placeholder="연락처" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
              </tr>
              <tr>
                <td className="font-semibold text-gray-600 text-xs py-1 align-top pt-2">요청사항</td>
                <td colSpan={3} className="py-1"><textarea placeholder="요청사항을 입력하세요" className="w-full px-2 py-2 border border-gray-300 rounded text-sm min-h-[80px] resize-y" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 품목 테이블 */}
        <div className="overflow-x-auto mb-3">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-200 px-2 py-2 w-[35px]">순번</th>
                <th className="border border-gray-200 px-2 py-2">품목명</th>
                <th className="border border-gray-200 px-2 py-2 w-[90px]">규격(원지)</th>
                <th className="border border-gray-200 px-2 py-2 w-[70px]">종이결</th>
                <th className="border border-gray-200 px-2 py-2 w-[80px]">재단코기</th>
                <th className="border border-gray-200 px-2 py-2 w-[80px]">주문수량</th>
                <th className="border border-gray-200 px-2 py-2 w-[70px]">입고</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((num) => (
                <tr key={num}>
                  <td className="border border-gray-200 px-1 py-1 text-center">{num}</td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs" /></td>
                  <td className="border border-gray-200 px-1 py-1">
                    <select className="w-full py-1 border border-gray-200 rounded text-xs"><option value="">선택</option><option>4X6 전지</option><option>국전</option><option>소국전</option></select>
                  </td>
                  <td className="border border-gray-200 px-1 py-1">
                    <select className="w-full py-1 border border-gray-200 rounded text-xs"><option value="">선택</option><option>횡목</option><option>종목</option></select>
                  </td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-center" /></td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-center" /></td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-center" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 py-3">
          <button className="px-6 py-2 bg-gray-700 text-white rounded text-sm font-medium">저장</button>
          <button className="px-6 py-2 bg-white text-gray-600 border border-gray-300 rounded text-sm">발주서 복사</button>
          <button onClick={() => setView("list")} className="px-6 py-2 bg-white text-gray-600 border border-gray-300 rounded text-sm">리스트</button>
          <button className="px-6 py-2 bg-red-600 text-white rounded text-sm" onClick={() => { if(confirm("정말 삭제할까요?")) setView("list"); }}>삭제</button>
        </div>
      </div>
    );
  }

  // 리스트 뷰
  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
        <div className="flex gap-2 items-center">
          <input type="date" defaultValue="2025-04-01" className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <span className="text-gray-400 text-xs">~</span>
          <input type="date" defaultValue="2026-04-01" className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
        </div>
        <button onClick={() => setView("write")} className="px-5 py-2 bg-gray-700 text-white rounded text-sm font-medium">+ 발주서 작성</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 text-xs">
          <thead>
            <tr className="bg-[#3b4b5b] text-white">
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center w-8"></th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">발주No.</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">일자-No.</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">발주처명</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">담당자명</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">용지종류 및 평량</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center w-12">인쇄</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={o.no} className={`${i % 2 === 1 ? "bg-gray-50" : "bg-white"} hover:bg-blue-50 transition`}>
                <td className="border border-gray-200 px-2 py-2 text-center">{o.no}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">
                  <button onClick={() => setView("write")} className="text-gray-700 hover:text-blue-600 hover:underline">{o.poNo}</button>
                </td>
                <td className="border border-gray-200 px-2 py-2 text-center">{o.date}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">{o.supplier}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{o.person}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">{o.paper}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">
                  <button onClick={() => setView("print")} className="px-2 py-0.5 bg-red-600 text-white rounded text-xs">인쇄</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
