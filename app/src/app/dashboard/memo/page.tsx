"use client";

import { useState, useEffect } from "react";

type View = "list" | "write" | "view" | "edit";
interface MemoData { id: string; title: string; content: string; created_at: string; users?: { name: string; user_id: string } }

export default function MemoPage() {
  const [view, setView] = useState<View>("list");
  const [memos, setMemos] = useState<MemoData[]>([]);
  const [current, setCurrent] = useState<MemoData | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [currentUser, setCurrentUser] = useState("");

  useEffect(() => {
    try {
      const cookies = document.cookie.split(";").map(c => c.trim());
      const sessionCookie = cookies.find(c => c.startsWith("session="));
      if (sessionCookie) {
        const decoded = decodeURIComponent(sessionCookie.split("=").slice(1).join("="));
        const session = JSON.parse(decoded);
        setCurrentUser(`${session.user?.name || ""}(${session.user?.user_id || ""})`);
      }
    } catch { /* ignore */ }
  }, []);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch(`/api/memos?page=${page}&_=${Date.now()}`).then(r => r.json()).then(d => {
      setMemos(d.data || []); setTotal(d.total || 0);
    });
  }, [page, refreshKey]);

  async function handleSave() {
    if (!title) { alert("제목을 입력해주세요."); return; }
    const isEdit = view === "edit" && current;
    const url = isEdit ? `/api/memos/${current!.id}` : "/api/memos";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content }) });
    if (res.ok) { setTitle(""); setContent(""); setView("list"); setRefreshKey(k => k + 1); }
    else alert("저장 실패");
  }

  async function handleDelete(id: string) {
    if (!confirm("정말 삭제할까요?")) return;
    await fetch(`/api/memos/${id}`, { method: "DELETE" });
    setView("list"); setRefreshKey(k => k + 1);
  }

  function openView(m: MemoData) { setCurrent(m); setView("view"); }
  function openEdit() { if (current) { setTitle(current.title); setContent(current.content || ""); setView("edit"); } }
  function openWrite() { setTitle(""); setContent(""); setCurrent(null); setView("write"); }

  const totalPages = Math.ceil(total / 15);

  if (view === "write" || view === "edit") {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{view === "edit" ? "메모 수정" : "메모 작성"}</h3>
          <label className="block text-xs font-semibold text-gray-600 mb-1">작성자</label>
          <input type="text" value={currentUser} readOnly className="w-full px-3 py-2 border border-gray-200 rounded text-sm mb-3 bg-gray-50 text-gray-500" />
          <label className="block text-xs font-semibold text-gray-600 mb-1">제목</label>
          <input type="text" placeholder="제목" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-3" />
          <label className="block text-xs font-semibold text-gray-600 mb-1">내용</label>
          <textarea placeholder="내용" value={content} onChange={e => setContent(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm min-h-[200px] resize-y mb-3" />
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-6 py-2 bg-emerald-600 text-white rounded text-sm">저장</button>
            <button onClick={() => setView("list")} className="px-6 py-2 border border-gray-300 rounded text-sm">취소</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "view" && current) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-2">{current.title}</h3>
          <p className="text-xs text-gray-400 mb-4 pb-3 border-b border-gray-200">작성자: {current.users ? `${current.users.name}(${current.users.user_id})` : "-"} | 작성일: {current.created_at?.slice(0, 10)}</p>
          <div className="text-sm text-gray-700 leading-7 whitespace-pre-wrap min-h-[150px] mb-5">{current.content}</div>
          <div className="flex gap-2">
            <button onClick={() => setView("list")} className="px-6 py-2 border border-gray-300 rounded text-sm">목록</button>
            <button onClick={openEdit} className="px-6 py-2 bg-emerald-600 text-white rounded text-sm">수정</button>
            <button onClick={() => handleDelete(current.id)} className="px-6 py-2 bg-red-600 text-white rounded text-sm">삭제</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          <input type="text" placeholder="제목 또는 내용 검색" value={keyword} onChange={e => setKeyword(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded text-sm w-52" />
          <button className="px-4 py-1.5 bg-gray-700 text-white rounded text-xs">검색</button>
        </div>
        <button onClick={openWrite} className="px-5 py-2 bg-emerald-600 text-white rounded text-sm font-medium">+ 메모 작성</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 text-xs">
          <thead><tr className="bg-[#3b4b5b] text-white">
            <th className="border border-[#2d3a47] px-2 py-2.5 w-12">번호</th><th className="border border-[#2d3a47] px-2 py-2.5">제목</th><th className="border border-[#2d3a47] px-2 py-2.5 w-24">작성자</th><th className="border border-[#2d3a47] px-2 py-2.5 w-24">작성일</th>
          </tr></thead>
          <tbody>
            {memos.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-gray-400">등록된 메모가 없습니다.</td></tr> :
            memos.map((m, i) => (
              <tr key={m.id} className={`${i % 2 === 1 ? "bg-gray-50" : ""} hover:bg-blue-50 cursor-pointer`} onClick={() => openView(m)}>
                <td className="border border-gray-200 px-2 py-2 text-center">{(page - 1) * 15 + i + 1}</td>
                <td className="border border-gray-200 px-2 py-2 text-left">{m.title}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{m.users ? `${m.users.name}(${m.users.user_id})` : "-"}</td>
                <td className="border border-gray-200 px-2 py-2 text-center">{m.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} className={`px-2.5 py-1 rounded border text-xs ${p === page ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-300 text-gray-500"}`}>{p}</button>
          ))}
        </div>
      )}
    </div>
  );
}
