"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (adminId === "blackcopy2" && password === "@kingsize2") {
      router.push("/super-admin/dashboard");
    } else {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="bg-slate-800 p-10 rounded-xl shadow-lg w-full max-w-sm text-center border border-slate-700">
        <h1 className="text-xl font-bold text-gray-100 mb-1">Platform Admin</h1>
        <p className="text-xs text-slate-500 mb-8">Blackcopy.kr 최고관리자</p>
        <form onSubmit={handleLogin}>
          <label className="block text-left text-xs text-slate-400 mb-1 font-semibold">관리자 ID</label>
          <input type="text" placeholder="아이디 입력" value={adminId} onChange={(e) => setAdminId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-600 rounded bg-slate-900 text-gray-100 text-sm mb-4 focus:outline-none focus:border-blue-500" required />
          <label className="block text-left text-xs text-slate-400 mb-1 font-semibold">비밀번호</label>
          <input type="password" placeholder="비밀번호 입력" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2.5 border border-slate-600 rounded bg-slate-900 text-gray-100 text-sm mb-4 focus:outline-none focus:border-blue-500" required />
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded font-semibold text-sm hover:bg-blue-700 transition">로그인</button>
        </form>
        <div className="mt-5 pt-4 border-t border-slate-700">
          <a href="/" className="text-xs text-slate-500 hover:text-blue-400 transition">업체 사용자 로그인으로 이동</a>
        </div>
      </div>
    </div>
  );
}
