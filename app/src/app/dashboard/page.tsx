"use client";

import { useState } from "react";

export default function DashboardPage() {
  const [category, setCategory] = useState("전체");
  const [searchField, setSearchField] = useState("전체");
  const [searchKeyword, setSearchKeyword] = useState("");

  // 가상 데이터 (DB 연동 전)
  const orders = [
    { no: 1, client: "커뮤니크", orderer: "한지원", contact: "010-5324-6492", title: "에스트라 5cm원형 스티커 50개 제작", amount: 60000, productType: "유포지+원형컷팅", payment: "", status: "progress" },
    { no: 2, client: "행정공제회", orderer: "이현진", contact: "010-2204-4252", title: "에너지절약 실천을 위한 국민행동지침 포스터", amount: 180000, productType: "반광인화지출력", payment: "", status: "progress" },
    { no: 3, client: "한화에어로스페이스", orderer: "송승민 주임", contact: "010-8803-2799", title: "K9자주포 2차 성능개량 체계개발 규격3차", amount: 1130580, productType: "무선", payment: "카드결재완료", status: "complete" },
    { no: 4, client: "경주이씨재사당공파노전종회", orderer: "이재철", contact: "010-9354-3778", title: "우리의 조상 팜플렛", amount: 495000, productType: "중철", payment: "", status: "progress" },
    { no: 5, client: "유니트플레이", orderer: "", contact: "010-5651-0118", title: "유포지출력", amount: 40000, productType: "", payment: "", status: "progress" },
    { no: 6, client: "방위사업청", orderer: "임은영 중령", contact: "02-2079-5112", title: "★★RFP구축합(KDD)상세설계 및 선도합 건조", amount: 500280, productType: "무선제본", payment: "", status: "progress" },
    { no: 7, client: "LS E-Link", orderer: "박정길", contact: "010-8950-0248", title: "LS E-Link 회사소개서", amount: 990000, productType: "중철제본", payment: "", status: "progress" },
    { no: 8, client: "아모레 퍼시픽", orderer: "한울팀 육인화", contact: "010-6773-6630", title: "드롭한울_최종인쇄파일", amount: 48000, productType: "리플렛", payment: "카드", status: "complete" },
    { no: 9, client: "주식회사 환경NPS", orderer: "김영인 선생님", contact: "010-4767-5136", title: "분리배출 퍼즐 도무송 및 출력 2차", amount: 884500, productType: "과천", payment: "", status: "complete" },
    { no: 10, client: "(주)고전정보통신", orderer: "서선배대표", contact: "010-4788-0175", title: "(주)고전정보통신_명함2종", amount: 71060, productType: "명함", payment: "", status: "progress" },
  ];

  function toggleStatus(index: number) {
    // 실제 구현 시 API 호출
  }

  return (
    <div>
      {/* 필터/검색 영역 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option>전체</option>
          <option>블랙카피</option>
          <option>출력실</option>
          <option>디자인실</option>
        </select>

        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" defaultValue="2025-03-01" className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <span className="text-gray-400 text-xs">~</span>
          <input type="date" defaultValue="2026-03-31" className="px-2 py-1.5 border border-gray-300 rounded text-xs" />
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs"
          >
            <option>전체</option>
            <option>거래처</option>
            <option>주문자</option>
            <option>연락처</option>
            <option>제목</option>
          </select>
          <input
            type="text"
            placeholder="검색어 입력"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs w-40"
          />
          <button className="px-4 py-1.5 bg-gray-700 text-white rounded text-xs font-medium">검색</button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 text-xs">
          <thead>
            <tr className="bg-[#3b4b5b] text-white">
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">순번</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">거래처</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">주문자</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">연락처</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">제목</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">금액</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">제품형태</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">결제</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">진행상태</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">거래명세서</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 text-center whitespace-nowrap">견적서</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, i) => (
              <tr key={order.no} className={`${i % 2 === 1 ? "bg-gray-50" : "bg-white"} hover:bg-blue-50 transition`}>
                <td className="border border-gray-200 px-2 py-2 text-center">{order.no}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">
                  <a href={`/dashboard/write?id=${order.no}`} className="text-gray-700 hover:text-blue-600 hover:underline">
                    {order.client}
                  </a>
                </td>
                <td className="border border-gray-200 px-2 py-2 text-left">{order.orderer}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">{order.contact}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">
                  <a href={`/dashboard/write?id=${order.no}`} className="text-gray-700 hover:text-blue-600 hover:underline">
                    {order.title}
                  </a>
                </td>
                <td className="border border-gray-200 px-2 py-2 text-right">{order.amount.toLocaleString()}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{order.productType}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{order.payment}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">
                  <button
                    onClick={() => toggleStatus(i)}
                    className={`text-xs font-semibold cursor-pointer select-none ${
                      order.status === "progress" ? "text-blue-600" : "text-red-600"
                    }`}
                  >
                    {order.status === "progress" ? "진행중" : "완료"}
                  </button>
                </td>
                <td className="border border-gray-200 px-2 py-2 text-center">
                  <a
                    href={`/dashboard/statement?id=${order.no}`}
                    target="_blank"
                    className="px-2 py-0.5 border border-gray-300 rounded text-xs text-gray-500 hover:text-blue-600 hover:border-blue-500 transition"
                  >
                    명세서
                  </a>
                </td>
                <td className="border border-gray-200 px-2 py-2 text-center">
                  <a
                    href={`/dashboard/estimate?id=${order.no}`}
                    target="_blank"
                    className="px-2 py-0.5 border border-gray-300 rounded text-xs text-gray-500 hover:text-red-600 hover:border-red-500 transition"
                  >
                    견적서
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이징 */}
      <div className="flex items-center justify-center gap-1 mt-4 text-sm text-gray-500">
        <span className="text-xs text-gray-400 mr-2">40개씩 보기</span>
        {[1, 2, 3, 4, 5].map((p) => (
          <a
            key={p}
            href="#"
            className={`px-2.5 py-1 rounded border text-xs ${
              p === 1
                ? "bg-blue-600 text-white border-blue-600"
                : "border-gray-300 text-gray-500 hover:bg-gray-100"
            }`}
          >
            {p}
          </a>
        ))}
        <span className="ml-2 text-xs">/ 5 페이지</span>
      </div>
    </div>
  );
}
