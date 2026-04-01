"use client";

import { useState } from "react";

interface NoticeItem {
  id: string;
  title: string;
  content?: string;
  created_by_name?: string;
  created_at: string;
}

interface NoticeBarProps {
  notices: NoticeItem[];
  onComplete?: (id: string) => void;
}

export default function NoticeBar({ notices, onComplete }: NoticeBarProps) {
  const [viewId, setViewId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const visibleNotices = notices.filter((n) => !hiddenIds.includes(n.id));
  const viewNotice = notices.find((n) => n.id === viewId);

  function handleComplete(id: string) {
    setHiddenIds((prev) => [...prev, id]);
    setViewId(null);
    onComplete?.(id);
  }

  if (visibleNotices.length === 0) return null;

  return (
    <>
      <div className="bg-white border-b border-gray-200">
        {visibleNotices.map((notice) => (
          <div
            key={notice.id}
            className="px-4 md:px-6 py-1.5 border-b border-red-100 cursor-pointer hover:bg-red-50 transition"
            onClick={() => setViewId(notice.id)}
          >
            <span className="text-xs md:text-sm font-bold text-red-600 animate-pulse">
              {notice.title}
            </span>
          </div>
        ))}
      </div>

      {/* 상세 팝업 */}
      {viewNotice && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setViewId(null); }}
        >
          <div className="bg-white rounded-lg p-6 md:p-8 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-xl">
            <h3 className="text-lg font-bold text-red-600 mb-2 pb-3 border-b-2 border-red-200">
              {viewNotice.title}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              작성자: {viewNotice.created_by_name} | {viewNotice.created_at}
            </p>
            <div className="text-sm text-gray-700 leading-7 whitespace-pre-wrap mb-6">
              {viewNotice.content}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setViewId(null)}
                className="px-6 py-2 bg-gray-700 text-white rounded text-sm"
              >
                닫기
              </button>
              <button
                onClick={() => handleComplete(viewNotice.id)}
                className="px-6 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
              >
                작업완료
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
