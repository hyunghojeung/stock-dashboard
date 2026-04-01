"use client";

import { useState } from "react";

type View = "list" | "write" | "view" | "edit";

export default function MemoPage() {
  const [view, setView] = useState<View>("list");
  const [searchKeyword, setSearchKeyword] = useState("");

  const memos = [
    { no: 8, title: "4월 용지 발주 현황 정리", author: "정형호", date: "2026-03-31" },
    { no: 7, title: "커뮤니크 스티커 - 유포지 재고 확인", author: "김민수", date: "2026-03-30" },
    { no: 6, title: "방위사업청 제본 규격 B5로 변경됨", author: "이지연", date: "2026-03-29" },
    { no: 5, title: "LS E-Link 회사소개서 - 중철제본 40p", author: "박준혁", date: "2026-03-28" },
    { no: 4, title: "아모레퍼시픽 리플렛 - 칼라 양면 인쇄", author: "최윤아", date: "2026-03-27" },
    { no: 3, title: "코팅기 점검 일정 안내", author: "정형호", date: "2026-03-26" },
    { no: 2, title: "경주이씨 팜플렛 - 중철 32p 작업 메모", author: "김민수", date: "2026-03-25" },
    { no: 1, title: "3월 작업 일지 정리", author: "정형호", date: "2026-03-24" },
  ];

  if (view === "write") {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">메모 작성</h3>
          <label className="block text-xs font-semibold text-gray-600 mb-1">제목</label>
          <input type="text" placeholder="제목을 입력하세요" className="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-3" />
          <label className="block text-xs font-semibold text-gray-600 mb-1">내용</label>
          <textarea placeholder="내용을 입력하세요" className="w-full px-3 py-2 border border-gray-300 rounded text-sm min-h-[200px] resize-y mb-3" />
          <div className="flex gap-2">
            <button className="px-6 py-2 bg-emerald-600 text-white rounded text-sm">저장</button>
            <button onClick={() => setView("list")} className="px-6 py-2 bg-white text-gray-600 border border-gray-300 rounded text-sm">취소</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "view") {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-2">4월 용지 발주 현황 정리</h3>
          <p className="text-xs text-gray-400 mb-4 pb-3 border-b border-gray-200">작성자: 정형호 | 작성일: 2026-03-31</p>
          <div className="text-sm text-gray-700 leading-7 whitespace-pre-wrap min-h-[150px] mb-5">
{`4월 용지 발주를 위해 현재 재고를 정리합니다.

■ 모조지
- 80g: 재고 2,000매 → 3,000매 추가 발주 필요
- 100g: 재고 1,500매 → 충분

■ 아트지
- 150g: 재고 500매 → 2,000매 추가 발주 필요

발주 마감일: 4월 2일까지`}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView("list")} className="px-6 py-2 bg-white text-gray-600 border border-gray-300 rounded text-sm">목록</button>
            <button onClick={() => setView("edit")} className="px-6 py-2 bg-emerald-600 text-white rounded text-sm">수정</button>
            <button className="px-6 py-2 bg-red-600 text-white rounded text-sm" onClick={() => { if(confirm("정말 삭제할까요?")) setView("list"); }}>삭제</button>
          </div>
        </div>
      </div>
    );
  }

  // 리스트
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          <input type="text" placeholder="제목 또는 내용 검색" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded text-sm w-52" />
          <button className="px-4 py-1.5 bg-gray-700 text-white rounded text-xs">검색</button>
        </div>
        <button onClick={() => setView("write")} className="px-5 py-2 bg-emerald-600 text-white rounded text-sm font-medium">+ 메모 작성</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 text-xs">
          <thead>
            <tr className="bg-[#3b4b5b] text-white">
              <th className="border border-[#2d3a47] px-2 py-2.5 w-12">번호</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">제목</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-20">작성자</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-24">작성일</th>
            </tr>
          </thead>
          <tbody>
            {memos.map((m, i) => (
              <tr key={m.no} className={`${i % 2 === 1 ? "bg-gray-50" : "bg-white"} hover:bg-blue-50 cursor-pointer transition`} onClick={() => setView("view")}>
                <td className="border border-gray-200 px-2 py-2 text-center">{m.no}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">{m.title}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{m.author}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{m.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-1 mt-4">
        {[1, 2, 3].map((p) => (
          <a key={p} href="#" className={`px-2.5 py-1 rounded border text-xs ${p === 1 ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-300 text-gray-500"}`}>{p}</a>
        ))}
        <span className="ml-2 text-xs text-gray-400">/ 3 페이지</span>
      </div>
    </div>
  );
}
