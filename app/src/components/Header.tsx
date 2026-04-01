"use client";

import { useRouter } from "next/navigation";

interface HeaderProps {
  companyName?: string;
  userName?: string;
  userId?: string;
  userRole?: string;
}

export default function Header({ companyName, userName, userId, userRole }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className="sticky top-0 z-50">
      {/* 메인 헤더 */}
      <div className="bg-slate-800 text-white px-4 md:px-6 py-3 flex justify-between items-center">
        <h1 className="text-base md:text-lg font-bold flex items-center gap-2">
          <a href="/dashboard" className="text-white no-underline">Blackcopy.kr</a>
          <span className="text-xs md:text-sm font-normal text-slate-400">인쇄전용 ERP Bcount</span>
          {companyName && (
            <span className="text-xs md:text-sm text-blue-400 ml-2">{companyName}</span>
          )}
        </h1>
        <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
          {userName && <span>{userName}님 ({userId})</span>}
          {userRole === "admin" && (
            <a href="/admin" className="text-slate-400 hover:text-white transition">관리자</a>
          )}
          <button onClick={handleLogout} className="text-slate-400 hover:text-white transition">
            로그아웃
          </button>
        </div>
      </div>

      {/* 홍보 배너 */}
      <div
        className="bg-gradient-to-r from-slate-800 via-blue-600 to-sky-500 px-4 md:px-6 py-2.5 flex justify-between items-center cursor-pointer"
        onClick={() => window.open("https://blackcopy.kr", "_blank")}
      >
        <span className="text-white text-xs md:text-sm font-bold">
          인쇄/출력 작업기록, 견적서, 거래명세서, 발주서까지 올인원 업무관리
        </span>
        <div className="flex items-center gap-2">
          <span className="bg-amber-400 text-slate-900 px-3 py-0.5 rounded-full text-xs font-bold">FREE</span>
          <span className="text-slate-400 text-xs">AD</span>
        </div>
      </div>
    </div>
  );
}
