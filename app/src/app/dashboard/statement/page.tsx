"use client";

export default function StatementPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-5 print:bg-white print:py-0">
      <div className="max-w-[800px] mx-auto bg-white p-8 md:p-10 shadow print:shadow-none print:p-5">
        <p className="text-sm text-gray-700 mb-5">No. 20260325-6</p>
        <h1 className="text-center text-3xl font-black tracking-[20px] text-gray-800 py-3 border-t-[3px] border-b-[3px] border-double border-gray-800 mb-6">
          거 래 명 세 서
        </h1>

        <div className="flex justify-between mb-4 text-sm">
          <div>
            <p className="mb-1"><strong>납품일: 2026년 03월 25일</strong></p>
            <p className="mb-4"><strong>업체명: 커뮤니크 귀하</strong></p>
            <p>아래와 같이 납품합니다.</p>
          </div>
          <table className="border-collapse text-xs">
            <tbody>
              <tr><th className="border border-gray-800 bg-gray-50 px-2 py-1 w-[70px]">등록번호</th><td className="border border-gray-800 px-2 py-1" colSpan={3}>114-04-56136</td></tr>
              <tr><th className="border border-gray-800 bg-gray-50 px-2 py-1">상호(법인명)</th><td className="border border-gray-800 px-2 py-1">인쇄의장</td><th className="border border-gray-800 bg-gray-50 px-2 py-1">성명</th><td className="border border-gray-800 px-2 py-1">[직인]</td></tr>
              <tr><th className="border border-gray-800 bg-gray-50 px-2 py-1">주소</th><td className="border border-gray-800 px-2 py-1" colSpan={3}>서울특별시 용산구 한강로2가 74-2 성산빌딩2층</td></tr>
              <tr><th className="border border-gray-800 bg-gray-50 px-2 py-1">업태</th><td className="border border-gray-800 px-2 py-1">서비스, 제조</td><th className="border border-gray-800 bg-gray-50 px-2 py-1">종목</th><td className="border border-gray-800 px-2 py-1">출판, 인쇄, 기획</td></tr>
              <tr><th className="border border-gray-800 bg-gray-50 px-2 py-1">TEL / E-mail</th><td className="border border-gray-800 px-2 py-1" colSpan={3}>02-793-4332 / pwindow@naver.com</td></tr>
            </tbody>
          </table>
        </div>

        <p className="text-lg font-extrabold text-gray-800 my-4">작업명: 에스트라 5cm원형 스티커 50개 제작</p>

        <table className="w-full border-collapse text-sm mb-4">
          <thead>
            <tr><th className="border border-gray-800 bg-gray-100 px-2 py-2 w-12">순번</th><th className="border border-gray-800 bg-gray-100 px-2 py-2">품목명(규격)</th><th className="border border-gray-800 bg-gray-100 px-2 py-2 w-14">수량</th><th className="border border-gray-800 bg-gray-100 px-2 py-2 w-16">단가</th><th className="border border-gray-800 bg-gray-100 px-2 py-2 w-20">공급가액</th><th className="border border-gray-800 bg-gray-100 px-2 py-2 w-16">부가세</th></tr>
          </thead>
          <tbody>
            <tr><td className="border border-gray-300 px-2 py-2 text-center">1</td><td className="border border-gray-300 px-2 py-2 text-left">에스트라 5cm원형스티커 50개 제작</td><td className="border border-gray-300 px-2 py-2 text-center">50</td><td className="border border-gray-300 px-2 py-2 text-right"></td><td className="border border-gray-300 px-2 py-2 text-right">54,545</td><td className="border border-gray-300 px-2 py-2 text-right">5,455</td></tr>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <tr key={n}><td className="border border-gray-300 px-2 py-2 text-center">&nbsp;</td><td className="border border-gray-300 px-2 py-2"></td><td className="border border-gray-300 px-2 py-2"></td><td className="border border-gray-300 px-2 py-2"></td><td className="border border-gray-300 px-2 py-2"></td><td className="border border-gray-300 px-2 py-2"></td></tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <table className="border-collapse text-sm">
            <tbody>
              <tr>
                <th className="border border-gray-800 bg-gray-100 px-3 py-2">공급가액 합계</th>
                <td className="border border-gray-800 px-3 py-2 text-right">54,545</td>
                <th className="border border-gray-800 bg-gray-100 px-3 py-2">부가세 합계</th>
                <td className="border border-gray-800 px-3 py-2 text-right">5,455</td>
                <th className="border border-gray-800 bg-gray-100 px-3 py-2">총 합계</th>
                <td className="border border-gray-800 px-3 py-2 text-right font-bold">60,000</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 하단 버튼 (인쇄 시 숨김) */}
      <div className="max-w-[800px] mx-auto mt-3 flex flex-col gap-2 print:hidden">
        <div className="flex gap-2 items-center">
          <label className="text-sm">수신 이메일:</label>
          <input type="email" placeholder="이메일 주소를 입력하세요" className="px-3 py-1.5 border border-gray-300 rounded text-sm w-64" />
          <button className="px-4 py-1.5 bg-gray-700 text-white rounded text-sm">발송</button>
          <span className="text-xs text-gray-400">발신: pwindow@naver.com</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="px-6 py-2 bg-blue-600 text-white rounded text-sm">인쇄</button>
          <button onClick={() => window.close()} className="px-6 py-2 bg-white text-gray-600 border border-gray-300 rounded text-sm">닫기</button>
        </div>
      </div>
    </div>
  );
}
