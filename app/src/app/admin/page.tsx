"use client";

import { useState } from "react";

type Tab = "notice" | "users" | "category" | "client" | "supplier" | "template" | "company";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("notice");

  const tabs: { key: Tab; label: string }[] = [
    { key: "notice", label: "작업전달" },
    { key: "users", label: "사용자관리" },
    { key: "category", label: "카테고리관리" },
    { key: "client", label: "거래처관리" },
    { key: "supplier", label: "발주처관리" },
    { key: "template", label: "양식폼관리" },
    { key: "company", label: "업체정보설정" },
  ];

  return (
    <div>
      {/* 탭 네비게이션 */}
      <div className="bg-white border-b-2 border-gray-200 px-4 flex gap-0 overflow-x-auto mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 md:px-6 py-3 text-xs md:text-sm font-semibold border-b-[3px] whitespace-nowrap transition ${
              tab === t.key ? "text-blue-600 border-blue-600" : "text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-5xl mx-auto">
        {/* ===== 작업전달 ===== */}
        {tab === "notice" && <NoticeTab />}
        {tab === "users" && <UsersTab />}
        {tab === "category" && <CategoryTab />}
        {tab === "client" && <ClientTab />}
        {tab === "supplier" && <SupplierTab />}
        {tab === "template" && <TemplateTab />}
        {tab === "company" && <CompanyTab />}
      </div>
    </div>
  );
}

function NoticeTab() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-base font-bold text-gray-800 mb-2 pb-2 border-b-2 border-gray-200">작업전달</h3>
      <p className="text-xs text-gray-500 mb-1">작성된 글은 리스트 화면 상단에 빨간색으로 깜빡이며 표시됩니다.</p>
      <p className="text-xs text-gray-500 mb-4">작업을 완료한 누군가가 작업완료 버튼을 클릭해야 작업표시가 사라집니다.</p>

      <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-5">
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-600 mb-1">제목</label>
          <input type="text" placeholder="작업전달 제목을 입력하세요" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-600 mb-1">본문</label>
          <textarea placeholder="작업전달 내용을 입력하세요" className="w-full px-3 py-2 border border-gray-300 rounded text-sm min-h-[100px] resize-y" />
        </div>
        <button className="px-5 py-2 bg-blue-600 text-white rounded text-sm">작업전달 등록</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs border border-gray-300">
          <thead>
            <tr className="bg-[#3b4b5b] text-white">
              <th className="border border-[#2d3a47] px-2 py-2.5 w-10">순번</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">제목</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-24">작성일</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-16">작성자</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-24">관리</th>
            </tr>
          </thead>
          <tbody>
            {[
              { no: 1, title: "긴급! 내일까지 커뮤니크 스티커 작업 완료 요망", date: "2026-03-31", author: "정형호", urgent: true },
              { no: 2, title: "방위사업청 제본 작업 - 규격 변경 안내", date: "2026-03-30", author: "정형호", urgent: false },
              { no: 3, title: "4월 용지 발주 목록 정리", date: "2026-03-28", author: "정형호", urgent: false },
            ].map((n, i) => (
              <tr key={n.no} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                <td className="border border-gray-200 px-2 py-2 text-center">{n.no}</td>
                <td className={`border border-gray-200 px-2 py-2 text-left ${n.urgent ? "font-semibold text-red-600" : ""}`}>{n.title}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{n.date}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{n.author}</td>
                <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">
                  <button className="text-blue-600 border border-blue-600 px-2 py-0.5 rounded text-xs mr-1">수정</button>
                  <button className="text-red-600 border border-red-600 px-2 py-0.5 rounded text-xs">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersTab() {
  const users = [
    { no: 1, uid: "admin01", name: "정형호", role: "admin", date: "2026-03-01" },
    { no: 2, uid: "minsu", name: "김민수", role: "user", date: "2026-03-05" },
    { no: 3, uid: "jiyeon", name: "이지연", role: "user", date: "2026-03-05" },
    { no: 4, uid: "junhyuk", name: "박준혁", role: "user", date: "2026-03-10" },
    { no: 5, uid: "yoona", name: "최윤아", role: "user", date: "2026-03-12" },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">사용자 관리</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs border border-gray-300">
          <thead>
            <tr className="bg-[#3b4b5b] text-white">
              <th className="border border-[#2d3a47] px-2 py-2.5 w-10">순번</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">사용자ID</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">이름</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-16">권한</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-24">등록일</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-24">관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.no} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                <td className="border border-gray-200 px-2 py-2 text-center">{u.no}</td>
                <td className="border border-gray-200 px-2 py-2 text-center font-bold">{u.uid}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{u.name}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${u.role === "admin" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                    {u.role === "admin" ? "관리자" : "사용자"}
                  </span>
                </td>
                <td className="border border-gray-200 px-2 py-2 text-center">{u.date}</td>
                <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">
                  {u.role !== "admin" && (
                    <>
                      <button className="text-blue-600 border border-blue-600 px-2 py-0.5 rounded text-xs mr-1">수정</button>
                      <button className="text-red-600 border border-red-600 px-2 py-0.5 rounded text-xs">삭제</button>
                    </>
                  )}
                  {u.role === "admin" && <span className="text-gray-400">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="mt-4 px-5 py-2 bg-blue-600 text-white rounded text-sm">+ 사용자 추가</button>
    </div>
  );
}

function CategoryTab() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">카테고리 관리</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs border border-gray-300 max-w-md">
          <thead>
            <tr className="bg-[#3b4b5b] text-white">
              <th className="border border-[#2d3a47] px-2 py-2.5 w-10">순번</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">카테고리명</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-24">관리</th>
            </tr>
          </thead>
          <tbody>
            {["블랙카피", "출력실", "디자인실"].map((c, i) => (
              <tr key={c} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                <td className="border border-gray-200 px-2 py-2 text-center">{i + 1}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{c}</td>
                <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">
                  <button className="text-blue-600 border border-blue-600 px-2 py-0.5 rounded text-xs mr-1">수정</button>
                  <button className="text-red-600 border border-red-600 px-2 py-0.5 rounded text-xs">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-4">
        <input type="text" placeholder="카테고리명 입력" className="px-3 py-1.5 border border-gray-300 rounded text-sm" />
        <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm">+ 카테고리 추가</button>
      </div>
    </div>
  );
}

function ClientTab() {
  const clients = [
    { no: 1, name: "커뮤니크", person: "한지원", phone: "02-1234-5678", mobile: "010-5324-6492", email: "hanjiwon@communique.co.kr" },
    { no: 2, name: "행정공제회", person: "이현진", phone: "02-2345-6789", mobile: "010-2204-4252", email: "lee@geps.or.kr" },
    { no: 3, name: "한화에어로스페이스", person: "송승민 주임", phone: "02-3456-7890", mobile: "010-8803-2799", email: "song@hanwha.com" },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">거래처 관리</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs border border-gray-300">
          <thead>
            <tr className="bg-[#3b4b5b] text-white">
              <th className="border border-[#2d3a47] px-2 py-2.5 w-10">순번</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">회사명</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">담당자</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">전화</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">핸드폰</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">이메일</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-24">관리</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c, i) => (
              <tr key={c.no} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                <td className="border border-gray-200 px-2 py-2 text-center">{c.no}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">{c.name}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{c.person}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{c.phone}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{c.mobile}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">{c.email}</td>
                <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">
                  <button className="text-blue-600 border border-blue-600 px-2 py-0.5 rounded text-xs mr-1">수정</button>
                  <button className="text-red-600 border border-red-600 px-2 py-0.5 rounded text-xs">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="mt-4 px-5 py-2 bg-blue-600 text-white rounded text-sm">+ 거래처 등록</button>
    </div>
  );
}

function SupplierTab() {
  const suppliers = [
    { no: 1, name: "천지페이퍼", person: "김종현", phone: "02-2040-4719", fax: "02-2040-4720", email: "cheonji@paper.co.kr" },
    { no: 2, name: "(주)대흥지류", person: "백승한", phone: "02-3456-7890", fax: "02-3456-7891", email: "baek@daeheung.com" },
    { no: 3, name: "삼원특수지", person: "이상호", phone: "02-5678-1234", fax: "02-5678-1235", email: "lee@samwon.co.kr" },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-base font-bold text-gray-800 mb-2 pb-2 border-b-2 border-gray-200">발주처 관리</h3>
      <p className="text-xs text-gray-500 mb-4">발주처는 거래처와 별도로 관리됩니다.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs border border-gray-300">
          <thead>
            <tr className="bg-[#3b4b5b] text-white">
              <th className="border border-[#2d3a47] px-2 py-2.5 w-10">순번</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">발주처명</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">담당자</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">전화</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">팩스</th>
              <th className="border border-[#2d3a47] px-2 py-2.5">이메일</th>
              <th className="border border-[#2d3a47] px-2 py-2.5 w-24">관리</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s, i) => (
              <tr key={s.no} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                <td className="border border-gray-200 px-2 py-2 text-center">{s.no}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">{s.name}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{s.person}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{s.phone}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{s.fax}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">{s.email}</td>
                <td className="border border-gray-200 px-2 py-2 text-center whitespace-nowrap">
                  <button className="text-blue-600 border border-blue-600 px-2 py-0.5 rounded text-xs mr-1">수정</button>
                  <button className="text-red-600 border border-red-600 px-2 py-0.5 rounded text-xs">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="mt-4 px-5 py-2 bg-blue-600 text-white rounded text-sm">+ 발주처 등록</button>
    </div>
  );
}

function TemplateTab() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-base font-bold text-gray-800 mb-2 pb-2 border-b-2 border-gray-200">표양식관리</h3>
      <p className="text-xs text-gray-500 mb-4">양식을 만들면 사용자가 주문서 입력 시 선택할 수 있습니다.</p>

      {["부가세포함", "제본용", "브로셔용", "옵셋용"].map((name) => (
        <div key={name} className="flex justify-between items-center p-3 border border-gray-200 rounded mb-2 hover:bg-gray-50">
          <div>
            <span className="font-semibold text-sm text-gray-800">{name}</span>
            <span className="text-xs text-gray-400 ml-2">{name === "부가세포함" ? "순번, 품목명, 규격, 부수, 페이지수, 단가, 공급가, 부가세, 합계" : "(미설정)"}</span>
          </div>
          <div className="flex gap-1">
            <button className="text-blue-600 border border-blue-600 px-2 py-0.5 rounded text-xs">편집</button>
            <button className="text-red-600 border border-red-600 px-2 py-0.5 rounded text-xs">삭제</button>
          </div>
        </div>
      ))}

      <div className="flex gap-2 mt-4">
        <input type="text" placeholder="새 양식 이름" className="px-3 py-1.5 border border-gray-300 rounded text-sm" />
        <button className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm">+ 양식 추가</button>
      </div>
    </div>
  );
}

function CompanyTab() {
  return (
    <div>
      <div className="bg-white rounded-lg shadow p-6 mb-5">
        <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">회사 기본정보</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            ["업체코드", "COM001", true], ["업체명", "인쇄의장", false],
            ["사업자번호", "114-04-56136", false], ["대표자", "정형호", false],
            ["연락처", "02-793-4332", false], ["팩스", "027934338", false],
            ["이메일", "pwindow@naver.com", false], ["업태", "서비스, 제조", false],
            ["업체 ID", "inche", false], ["비밀번호", "********", false],
          ].map(([label, value, readOnly]) => (
            <div key={label as string} className="flex items-center gap-2">
              <label className="w-20 text-xs font-semibold text-gray-600 shrink-0">{label as string}</label>
              <input type={label === "비밀번호" ? "password" : "text"} defaultValue={value as string} readOnly={readOnly as boolean} className={`flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm ${readOnly ? "bg-gray-100 text-gray-400" : ""}`} />
            </div>
          ))}
          <div className="flex items-center gap-2 md:col-span-2">
            <label className="w-20 text-xs font-semibold text-gray-600 shrink-0">주소</label>
            <input type="text" defaultValue="서울특별시 용산구 한강로2가 74-2 성산빌딩2층" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <label className="w-20 text-xs font-semibold text-gray-600 shrink-0">종목</label>
            <input type="text" defaultValue="출판, 인쇄, 기획" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-5">
        <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">이메일 발송 설정</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm max-w-2xl">
          <div className="flex items-center gap-2 md:col-span-2">
            <label className="w-24 text-xs font-semibold text-gray-600 shrink-0">메일 서비스</label>
            <select className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"><option>네이버 메일</option><option>다음(카카오) 메일</option></select>
          </div>
          <div className="flex items-center gap-2"><label className="w-24 text-xs font-semibold text-gray-600 shrink-0">발신 이메일</label><input type="text" defaultValue="pwindow@naver.com" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" /></div>
          <div className="flex items-center gap-2"><label className="w-24 text-xs font-semibold text-gray-600 shrink-0">메일 아이디</label><input type="text" defaultValue="pwindow" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" /></div>
          <div className="flex items-center gap-2 md:col-span-2"><label className="w-24 text-xs font-semibold text-gray-600 shrink-0">메일 비밀번호</label><input type="password" defaultValue="********" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm max-w-xs" /></div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-5">
        <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">Dropbox API 설정</h3>
        <div className="grid grid-cols-1 gap-3 text-sm max-w-2xl">
          <div className="flex items-center gap-2"><label className="w-24 text-xs font-semibold text-gray-600 shrink-0">App Key</label><input type="text" placeholder="Dropbox App Key" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" /></div>
          <div className="flex items-center gap-2"><label className="w-24 text-xs font-semibold text-gray-600 shrink-0">App Secret</label><input type="password" placeholder="Dropbox App Secret" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" /></div>
          <div className="flex items-center gap-2"><label className="w-24 text-xs font-semibold text-gray-600 shrink-0">Access Token</label><input type="password" placeholder="Dropbox Access Token" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" /></div>
          <div className="flex items-center gap-2"><label className="w-24 text-xs font-semibold text-gray-600 shrink-0">저장 경로</label><input type="text" defaultValue="/인쇄의장/attachments" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" /></div>
        </div>
        <p className="text-xs text-gray-400 mt-2"><a href="/dropbox-guide" className="text-blue-500">Dropbox API 키 발급 가이드 보기</a></p>
      </div>

      <div className="flex justify-center py-3">
        <button className="px-10 py-2.5 bg-blue-600 text-white rounded text-sm font-medium">저장</button>
      </div>
    </div>
  );
}
