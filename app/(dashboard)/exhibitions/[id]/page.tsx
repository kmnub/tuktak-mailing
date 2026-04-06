"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

/* ─── 타입 ─────────────────────────────────────────── */
interface Exhibition {
  id: string;
  name: string;
  manager?: string;
  date?: string;
  location?: string;
}

interface Company {
  id: string;
  raw_name: string;
  normalized_name: string;
  score: number;
  status: "candidate" | "confirmed" | "excluded";
  extraction_method: string;
  source_url: string;
  homepage: string | null;
  emails: string[];
  phones: string[];
  enriched: boolean;
}

/* ─── 아이콘 ────────────────────────────────────────── */
function CalendarIcon() {
  return <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
}
function LocationIcon() {
  return <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function PersonIcon() {
  return <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
}
function SpinnerIcon({ className = "w-4 h-4" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}

/* ─── 유틸 ──────────────────────────────────────────── */
function formatDate(d?: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(d));
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 7 ? "bg-emerald-50 text-emerald-700" : score >= 5 ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500";
  return <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-semibold ${color}`}>{score}</span>;
}

function StatusBadge({ status }: { status: Company["status"] }) {
  if (status === "confirmed") return <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">확정</span>;
  if (status === "excluded") return <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">제외</span>;
  return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">대기</span>;
}

/* ─── 메인 컴포넌트 ─────────────────────────────────── */
export default function ExhibitionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [exhibition, setExhibition] = useState<Exhibition | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 수집 상태
  const [crawlUrl, setCrawlUrl] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null);

  // 선택 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 기업정보 수집 상태
  const [enrichProgress, setEnrichProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);

  // 상태 업데이트 중인 ID
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const urlInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/exhibitions/${id}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error); return; }
      setExhibition(d.exhibition);
      setCompanies(d.companies ?? []);
    } catch {
      setError("데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ─── 크롤링 ─── */
  const handleCrawl = async (useAI: boolean) => {
    const url = crawlUrl.trim();
    if (!url) { setCrawlError("URL을 입력해주세요."); urlInputRef.current?.focus(); return; }
    if (!/^https?:\/\/.+/.test(url)) { setCrawlError("http:// 또는 https://로 시작하는 URL을 입력하세요."); return; }

    const parsedPages = totalPages.trim() ? parseInt(totalPages, 10) : undefined;
    if (parsedPages !== undefined && (isNaN(parsedPages) || parsedPages < 1)) {
      setCrawlError("페이지 수는 1 이상의 숫자를 입력하세요."); return;
    }

    setCrawling(true);
    setCrawlError(null);
    setCrawlMsg(null);

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, useAI, totalPages: parsedPages, exhibitionId: id }),
      });
      const d = await res.json();
      if (!res.ok) { setCrawlError(d.error ?? "수집 실패"); return; }
      setCrawlMsg(`${d.count}개 기업 수집 완료 (${d.pages_fetched}페이지)`);
      await loadData();
    } catch {
      setCrawlError("네트워크 오류가 발생했습니다.");
    } finally {
      setCrawling(false);
    }
  };

  /* ─── 전체 선택 ─── */
  const visibleIds = companies.filter((c) => c.status !== "excluded").map((c) => c.id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const isPartialSelected = visibleIds.some((id) => selectedIds.has(id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const toggleSelect = (companyId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  /* ─── 상태 변경 ─── */
  const updateStatus = async (companyId: string, status: Company["status"]) => {
    setUpdatingIds((p) => new Set(p).add(companyId));
    try {
      await fetch(`/api/candidates/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setCompanies((prev) => prev.map((c) => c.id === companyId ? { ...c, status } : c));
    } finally {
      setUpdatingIds((p) => { const n = new Set(p); n.delete(companyId); return n; });
    }
  };

  /* ─── 기업정보 수집 ─── */
  const handleEnrich = async () => {
    const ids = [...selectedIds].filter((sid) => companies.find((c) => c.id === sid));
    if (ids.length === 0) return;

    setEnrichProgress({ current: 0, total: ids.length, name: "" });

    for (let i = 0; i < ids.length; i++) {
      const company = companies.find((c) => c.id === ids[i]);
      setEnrichProgress({
        current: i + 1,
        total: ids.length,
        name: company?.normalized_name || company?.raw_name || "",
      });
      try {
        await fetch(`/api/companies/${ids[i]}/enrich`, { method: "POST" });
      } catch {
        // 실패해도 다음 진행
      }
    }

    setEnrichProgress(null);
    setSelectedIds(new Set());
    await loadData();
  };

  /* ─── 통계 ─── */
  const confirmed = companies.filter((c) => c.status === "confirmed").length;
  const pending = companies.filter((c) => c.status === "candidate").length;
  const excluded = companies.filter((c) => c.status === "excluded").length;
  const enrichedCount = companies.filter((c) => c.enriched).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <SpinnerIcon className="w-6 h-6 text-indigo-400" />
          <span className="text-sm">불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error || !exhibition) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-red-100 p-6 max-w-md w-full text-center">
          <p className="text-sm text-red-600 mb-4">{error ?? "박람회를 찾을 수 없습니다."}</p>
          <Link href="/exhibitions" className="text-sm text-indigo-600 hover:underline">← 목록으로</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/exhibitions" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            목록
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{exhibition.name}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {/* 박람회 헤더 카드 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{exhibition.name}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
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
                담당자 {exhibition.manager}
              </div>
            )}
          </div>
        </div>

        {/* URL 수집 카드 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900">기업명 수집</h2>
            <p className="text-sm text-gray-500 mt-0.5">박람회 참가기업 목록 URL을 입력하고 수집을 시작하세요.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              ref={urlInputRef}
              type="text"
              value={crawlUrl}
              onChange={(e) => setCrawlUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !crawling) handleCrawl(false); }}
              placeholder="https://expo-example.co.kr/exhibitors"
              disabled={crawling}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 transition-shadow"
            />
            <input
              type="number"
              min={1}
              max={50}
              value={totalPages}
              onChange={(e) => setTotalPages(e.target.value)}
              placeholder="페이지 수"
              disabled={crawling}
              className="w-28 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 transition-shadow"
            />
          </div>
          <div className="flex gap-2.5 mt-3">
            <button
              onClick={() => handleCrawl(false)}
              disabled={crawling || !crawlUrl.trim()}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {crawling ? <SpinnerIcon /> : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {crawling ? "수집 중..." : "기업명 수집"}
            </button>
            <button
              onClick={() => handleCrawl(true)}
              disabled={crawling || !crawlUrl.trim()}
              className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {crawling ? <SpinnerIcon /> : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
              AI 기반 수집
            </button>
          </div>
          {crawlError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {crawlError}
            </p>
          )}
          {crawlMsg && !crawlError && (
            <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {crawlMsg}
            </p>
          )}
        </div>

        {/* 기업 목록 */}
        {companies.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            {/* 헤더 */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  기업 목록
                  <span className="ml-2 text-sm font-normal text-gray-400">{companies.length}개</span>
                </h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    확정 {confirmed}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
                    대기 {pending}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                    제외 {excluded}
                  </span>
                  {enrichedCount > 0 && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-indigo-600 font-medium">연락처 {enrichedCount}개 수집됨</span>
                    </>
                  )}
                </div>
              </div>

              {/* 일괄 액션 */}
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleEnrich}
                    disabled={!!enrichProgress}
                    className="flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {enrichProgress ? <SpinnerIcon /> : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                    기업정보 수집 ({selectedIds.size}개)
                  </button>
                )}
              </div>
            </div>

            {/* 진행상황 배너 */}
            {enrichProgress && (
              <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3">
                <SpinnerIcon className="w-4 h-4 text-indigo-500" />
                <span className="text-sm text-indigo-700 font-medium">
                  기업정보 수집 중: {enrichProgress.current}/{enrichProgress.total}
                  {enrichProgress.name && ` — ${enrichProgress.name}`}
                </span>
                <div className="flex-1 bg-indigo-200 rounded-full h-1.5 ml-2">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${(enrichProgress.current / enrichProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={(el) => { if (el) el.indeterminate = isPartialSelected; }}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">기업명</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-14">점수</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">홈페이지</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">이메일</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">전화번호</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">상태</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {companies.map((c) => {
                    const isUpdating = updatingIds.has(c.id);
                    const isSelected = selectedIds.has(c.id);
                    const rowBg =
                      c.status === "excluded"
                        ? "opacity-40 bg-gray-50"
                        : isSelected
                        ? "bg-indigo-50/60"
                        : c.status === "confirmed"
                        ? "bg-emerald-50/40"
                        : "";

                    return (
                      <tr key={c.id} className={`hover:bg-gray-50/80 transition-colors ${rowBg}`}>
                        {/* 체크박스 */}
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={c.status === "excluded"}
                            onChange={() => toggleSelect(c.id)}
                            className="w-4 h-4 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
                          />
                        </td>

                        {/* 기업명 */}
                        <td className="px-3 py-3">
                          <Link
                            href={`/companies/${c.id}`}
                            className="font-medium text-gray-900 hover:text-indigo-700 transition-colors"
                          >
                            {c.normalized_name || c.raw_name}
                          </Link>
                          {c.normalized_name && c.normalized_name !== c.raw_name && (
                            <span className="ml-1.5 text-xs text-gray-400">{c.raw_name}</span>
                          )}
                        </td>

                        {/* 점수 */}
                        <td className="px-3 py-3 text-center">
                          <ScoreBadge score={c.score} />
                        </td>

                        {/* 홈페이지 */}
                        <td className="px-3 py-3 max-w-[180px]">
                          {c.homepage ? (
                            <a
                              href={c.homepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:underline truncate block"
                              title={c.homepage}
                            >
                              {new URL(c.homepage).hostname.replace(/^www\./, "")}
                            </a>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>

                        {/* 이메일 */}
                        <td className="px-3 py-3 max-w-[180px]">
                          {c.emails.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {c.emails.slice(0, 2).map((e, i) => (
                                <span key={i} className="text-xs text-gray-700 truncate font-mono" title={e}>{e}</span>
                              ))}
                              {c.emails.length > 2 && (
                                <span className="text-xs text-gray-400">+{c.emails.length - 2}개</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>

                        {/* 전화 */}
                        <td className="px-3 py-3">
                          {c.phones.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {c.phones.slice(0, 2).map((p, i) => (
                                <span key={i} className="text-xs text-gray-700 font-mono">{p}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>

                        {/* 상태 */}
                        <td className="px-3 py-3 text-center">
                          <StatusBadge status={c.status} />
                        </td>

                        {/* 액션 */}
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {c.status !== "confirmed" && (
                              <button
                                disabled={isUpdating}
                                onClick={() => updateStatus(c.id, "confirmed")}
                                className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium transition-colors disabled:opacity-40"
                              >
                                확정
                              </button>
                            )}
                            {c.status !== "excluded" ? (
                              <button
                                disabled={isUpdating}
                                onClick={() => updateStatus(c.id, "excluded")}
                                className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 font-medium transition-colors disabled:opacity-40"
                              >
                                제외
                              </button>
                            ) : (
                              <button
                                disabled={isUpdating}
                                onClick={() => updateStatus(c.id, "candidate")}
                                className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 font-medium transition-colors disabled:opacity-40"
                              >
                                복원
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 테이블 하단 — 선택 현황 */}
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-gray-500 hover:text-indigo-600 font-medium transition-colors"
              >
                {isAllSelected ? "전체 선택 해제" : "전체 선택"}
              </button>
              <span>
                {selectedIds.size > 0 ? (
                  <span className="text-indigo-600 font-medium">{selectedIds.size}개 선택됨</span>
                ) : (
                  "기업을 선택하면 일괄 작업이 가능합니다"
                )}
              </span>
            </div>
          </div>
        )}

        {/* 빈 상태 */}
        {companies.length === 0 && !crawling && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">아직 수집된 기업이 없습니다</p>
            <p className="text-xs text-gray-400">위의 URL 입력칸에 박람회 참가기업 목록 URL을 입력하고 수집을 시작하세요.</p>
          </div>
        )}
      </main>
    </div>
  );
}
