"use client";

import { useEffect, useState, useCallback } from "react";
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

type SortCol = "name" | "date" | "manager" | "location" | "company_count" | "created_at";
type SortDir = "asc" | "desc";

function formatDate(d?: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300 text-xs">↕</span>;
  return <span className="ml-1 text-indigo-500 text-xs">{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function ExhibitionsPage() {
  const router = useRouter();
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", manager: "", date: "", location: "" });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 수정 모달
  const [editTarget, setEditTarget] = useState<Exhibition | null>(null);
  const [editForm, setEditForm] = useState({ name: "", manager: "", date: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/exhibitions");
      const d = await res.json();
      setExhibitions(d.exhibitions ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const sorted = [...exhibitions].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    if (sortCol === "company_count") {
      av = a.company_count;
      bv = b.company_count;
    } else if (sortCol === "date") {
      av = a.date ?? "";
      bv = b.date ?? "";
    } else if (sortCol === "created_at") {
      av = a.created_at;
      bv = b.created_at;
    } else if (sortCol === "name") {
      av = a.name;
      bv = b.name;
    } else if (sortCol === "manager") {
      av = a.manager ?? "";
      bv = b.manager ?? "";
    } else if (sortCol === "location") {
      av = a.location ?? "";
      bv = b.location ?? "";
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

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

  const openEdit = (e: React.MouseEvent, ex: Exhibition) => {
    e.stopPropagation();
    setEditTarget(ex);
    setEditForm({ name: ex.name, manager: ex.manager ?? "", date: ex.date ?? "", location: ex.location ?? "" });
    setEditError(null);
  };

  const handleEditSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editTarget) return;
    if (!editForm.name.trim()) { setEditError("박람회명을 입력해주세요."); return; }
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/exhibitions/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const d = await res.json();
      if (!res.ok) { setEditError(d.error); return; }
      setExhibitions((prev) =>
        prev.map((ex) => ex.id === editTarget.id ? { ...ex, ...d.exhibition } : ex)
      );
      setEditTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const totalCompanies = exhibitions.reduce((s, e) => s + e.company_count, 0);

  const thClass = (col: SortCol) =>
    `px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800 whitespace-nowrap transition-colors`;

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
          <div className="flex items-center gap-3">
            <button
              onClick={openModal}
              className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <PlusIcon />
              박람회 추가
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="mb-6 flex items-end justify-between">
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
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className={thClass("name")} onClick={() => handleSort("name")}>
                    박람회명 <SortIndicator active={sortCol === "name"} dir={sortDir} />
                  </th>
                  <th className={thClass("date")} onClick={() => handleSort("date")}>
                    날짜 <SortIndicator active={sortCol === "date"} dir={sortDir} />
                  </th>
                  <th className={thClass("manager")} onClick={() => handleSort("manager")}>
                    담당자 <SortIndicator active={sortCol === "manager"} dir={sortDir} />
                  </th>
                  <th className={thClass("location")} onClick={() => handleSort("location")}>
                    장소 <SortIndicator active={sortCol === "location"} dir={sortDir} />
                  </th>
                  <th className={thClass("company_count")} onClick={() => handleSort("company_count")}>
                    기업 수 <SortIndicator active={sortCol === "company_count"} dir={sortDir} />
                  </th>
                  <th className={thClass("created_at")} onClick={() => handleSort("created_at")}>
                    등록일 <SortIndicator active={sortCol === "created_at"} dir={sortDir} />
                  </th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => router.push(`/exhibitions/${e.id}`)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5 font-medium text-gray-900 max-w-xs">
                      <span className="line-clamp-1">{e.name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                      {formatDate(e.date) ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                      {e.manager || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {e.location || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        e.company_count > 0
                          ? "bg-indigo-50 text-indigo-700"
                          : "bg-gray-100 text-gray-400"
                      }`}>
                        {e.company_count}개
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap text-xs">
                      {formatDate(e.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(ev) => openEdit(ev, e)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                          title="수정"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      {/* 박람회 수정 모달 */}
      {editTarget && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">박람회 정보 수정</h2>
              <p className="text-sm text-gray-500 mt-0.5">잘못 입력된 내용을 수정하세요.</p>
            </div>
            <form onSubmit={handleEditSave} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  박람회명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">담당자</label>
                  <input
                    type="text"
                    value={editForm.manager}
                    onChange={(e) => setEditForm((p) => ({ ...p, manager: e.target.value }))}
                    placeholder="홍길동"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">날짜</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm((p) => ({ ...p, date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">장소</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="예: 코엑스 A홀"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                />
              </div>
              {editError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {editError}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="flex-1 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
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
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        박람회 추가
      </button>
    </div>
  );
}
