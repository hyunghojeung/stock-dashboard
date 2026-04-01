"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, userId, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "로그인에 실패했습니다.");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 md:p-10 rounded-lg shadow-md w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          <a href="https://blackcopy.kr" className="text-gray-800 no-underline">
            Blackcopy.kr
          </a>
        </h1>
        <p className="text-sm font-semibold text-gray-500 mb-1">
          인쇄전용 ERP Bcount
        </p>
        <p className="text-xs text-gray-400 mb-6">
          업체 ID와 사용자 ID로 로그인하세요
        </p>

        <form onSubmit={handleLogin}>
          <label className="block text-left text-sm text-gray-600 font-semibold mb-1">
            업체 ID
          </label>
          <input
            type="text"
            placeholder="업체 ID를 입력하세요"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm mb-3 focus:outline-none focus:border-blue-500"
            required
          />

          <label className="block text-left text-sm text-gray-600 font-semibold mb-1">
            사용자 ID
          </label>
          <input
            type="text"
            placeholder="사용자 ID를 입력하세요"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm mb-3 focus:outline-none focus:border-blue-500"
            required
          />

          <label className="block text-left text-sm text-gray-600 font-semibold mb-1">
            비밀번호
          </label>
          <input
            type="password"
            placeholder="비밀번호를 입력하세요"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm mb-4 focus:outline-none focus:border-blue-500"
            required
          />

          {error && (
            <p className="text-red-500 text-xs mb-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-gray-200">
          <a
            href="/super-admin"
            className="text-xs text-gray-400 hover:text-blue-500 transition"
          >
            플랫폼 최고관리자 로그인
          </a>
        </div>
      </div>
    </div>
  );
}
