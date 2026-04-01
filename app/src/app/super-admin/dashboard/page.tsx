"use client";

import { useState } from "react";

type Tab = "dashboard" | "companies" | "ads" | "settings";

export default function SuperAdminDashboard() {
  const [tab, setTab] = useState<Tab>("dashboard");

  const stats = [
    { label: "등록 업체", value: "12", color: "text-gray-800" },
    { label: "활성 업체", value: "10", color: "text-emerald-600" },
    { label: "비활성 업체", value: "2", color: "text-red-600" },
    { label: "전체 사용자", value: "47", color: "text-blue-600" },
  ];

  const companies = [
    { no: 1, id: "inche", code: "COM001", name: "인쇄의장", biz: "114-04-56136", rep: "정형호", phone: "02-793-4332", email: "pwindow@naver.com", date: "2026-03-01", status: "active", users: 5 },
    { no: 2, id: "blueprint", code: "COM002", name: "블루프린트 인쇄", biz: "220-15-78901", rep: "김영수", phone: "02-555-1234", email: "blueprint@print.co.kr", date: "2026-03-05", status: "active", users: 8 },
    { no: 3, id: "daehan", code: "COM003", name: "대한출판사", biz: "105-22-33456", rep: "박민호", phone: "02-777-5678", email: "daehan@pub.com", date: "2026-03-10", status: "active", users: 6 },
    { no: 4, id: "seoul", code: "COM004", name: "서울디자인센터", biz: "301-44-55678", rep: "이지은", phone: "02-888-9012", email: "seoul@design.kr", date: "2026-03-15", status: "pending", users: 0 },
    { no: 5, id: "hankook", code: "COM005", name: "한국인쇄공업", biz: "410-55-66789", rep: "최동욱", phone: "031-456-7890", email: "hankook@print.com", date: "2026-03-20", status: "inactive", users: 3 },
  ];

  const statusBadge = (s: string) => {
    if (s === "active") return <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs">활성</span>;
    if (s === "inactive") return <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs">비활성</span>;
    return <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs">대기</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center">
        <h1 className="text-lg font-bold">Platform Admin - <a href="https://blackcopy.kr" className="text-blue-400 no-underline">Blackcopy.kr</a></h1>
        <div className="flex items-center gap-3 text-sm">
          <span>최고관리자</span>
          <a href="/super-admin" className="text-slate-400 hover:text-white">로그아웃</a>
        </div>
      </div>

      {/* 탭 */}
      <div className="bg-slate-800 px-6 flex gap-0">
        {(["dashboard", "companies", "ads", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-3 text-sm font-semibold border-b-[3px] transition ${
              tab === t ? "text-blue-400 border-blue-400" : "text-slate-400 border-transparent hover:text-gray-200 hover:bg-slate-700"
            }`}
          >
            {t === "dashboard" ? "대시보드" : t === "companies" ? "업체관리" : t === "ads" ? "광고관리" : "시스템설정"}
          </button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* 대시보드 */}
        {tab === "dashboard" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {stats.map((s) => (
                <div key={s.label} className="bg-white rounded-lg shadow p-5 text-center">
                  <div className={`text-3xl font-extrabold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">최근 등록 업체</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs border border-gray-300">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="border border-slate-700 px-2 py-2.5">순번</th><th className="border border-slate-700 px-2 py-2.5">업체명</th><th className="border border-slate-700 px-2 py-2.5">대표자</th><th className="border border-slate-700 px-2 py-2.5">연락처</th><th className="border border-slate-700 px-2 py-2.5">등록일</th><th className="border border-slate-700 px-2 py-2.5">상태</th><th className="border border-slate-700 px-2 py-2.5">사용자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c, i) => (
                      <tr key={c.no} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                        <td className="border border-gray-200 px-2 py-2 text-center">{c.no}</td><td className="border border-gray-200 px-2 py-2 text-left">{c.name}</td><td className="border border-gray-200 px-2 py-2 text-center">{c.rep}</td><td className="border border-gray-200 px-2 py-2 text-center">{c.phone}</td><td className="border border-gray-200 px-2 py-2 text-center">{c.date}</td><td className="border border-gray-200 px-2 py-2 text-center">{statusBadge(c.status)}</td><td className="border border-gray-200 px-2 py-2 text-center">{c.users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* 업체관리 */}
        {tab === "companies" && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-800">업체 목록</h3>
              <button className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium">+ 업체 등록</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs border border-gray-300">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="border border-slate-700 px-2 py-2.5">순번</th><th className="border border-slate-700 px-2 py-2.5">업체ID</th><th className="border border-slate-700 px-2 py-2.5">업체코드</th><th className="border border-slate-700 px-2 py-2.5">업체명</th><th className="border border-slate-700 px-2 py-2.5">사업자번호</th><th className="border border-slate-700 px-2 py-2.5">대표자</th><th className="border border-slate-700 px-2 py-2.5">등록일</th><th className="border border-slate-700 px-2 py-2.5">상태</th><th className="border border-slate-700 px-2 py-2.5">사용자</th><th className="border border-slate-700 px-2 py-2.5">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c, i) => (
                    <tr key={c.no} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                      <td className="border border-gray-200 px-2 py-2 text-center">{c.no}</td>
                      <td className="border border-gray-200 px-2 py-2 text-center font-bold">{c.id}</td>
                      <td className="border border-gray-200 px-2 py-2 text-center">{c.code}</td>
                      <td className="border border-gray-200 px-2 py-2 text-left">{c.name}</td>
                      <td className="border border-gray-200 px-2 py-2 text-center">{c.biz}</td>
                      <td className="border border-gray-200 px-2 py-2 text-center">{c.rep}</td>
                      <td className="border border-gray-200 px-2 py-2 text-center">{c.date}</td>
                      <td className="border border-gray-200 px-2 py-2 text-center">{statusBadge(c.status)}</td>
                      <td className="border border-gray-200 px-2 py-2 text-center">{c.users}명</td>
                      <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">
                        <button className="text-emerald-600 border border-emerald-600 px-2 py-0.5 rounded text-xs mr-1">설정</button>
                        <button className="text-blue-600 border border-blue-600 px-2 py-0.5 rounded text-xs mr-1">수정</button>
                        <button className="text-red-600 border border-red-600 px-2 py-0.5 rounded text-xs">정지</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 광고관리 */}
        {tab === "ads" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">배너 광고 관리</h3>
            <p className="text-xs text-gray-500 mb-4">모든 업체 페이지 상단에 표시되는 배너 광고를 관리합니다.</p>
            <div className="bg-gradient-to-r from-slate-800 via-blue-600 to-sky-500 px-6 py-2.5 rounded-md flex justify-between items-center mb-6">
              <span className="text-white text-sm font-bold">인쇄/출력 작업기록, 견적서, 거래명세서, 발주서까지 올인원 업무관리</span>
              <span className="bg-amber-400 text-slate-900 px-3 py-0.5 rounded-full text-xs font-bold">FREE</span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm max-w-lg">
              <div className="flex items-center gap-3"><label className="w-24 text-xs font-semibold text-gray-600">배너 문구</label><input type="text" defaultValue="인쇄/출력 작업기록, 견적서, 거래명세서, 발주서까지 올인원 업무관리" className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div className="flex items-center gap-3"><label className="w-24 text-xs font-semibold text-gray-600">링크 URL</label><input type="text" defaultValue="https://blackcopy.kr" className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div className="flex items-center gap-3"><label className="w-24 text-xs font-semibold text-gray-600">버튼 텍스트</label><input type="text" defaultValue="FREE" className="w-24 px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div className="flex items-center gap-3"><label className="w-24 text-xs font-semibold text-gray-600">배너 표시</label><select className="px-3 py-2 border border-gray-300 rounded text-sm"><option>표시</option><option>숨김</option></select></div>
            </div>
            <button className="mt-4 px-5 py-2 bg-blue-600 text-white rounded text-sm">배너 저장</button>
          </div>
        )}

        {/* 시스템설정 */}
        {tab === "settings" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">시스템 설정</h3>
            <div className="grid grid-cols-1 gap-3 text-sm max-w-lg">
              <div className="flex items-center gap-3"><label className="w-32 text-xs font-semibold text-gray-600">시스템명</label><input type="text" defaultValue="Blackcopy.kr" className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div className="flex items-center gap-3"><label className="w-32 text-xs font-semibold text-gray-600">최대 업체수</label><input type="text" defaultValue="50" className="w-20 px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div className="flex items-center gap-3"><label className="w-32 text-xs font-semibold text-gray-600">업체당 최대 사용자</label><input type="text" defaultValue="10" className="w-20 px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div className="flex items-center gap-3"><label className="w-32 text-xs font-semibold text-gray-600">관리자 ID</label><input type="text" defaultValue="blackcopy2" className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm" /></div>
              <div className="flex items-center gap-3"><label className="w-32 text-xs font-semibold text-gray-600">관리자 비밀번호</label><input type="password" defaultValue="@kingsize2" className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm" /></div>
            </div>
            <button className="mt-4 px-5 py-2 bg-blue-600 text-white rounded text-sm">설정 저장</button>
          </div>
        )}
      </div>
    </div>
  );
}
