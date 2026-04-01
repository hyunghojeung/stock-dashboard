"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WritePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    orderer: "", contact: "", email: "", clientName: "",
    productType: "", title: "", category: "블랙카피",
    tradeType: "vat", taxInvoice: "", payment: "",
    paperType: "", color: "", printSide: "", copies: "",
    binding: "", paperSize: "", coating: "", finishing: "",
    detailSpec: "",
  });
  const [templateType, setTemplateType] = useState("부가세포함");

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-base font-bold text-gray-800 mb-3">주문서입력</h2>

      {/* 기본 정보 */}
      <div className="bg-white border border-gray-300 rounded p-4 mb-3">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="w-[70px] font-semibold text-gray-600 text-xs py-1">주문No.</td>
              <td className="py-1"><input type="text" readOnly className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-gray-100 text-gray-400" value="자동생성" /></td>
              <td className="w-[60px] font-semibold text-gray-600 text-xs py-1 text-right pr-2">작성일</td>
              <td className="py-1 whitespace-nowrap">
                <input type="date" defaultValue="2026-04-01" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
              </td>
            </tr>
            <tr>
              <td className="font-semibold text-gray-600 text-xs py-1">주문자</td>
              <td className="py-1"><input type="text" placeholder="주문자" value={formData.orderer} onChange={(e) => handleChange("orderer", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
              <td className="font-semibold text-gray-600 text-xs py-1 text-right pr-2">연락처</td>
              <td className="py-1"><input type="text" placeholder="연락처" value={formData.contact} onChange={(e) => handleChange("contact", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
            </tr>
            <tr>
              <td className="font-semibold text-gray-600 text-xs py-1">
                <button type="button" className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs">거래처</button>
              </td>
              <td className="py-1"><input type="text" placeholder="거래처" value={formData.clientName} onChange={(e) => handleChange("clientName", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
              <td className="font-semibold text-gray-600 text-xs py-1 text-right pr-2">이메일</td>
              <td className="py-1"><input type="text" placeholder="이메일 주소" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
            </tr>
            <tr>
              <td className="font-semibold text-gray-600 text-xs py-1">카테고리</td>
              <td className="py-1">
                <select value={formData.category} onChange={(e) => handleChange("category", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option>블랙카피</option><option>출력실</option><option>디자인실</option>
                </select>
              </td>
              <td className="font-semibold text-gray-600 text-xs py-1 text-right pr-2">제품형태</td>
              <td className="py-1"><input type="text" placeholder="제품형태" value={formData.productType} onChange={(e) => handleChange("productType", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
            </tr>
            <tr>
              <td className="font-semibold text-gray-600 text-xs py-1">세금계산서</td>
              <td className="py-1"><input type="text" placeholder="발행일 직접 입력" value={formData.taxInvoice} onChange={(e) => handleChange("taxInvoice", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
              <td className="font-semibold text-gray-600 text-xs py-1 text-right pr-2">결제</td>
              <td className="py-1"><input type="text" placeholder="결제 정보" value={formData.payment} onChange={(e) => handleChange("payment", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
            </tr>
            <tr>
              <td className="font-semibold text-gray-600 text-xs py-1">제목</td>
              <td className="py-1"><input type="text" placeholder="제목" value={formData.title} onChange={(e) => handleChange("title", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" /></td>
              <td className="font-semibold text-gray-600 text-xs py-1 text-right pr-2">거래유형</td>
              <td className="py-1">
                <select value={formData.tradeType} onChange={(e) => handleChange("tradeType", e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="vat">부가세율 적용</option><option value="novat">부가세율 미적용</option>
                </select>
              </td>
            </tr>
            <tr>
              <td className="font-semibold text-gray-600 text-xs py-1">첨부</td>
              <td colSpan={3} className="py-1">
                <div className="border-2 border-dashed border-gray-300 rounded p-3 md:p-4 text-center text-gray-400 text-xs cursor-pointer hover:border-blue-500 hover:text-blue-500 transition">
                  + 파일을 드래그하여 놓거나 클릭하여 첨부 (최대 1GB, Dropbox)
                </div>
              </td>
            </tr>
            <tr>
              <td className="font-semibold text-gray-600 text-xs py-1 align-top pt-2">세부사양/<br/>후가공</td>
              <td colSpan={3} className="py-1">
                <textarea placeholder="세부사양 및 후가공 내용을 입력하세요" value={formData.detailSpec} onChange={(e) => handleChange("detailSpec", e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded text-sm min-h-[120px] resize-y" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 작업내용 */}
      <div className="bg-white border border-gray-300 rounded p-4 mb-3">
        <p className="font-bold text-sm text-gray-800 mb-3 pb-2 border-b border-gray-200">작업내용</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-semibold text-gray-600 shrink-0">용지</label>
            <select value={formData.paperType} onChange={(e) => handleChange("paperType", e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="">선택</option><option>모조</option><option>스노우</option><option>아트지</option><option>아르떼</option><option>펄지</option><option>CCP</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-semibold text-gray-600 shrink-0">색상</label>
            <select value={formData.color} onChange={(e) => handleChange("color", e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="">선택</option><option>칼라</option><option>흑백</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-semibold text-gray-600 shrink-0">인쇄면</label>
            <select value={formData.printSide} onChange={(e) => handleChange("printSide", e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="">선택</option><option>양면</option><option>단면</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-semibold text-gray-600 shrink-0">부수</label>
            <input type="text" placeholder="부수 입력" value={formData.copies} onChange={(e) => handleChange("copies", e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-semibold text-gray-600 shrink-0">제본방식</label>
            <select value={formData.binding} onChange={(e) => handleChange("binding", e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="">선택</option><option>무선제본</option><option>중철</option><option>스프링</option><option>인쇄만</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-semibold text-gray-600 shrink-0">사이즈</label>
            <select value={formData.paperSize} onChange={(e) => handleChange("paperSize", e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="">선택</option><option>직접입력</option><option>A4</option><option>A3</option><option>A2</option><option>190x260</option><option>465x315</option><option>A5</option><option>B4</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-semibold text-gray-600 shrink-0">코팅</label>
            <select value={formData.coating} onChange={(e) => handleChange("coating", e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="">선택</option><option>무광</option><option>유광</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-semibold text-gray-600 shrink-0">후가공</label>
            <select value={formData.finishing} onChange={(e) => handleChange("finishing", e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
              <option value="">선택</option><option>재단</option><option>오시</option><option>접지</option><option>금박</option>
            </select>
          </div>
        </div>
      </div>

      {/* 표양식 (품목 테이블) */}
      <div className="bg-white border border-gray-300 rounded p-4 mb-3">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-800">표양식</span>
            <select value={templateType} onChange={(e) => setTemplateType(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs">
              <option>부가세포함</option><option>제본용</option><option>브로셔용</option><option>옵셋용</option>
            </select>
          </div>
          <button className="px-3 py-1 border border-gray-300 rounded text-xs text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-500 transition">+ 행 추가</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-200 px-2 py-2 w-[35px]">순번</th>
                <th className="border border-gray-200 px-2 py-2">품목명</th>
                <th className="border border-gray-200 px-2 py-2 w-[70px]">규격</th>
                <th className="border border-gray-200 px-2 py-2 w-[55px]">부수</th>
                <th className="border border-gray-200 px-2 py-2 w-[60px]">페이지수</th>
                <th className="border border-gray-200 px-2 py-2 w-[70px]">단가</th>
                <th className="border border-gray-200 px-2 py-2 w-[85px]">공급가</th>
                {formData.tradeType === "vat" && <th className="border border-gray-200 px-2 py-2 w-[70px]">부가세</th>}
                <th className="border border-gray-200 px-2 py-2 w-[85px]">합계</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((num) => (
                <tr key={num}>
                  <td className="border border-gray-200 px-1 py-1 text-center">{num}</td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs" /></td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-center" /></td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-center" /></td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-center" /></td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" /></td>
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" /></td>
                  {formData.tradeType === "vat" && <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" /></td>}
                  <td className="border border-gray-200 px-1 py-1"><input type="text" className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" /></td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td colSpan={6} className="border border-gray-200 px-2 py-2 text-right">합 계</td>
                <td className="border border-gray-200 px-2 py-2 text-right">0</td>
                {formData.tradeType === "vat" && <td className="border border-gray-200 px-2 py-2 text-right">0</td>}
                <td className="border border-gray-200 px-2 py-2 text-right">0</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="flex gap-2 py-3">
        <button className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition">저장</button>
        <button className="px-6 py-2 bg-white text-gray-600 border border-gray-300 rounded text-sm hover:bg-gray-50 transition">다시 작성</button>
        <button onClick={() => router.push("/dashboard")} className="px-6 py-2 bg-white text-gray-600 border border-gray-300 rounded text-sm hover:bg-gray-50 transition">리스트</button>
        <button className="px-6 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition" onClick={() => { if(confirm("정말 삭제할까요?")) router.push("/dashboard"); }}>삭제</button>
      </div>
    </div>
  );
}
