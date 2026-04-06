"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Exhibition {
  id: string;
  name: string;
  manager?: string;
  date?: string;
  location?: string;
  company_count: number;
  created_at: string;
}

function formatDate(d?: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(d));
}

function CalendarIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function LocationIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

export default function ExhibitionsPage() {
  const router = useRouter();
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", manager: "", date: "", location: "" });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/exhibitions");
      const d = await res.json();
      setExhibitions(d.exhibitions ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openModal = () => {
    setForm({ name: "", manager: "", date: "", location: "" });
    setFormError(null);
    setShowModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("박람회명을 입력해주세요."); return; }
    setCreating(true);
    setFormError(null);
    try {
      const res = await fetch("/api/exhibitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { setFormError(d.error); return; }
      setShowModal(false);
      router.push(`/exhibitions/${d.exhibition.id}`);
    } finally {
      setCreating(false);
    }
  };

  const totalCompanies = exhibitions.reduce((s, e) => s + e.company_count, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-black tracking-tight">M</span>
            </div>
            <span className="text-base font-bold text-gray-900">Mailing</span>
          </div>
          <button
            onClick={openModal}
            className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
          >
            <PlusIcon />
            박람회 추가
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">박람회 관리</h1>
            <p className="text-gray-500 mt-1 text-sm">박람회별 참가기업 정보를 수집하고 관리합니다.</p>
          </div>
          {exhibitions.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>박람회 <strong className="text-gray-800">{exhibitions.length}</strong>개</span>
              <span>·</span>
              <span>기업 <strong className="text-gray-800">{totalCompanies}</strong>개 수집됨</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm">불러오는 중...</span>
            </div>
          </div>
        ) : exhibitions.length === 0 ? (
          <EmptyState onAdd={openModal} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {exhibitions.map((e) => (
              <ExhibitionCard
                key={e.id}
                exhibition={e}
                onClick={() => router.push(`/exhibitions/${e.id}`)}
              />
            ))}
            {/* Add button card */}
            <button
              onClick={openModal}
              className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center gap-2 min-h-[160px] group"
            >
              <div className="w-10 h-10 bg-gray-100 group-hover:bg-indigo-100 rounded-full flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm text-gray-400 group-hover:text-indigo-500 font-medium transition-colors">새 박람회 추가</span>
            </button>
          </div>
        )}
      </main>

      {/* 박람회 추가 모달 */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">새 박람회 추가</h2>
              <p className="text-sm text-gray-500 mt-0.5">기본 정보를 입력하고 기업 수집을 시작하세요.</p>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  박람회명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="예: 2025 서울 푸드 엑스포"
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">담당자</label>
                  <input
                    type="text"
                    value={form.manager}
                    onChange={(e) => setForm((p) => ({ ...p, manager: e.target.value }))}
                    placeholder="홍길동"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">날짜</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">장소</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="예: 코엑스 A홀"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                />
              </div>
              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? "추가 중..." : "추가하기"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ExhibitionCard({ exhibition, onClick }: { exhibition: Exhibition; onClick: () => void }) {
  const hasInfo = exhibition.date || exhibition.location || exhibition.manager;
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-indigo-300 hover:shadow-md transition-all group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-bold text-gray-900 text-[15px] leading-snug group-hover:text-indigo-700 transition-colors line-clamp-2">
          {exhibition.name}
        </h3>
        <span
          className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
            exhibition.company_count > 0
              ? "bg-indigo-50 text-indigo-700"
              : "bg-gray-100 text-gray-400"
          }`}
        >
          {exhibition.company_count}개
        </span>
      </div>

      {hasInfo && (
        <div className="space-y-1.5 text-[13px] text-gray-500 mb-4">
          {exhibition.date && (
            <div className="flex items-center gap-1.5">
              <CalendarIcon />
              {formatDate(exhibition.date)}
            </div>
          )}
          {exhibition.location && (
            <div className="flex items-center gap-1.5">
              <LocationIcon />
              {exhibition.location}
            </div>
          )}
          {exhibition.manager && (
            <div className="flex items-center gap-1.5">
              <PersonIcon />
              {exhibition.manager}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-1 text-xs font-medium text-indigo-500 group-hover:text-indigo-700 transition-colors mt-auto pt-1">
        열기
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-5">
        <svg className="w-10 h-10 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-1.5">등록된 박람회가 없습니다</h3>
      <p className="text-sm text-gray-500 mb-7 max-w-xs">
        첫 번째 박람회를 추가하고<br />참가기업 정보 수집을 시작해보세요.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
      >
        <PlusIcon />
        박람회 추가
      </button>
    </div>
  );
}
