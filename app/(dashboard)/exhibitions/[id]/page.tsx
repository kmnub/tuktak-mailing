"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";

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

type SortCol = "name" | "score" | "status" | "homepage" | "email" | "phone";
type SortDir = "asc" | "desc";

/* ─── 아이콘 ────────────────────────────────────────── */
function SpinnerIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SortIcon({ active, dir }: { col?: string; active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300 text-xs">↕</span>;
  return <span className="ml-1 text-indigo-500 text-xs">{dir === "asc" ? "↑" : "↓"}</span>;
}

/* ─── 유틸 ──────────────────────────────────────────── */
function formatDate(d?: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(d));
}

function generatePageUrls(baseUrl: string, numPages: number): string[] {
  if (numPages <= 1) return [baseUrl];
  try {
    const u = new URL(baseUrl);
    const pageParams = ["page", "cpage", "p", "pagenum", "pg"];
    const existingParam = pageParams.find((p) => u.searchParams.has(p)) ?? "page";
    return Array.from({ length: numPages }, (_, i) => {
      const next = new URL(baseUrl);
      next.searchParams.set(existingParam, String(i + 1));
      return next.toString();
    });
  } catch {
    return [baseUrl];
  }
}

/** Chrome DevTools에서 복사한 cURL 명령어 파싱 */
function parseCurl(raw: string): { url: string; body: string; origin: string } | null {
  const urlMatch = raw.match(/curl\s+['"](https?:\/\/[^'"]+)['"]/);
  if (!urlMatch) return null;
  const url = urlMatch[1];

  // --data-raw, --data-binary, --data, -d 모두 처리
  const bodyMatch =
    raw.match(/(?:--data-raw|--data-binary|--data|-d)\s+\$?'((?:[^'\\]|\\.)*)'/) ||
    raw.match(/(?:--data-raw|--data-binary|--data|-d)\s+"((?:[^"\\]|\\.)*)"/);

  let body = bodyMatch ? bodyMatch[1] : "";
  body = body.replace(/\\'/g, "'").replace(/\\"/g, '"');

  const originMatch = raw.match(/-H\s+['"]Origin:\s*([^'"]+)['"]/i);
  const origin = originMatch
    ? originMatch[1].trim()
    : (() => { try { return new URL(url).origin; } catch { return ""; } })();

  return { url, body, origin };
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 7 ? "bg-emerald-50 text-emerald-700" :
    score >= 5 ? "bg-blue-50 text-blue-700" :
    "bg-gray-100 text-gray-500";
  return <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-semibold ${cls}`}>{score}</span>;
}

function StatusBadge({ status }: { status: Company["status"] }) {
  if (status === "confirmed") return <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">확정</span>;
  if (status === "excluded") return <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">제외</span>;
  return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">대기</span>;
}

/* ─── 인라인 편집 셀 ─── */
function EditableCell({
  value,
  placeholder,
  onSave,
  isUrl = false,
}: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  isUrl?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className="w-full text-xs border border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 font-mono"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="group flex items-center gap-1">
      {value ? (
        isUrl ? (
          <a
            href={value.startsWith("http") ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-mono truncate max-w-[130px]"
            title={value}
          >
            {value.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        ) : (
          <span className="text-xs text-gray-700 font-mono truncate max-w-[140px]">{value}</span>
        )
      ) : (
        <span className="text-xs text-gray-300 italic">{placeholder}</span>
      )}
      <button
        onClick={() => setEditing(true)}
        title="클릭하여 수정"
        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      >
        <svg className="w-3 h-3 text-gray-400 hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </div>
  );
}

/* ─── 메인 ──────────────────────────────────────────── */
export default function ExhibitionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [exhibition, setExhibition] = useState<Exhibition | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 박람회 정보 수정
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", manager: "", date: "", location: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // 수집 입력
  const [crawlUrl, setCrawlUrl] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [infiniteScroll, setInfiniteScroll] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [curlInput, setCurlInput] = useState("");
  const [showContinue, setShowContinue] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [pastedHtml, setPastedHtml] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<{ current: number; total: number; found: number } | null>(null);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null);
  const crawlAbortRef = useRef(false);

  // 기업정보 수집
  const [enrichProgress, setEnrichProgress] = useState<{
    current: number; total: number; name: string; ids: string[];
    found: number; failed: number; force: boolean;
  } | null>(null);
  const enrichPausedRef = useRef(false);
  const enrichStoppedRef = useRef(false);
  const [enrichPaused, setEnrichPaused] = useState(false);
  const [resetting, setResetting] = useState(false);

  // 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number | null>(null);

  // 정렬
  const [sortCol, setSortCol] = useState<SortCol>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // 확인 다이얼로그
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);

  // 이메일 복사
  const [emailCopied, setEmailCopied] = useState(false);

  const urlInputRef = useRef<HTMLInputElement>(null);

  /* ─── 데이터 로드 ─── */
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

  /* ─── 크롤링 (순차 / 중단 가능) ─── */
  const handleCrawl = async () => {
    const url = crawlUrl.trim();
    if (!url) { setCrawlError("URL을 입력해주세요."); urlInputRef.current?.focus(); return; }
    if (!/^https?:\/\/.+/.test(url)) { setCrawlError("http:// 또는 https://로 시작하는 URL을 입력하세요."); return; }

    const urls = totalPages > 1 ? generatePageUrls(url, totalPages) : [url];

    setCrawling(true);
    setCrawlError(null);
    setCrawlMsg(null);
    setShowContinue(false);
    crawlAbortRef.current = false;
    let totalFound = 0;

    for (let i = 0; i < urls.length; i++) {
      if (crawlAbortRef.current) break;

      setCrawlProgress({ current: i + 1, total: urls.length, found: totalFound });

      try {
        const res = await fetch("/api/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: urls[i],
            singlePage: true,
            infiniteScroll,
            scrollCount: 20,
            useAI,
            exhibitionId: id,
          }),
        });
        const d = await res.json();
        if (res.ok) {
          totalFound += d.count ?? 0;
          setCrawlProgress({ current: i + 1, total: urls.length, found: totalFound });
          // 페이지마다 목록 즉시 반영
          await loadData();
        }
      } catch {
        // 네트워크 오류 시 이 페이지만 건너뜀
      }
    }

    setCrawling(false);
    setCrawlProgress(null);
    if (!crawlAbortRef.current) {
      setCrawlMsg(`수집 완료 — 총 ${totalFound}개 기업`);
      if (infiniteScroll) setShowContinue(true);
      if (totalFound < 5) setShowFallback(true);
    } else {
      setCrawlMsg(`수집 중단 — ${totalFound}개 기업까지 저장됨`);
    }
  };

  /* ─── 계속 찾기 (40회 스크롤) ─── */
  const handleContinueCrawl = async () => {
    const url = crawlUrl.trim();
    if (!url) return;
    setCrawling(true);
    setCrawlError(null);
    setCrawlMsg(null);
    setShowContinue(false);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          singlePage: true,
          infiniteScroll: true,
          scrollCount: 40,
          exhibitionId: id,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setCrawlError(d.error ?? "수집 실패"); return; }
      await loadData();
      setCrawlMsg(`계속 수집 완료 — ${d.count}개 추가`);
      setShowContinue(true);
    } catch {
      setCrawlError("서버 오류가 발생했습니다.");
    } finally {
      setCrawling(false);
    }
  };

  const stopCrawl = () => { crawlAbortRef.current = true; };

  /* ─── 고급 수집 (cURL 파싱) ─── */
  const handleApiCrawl = async () => {
    const raw = curlInput.trim();
    if (!raw) { setCrawlError("cURL 명령어를 붙여넣어 주세요."); return; }
    const parsed = parseCurl(raw);
    if (!parsed) { setCrawlError("올바른 cURL 명령어를 붙여넣어 주세요. (curl 'URL' ... 형식)"); return; }
    let requestBody: Record<string, unknown>;
    try {
      requestBody = parsed.body ? JSON.parse(parsed.body) : {};
    } catch {
      setCrawlError("cURL의 Request Body를 JSON으로 파싱할 수 없습니다. 담당자에게 문의해주세요."); return;
    }
    setCrawling(true);
    setCrawlError(null);
    setCrawlMsg(null);
    try {
      const res = await fetch("/api/crawl-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUrl: parsed.url, requestBody, exhibitionId: id, originHeader: parsed.origin }),
      });
      const d = await res.json();
      if (!res.ok) { setCrawlError(d.error ?? "수집 실패"); return; }
      await loadData();
      setCrawlMsg(`고급 수집 완료 — ${d.pages_fetched}페이지, ${d.count}개 기업`);
    } catch {
      setCrawlError("서버 오류가 발생했습니다.");
    } finally {
      setCrawling(false);
    }
  };

  /* ─── HTML 붙여넣기 수집 ─── */
  const handlePasteCrawl = async () => {
    const html = pastedHtml.trim();
    if (!html) { setCrawlError("HTML을 붙여넣어 주세요."); return; }
    setCrawling(true);
    setCrawlError(null);
    setCrawlMsg(null);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, url: crawlUrl.trim() || "pasted", exhibitionId: id }),
      });
      const d = await res.json();
      if (!res.ok) { setCrawlError(d.error ?? "추출 실패"); return; }
      await loadData();
      setCrawlMsg(`추출 완료 — ${d.count}개 기업`);
      if (d.count > 0) setPastedHtml("");
    } catch {
      setCrawlError("서버 오류가 발생했습니다.");
    } finally {
      setCrawling(false);
    }
  };

  /* ─── 선택 ─── */
  const activeCompanies = companies.filter((c) => c.status !== "excluded");
  const isAllSelected = activeCompanies.length > 0 && activeCompanies.every((c) => selectedIds.has(c.id));
  const isPartial = activeCompanies.some((c) => selectedIds.has(c.id)) && !isAllSelected;

  const toggleAll = () => {
    lastSelectedIndexRef.current = null;
    if (isAllSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(activeCompanies.map((c) => c.id)));
  };

  const toggleOne = (cid: string, index: number, shiftKey: boolean) => {
    if (shiftKey && lastSelectedIndexRef.current !== null) {
      const from = Math.min(lastSelectedIndexRef.current, index);
      const to = Math.max(lastSelectedIndexRef.current, index);
      const rangeIds = sortedCompanies
        .slice(from, to + 1)
        .filter((c) => c.status !== "excluded")
        .map((c) => c.id);
      setSelectedIds((p) => {
        const n = new Set(p);
        rangeIds.forEach((rid) => n.add(rid));
        return n;
      });
    } else {
      lastSelectedIndexRef.current = index;
      setSelectedIds((p) => { const n = new Set(p); if (n.has(cid)) { n.delete(cid); } else { n.add(cid); } return n; });
    }
  };

  /* ─── 삭제 (일괄) ─── */
  const deleteSelected = async () => {
    const ids = [...selectedIds];
    setDeletingIds(new Set(ids));
    await fetch("/api/candidates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setCompanies((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setDeletingIds(new Set());
    setSelectedIds(new Set());
    setConfirmDeleteSelected(false);
  };

  /* ─── 상태 변경 ─── */
  const updateStatus = async (cid: string, status: Company["status"]) => {
    setUpdatingIds((p) => new Set(p).add(cid));
    await fetch(`/api/candidates/${cid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setCompanies((prev) => prev.map((c) => c.id === cid ? { ...c, status } : c));
    setUpdatingIds((p) => { const n = new Set(p); n.delete(cid); return n; });
  };

  /* ─── 기업정보 수집 ─── */
  const startEnrich = async (ids?: string[], force = false) => {
    const targetIds = ids ?? [...selectedIds];
    if (targetIds.length === 0) return;
    enrichPausedRef.current = false;
    enrichStoppedRef.current = false;
    setEnrichPaused(false);
    setEnrichProgress({ current: 0, total: targetIds.length, name: "", ids: targetIds, found: 0, failed: 0, force });
    await runEnrichLoop(targetIds, 0, 0, 0, force);
  };

  const runEnrichLoop = async (ids: string[], startIdx: number, initFound: number, initFailed: number, force = false) => {
    let found = initFound;
    let failed = initFailed;

    for (let i = startIdx; i < ids.length; i++) {
      if (enrichStoppedRef.current) break;

      while (enrichPausedRef.current) {
        await new Promise((r) => setTimeout(r, 200));
      }

      const company = companies.find((c) => c.id === ids[i]);
      setEnrichProgress({ current: i + 1, total: ids.length, name: company?.normalized_name || company?.raw_name || "", ids, found, failed, force });

      try {
        const res = await fetch(`/api/companies/${ids[i]}/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        const data = await res.json();
        if (res.ok && data.success && data.contactsFound > 0) found++;
        else if (!res.ok || !data.success) failed++;
        await loadData();
      } catch {
        failed++;
      }

      setEnrichProgress((prev) => prev ? { ...prev, found, failed } : null);
    }
    if (!enrichPausedRef.current) {
      setEnrichProgress(null);
      setSelectedIds(new Set());
    }
  };

  const pauseEnrich = () => {
    enrichPausedRef.current = true;
    setEnrichPaused(true);
  };

  const resumeEnrich = () => {
    if (!enrichProgress) return;
    enrichPausedRef.current = false;
    setEnrichPaused(false);
    const { ids, current, found, failed, force } = enrichProgress;
    runEnrichLoop(ids, current, found, failed, force);
  };

  const stopEnrich = () => {
    enrichStoppedRef.current = true;
    enrichPausedRef.current = false;
    setEnrichPaused(false);
    setEnrichProgress(null);
  };

  /* ─── 초기화 ─── */
  const handleReset = async () => {
    setResetting(true);
    await fetch(`/api/exhibitions/${id}/enrich-reset`, { method: "DELETE" });
    setResetting(false);
    setConfirmReset(false);
    stopEnrich();
    await loadData();
  };

  /* ─── 수기 연락처 저장 ─── */
  const saveContact = async (cid: string, field: "homepage" | "email" | "phone", value: string) => {
    // 낙관적 UI 업데이트 — API 응답 전에 즉시 반영
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== cid) return c;
        if (field === "homepage") return { ...c, homepage: value || null, enriched: !!(value || c.emails.length || c.phones.length) };
        if (field === "email") {
          const emails = value ? [value, ...c.emails.filter((e) => e !== value)] : c.emails;
          return { ...c, emails, enriched: !!(c.homepage || emails.length || c.phones.length) };
        }
        if (field === "phone") {
          const phones = value ? [value, ...c.phones.filter((p) => p !== value)] : c.phones;
          return { ...c, phones, enriched: !!(c.homepage || c.emails.length || phones.length) };
        }
        return c;
      })
    );
    await fetch(`/api/companies/${cid}/contact`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value }),
    });
    await loadData();
  };

  /* ─── 박람회 정보 수정 ─── */
  const openEditModal = () => {
    if (!exhibition) return;
    setEditForm({
      name: exhibition.name,
      manager: exhibition.manager ?? "",
      date: exhibition.date ?? "",
      location: exhibition.location ?? "",
    });
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exhibition) return;
    if (!editForm.name.trim()) { setEditError("박람회명을 입력해주세요."); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/exhibitions/${exhibition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const d = await res.json();
      if (!res.ok) { setEditError(d.error); return; }
      setExhibition((prev) => prev ? { ...prev, ...d.exhibition } : prev);
      setShowEditModal(false);
    } finally {
      setEditSaving(false);
    }
  };

  /* ─── 엑셀 다운로드 ─── */
  const downloadExcel = () => {
    const rows = sortedCompanies
      .filter((c) => c.status !== "excluded")
      .map((c) => ({
        기업명: c.normalized_name || c.raw_name,
        홈페이지: c.homepage ?? "",
        이메일: c.emails.join(", "),
        전화번호: c.phones.join(", "),
        상태: c.status === "confirmed" ? "확정" : "대기",
      }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 30 }, // 기업명
      { wch: 40 }, // 홈페이지
      { wch: 35 }, // 이메일
      { wch: 20 }, // 전화번호
      { wch: 8 },  // 상태
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "기업목록");
    const filename = `${exhibition?.name ?? "기업목록"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  /* ─── 정렬 ─── */
  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortedCompanies = [...companies].sort((a, b) => {
    let va: string | number = "";
    let vb: string | number = "";
    switch (sortCol) {
      case "name": va = a.normalized_name || a.raw_name; vb = b.normalized_name || b.raw_name; break;
      case "score": va = a.score; vb = b.score; break;
      case "status": va = a.status; vb = b.status; break;
      case "homepage": va = a.homepage ?? ""; vb = b.homepage ?? ""; break;
      case "email": va = a.emails[0] ?? ""; vb = b.emails[0] ?? ""; break;
      case "phone": va = a.phones[0] ?? ""; vb = b.phones[0] ?? ""; break;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const confirmed = companies.filter((c) => c.status === "confirmed").length;
  const pending = companies.filter((c) => c.status === "candidate").length;
  const excluded = companies.filter((c) => c.status === "excluded").length;
  const enrichedCount = companies.filter((c) => c.enriched).length;

  /* ─── 렌더 ─── */
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
      {/* 상단 네비 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/exhibitions" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            목록
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-700 truncate">{exhibition.name}</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">

        {/* 박람회 정보 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{exhibition.name}</h1>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                {exhibition.date && <span>📅 {formatDate(exhibition.date)}</span>}
                {exhibition.location && <span>📍 {exhibition.location}</span>}
                {exhibition.manager && <span>👤 {exhibition.manager}</span>}
              </div>
            </div>
            <button
              onClick={openEditModal}
              className="shrink-0 flex items-center gap-1.5 text-sm text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              수정
            </button>
          </div>
        </div>

        {/* 박람회 수정 모달 */}
        {showEditModal && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowEditModal(false); }}
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
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {editSaving ? "저장 중..." : "저장"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 기업명 수집 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">기업명 수집</h2>

          {/* 메인: URL 입력 */}
          <div className="flex gap-2">
            <input
              ref={urlInputRef}
              type="text"
              value={crawlUrl}
              onChange={(e) => setCrawlUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !crawling) handleCrawl(); }}
              placeholder="박람회 참가업체 페이지 주소를 붙여넣으세요"
              disabled={crawling}
              className="flex-1 min-w-0 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs text-gray-400 whitespace-nowrap">페이지 수</label>
              <input
                type="number"
                min={1}
                max={50}
                value={totalPages}
                onChange={(e) => setTotalPages(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                disabled={crawling}
                className="w-14 border border-gray-300 rounded-xl px-2 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>
            {!crawling ? (
              <button
                onClick={handleCrawl}
                disabled={!crawlUrl.trim()}
                className="flex items-center gap-1.5 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors shadow-sm whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                수집 시작
              </button>
            ) : (
              <button
                onClick={stopCrawl}
                className="flex items-center gap-1.5 bg-red-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors shadow-sm whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                중단
              </button>
            )}
          </div>

          {/* 수집 진행 바 */}
          {crawlProgress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <SpinnerIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>수집 중...</span>
                </div>
                <span className="text-indigo-600 font-medium">{crawlProgress.found}개 발견</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className="bg-indigo-500 h-1.5 rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          {crawlError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{crawlError}</p>
          )}

          {crawlMsg && !crawlError && !crawlProgress && (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="flex-1 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {crawlMsg}
              </p>
              {showContinue && (
                <button
                  onClick={handleContinueCrawl}
                  disabled={crawling}
                  className="flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  계속 찾기
                </button>
              )}
            </div>
          )}

          {/* 수집이 안 됐나요? 아코디언 */}
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={() => setShowFallback((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors select-none"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${showFallback ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              수집이 안 됐나요?
            </button>

            {showFallback && (
              <div className="mt-3 space-y-3">

                {/* 방법 1: 옵션 */}
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">방법 1 — 수집 옵션 조정</p>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={infiniteScroll}
                        onChange={(e) => setInfiniteScroll(e.target.checked)}
                        disabled={crawling}
                        className="w-4 h-4 accent-indigo-600 mt-0.5 shrink-0"
                      />
                      <span className="text-xs text-gray-700">
                        <span className="font-medium">스크롤 수집</span>
                        <span className="text-gray-400 ml-1">— 페이지를 내릴 때 기업이 더 나타나는 사이트</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useAI}
                        onChange={(e) => setUseAI(e.target.checked)}
                        disabled={crawling}
                        className="w-4 h-4 accent-indigo-600 mt-0.5 shrink-0"
                      />
                      <span className="text-xs text-gray-700">
                        <span className="font-medium">AI 추출</span>
                        <span className="text-gray-400 ml-1">— 일반 수집으로 찾지 못할 때 AI가 직접 분석</span>
                      </span>
                    </label>
                  </div>
                  {(infiniteScroll || useAI) && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleCrawl}
                        disabled={crawling || !crawlUrl.trim()}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
                      >
                        {crawling ? "수집 중..." : "옵션 적용 후 수집"}
                      </button>
                    </div>
                  )}
                </div>

                {/* 방법 2: HTML 붙여넣기 */}
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">방법 2 — 페이지 내용 직접 붙여넣기</p>
                  <ol className="text-xs text-gray-500 list-decimal list-inside space-y-0.5">
                    <li>Chrome에서 박람회 참가업체 페이지 열기</li>
                    <li>F12 → Elements 탭 → 기업 목록 영역 우클릭</li>
                    <li>Copy → Copy outerHTML → 아래 칸에 붙여넣기</li>
                  </ol>
                  <textarea
                    value={pastedHtml}
                    onChange={(e) => setPastedHtml(e.target.value)}
                    placeholder="복사한 HTML을 여기에 붙여넣으세요"
                    disabled={crawling}
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 resize-none bg-white"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handlePasteCrawl}
                      disabled={crawling || !pastedHtml.trim()}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
                    >
                      {crawling ? "추출 중..." : "기업명 추출"}
                    </button>
                  </div>
                </div>

                {/* 방법 3: 고급 수집 */}
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">방법 3 — 고급 수집 <span className="text-gray-400 font-normal">(방법 1·2로도 안 될 때)</span></p>
                  <ol className="text-xs text-gray-500 list-decimal list-inside space-y-0.5">
                    <li>Chrome에서 참가업체 페이지 열기 → F12 → Network 탭 → XHR 필터</li>
                    <li>페이지 새로고침 → exhibitor · company 등 이름의 항목 우클릭</li>
                    <li>Copy → <strong>Copy as cURL</strong> → 아래 칸에 붙여넣기</li>
                  </ol>
                  <textarea
                    value={curlInput}
                    onChange={(e) => setCurlInput(e.target.value)}
                    placeholder={"curl 'https://api.example.com/exhibitors' --data-raw '{...}'"}
                    disabled={crawling}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 resize-none bg-white"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleApiCrawl}
                      disabled={crawling || !curlInput.trim()}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
                    >
                      {crawling ? "수집 중..." : "전체 수집"}
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* 기업 목록 */}
        {companies.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">

            {/* 테이블 헤더 */}
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    기업 목록 <span className="text-gray-400 font-normal">{companies.length}개</span>
                  </h2>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1" />확정 {confirmed}</span>
                    <span><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block mr-1" />대기 {pending}</span>
                    <span><span className="w-1.5 h-1.5 rounded-full bg-red-300 inline-block mr-1" />제외 {excluded}</span>
                    {enrichedCount > 0 && <span className="text-indigo-600 font-medium">· 연락처 {enrichedCount}개</span>}
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 && !enrichProgress && (
                    <>
                      <button
                        onClick={() => setConfirmDeleteSelected(true)}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        선택 삭제 ({selectedIds.size})
                      </button>
                      <button
                        onClick={() => startEnrich()}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors shadow-sm"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        기업정보 수집 ({selectedIds.size})
                      </button>
                    </>
                  )}
                  <button
                    onClick={downloadExcel}
                    disabled={companies.length === 0}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    엑셀 다운로드
                  </button>
                  <button
                    onClick={() => setConfirmReset(true)}
                    disabled={resetting}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    연락처 초기화
                  </button>
                </div>
              </div>

              {/* 기업정보 수집 진행 */}
              {enrichProgress && (
                <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-indigo-700">
                      {!enrichPaused && <SpinnerIcon className="w-4 h-4 text-indigo-500" />}
                      {enrichPaused && <span className="w-4 h-4 flex items-center justify-center text-amber-500">⏸</span>}
                      <span className="font-medium">
                        {enrichPaused ? "일시정지됨" : "기업정보 수집 중"}
                      </span>
                      <span className="text-indigo-500">
                        {enrichProgress.current}/{enrichProgress.total}
                        {enrichProgress.name && ` — ${enrichProgress.name}`}
                      </span>
                      {(enrichProgress.found > 0 || enrichProgress.failed > 0) && (
                        <span className="text-xs text-gray-500 ml-1">
                          {enrichProgress.found > 0 && <span className="text-emerald-600 font-medium">✓{enrichProgress.found}</span>}
                          {enrichProgress.failed > 0 && <span className="text-red-500 font-medium ml-1">✗{enrichProgress.failed}</span>}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!enrichPaused ? (
                        <button
                          onClick={pauseEnrich}
                          className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium transition-colors border border-amber-200"
                        >
                          일시정지
                        </button>
                      ) : (
                        <button
                          onClick={resumeEnrich}
                          className="text-xs px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors"
                        >
                          계속하기
                        </button>
                      )}
                      <button
                        onClick={stopEnrich}
                        className="text-xs px-2.5 py-1 rounded-lg bg-white text-gray-600 hover:bg-gray-100 font-medium transition-colors border border-gray-200"
                      >
                        중단
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-indigo-100 rounded-full h-1.5">
                    <div
                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${(enrichProgress.current / enrichProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={(el) => { if (el) el.indeterminate = isPartial; }}
                        onChange={toggleAll}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                      />
                    </th>
                    {(
                      [
                        { col: "name" as SortCol, label: "기업명" },
                        { col: "score" as SortCol, label: "점수" },
                        { col: "homepage" as SortCol, label: "홈페이지" },
                        { col: "email" as SortCol, label: "이메일" },
                        { col: "phone" as SortCol, label: "전화번호" },
                        { col: "status" as SortCol, label: "상태" },
                      ] as { col: SortCol; label: string }[]
                    ).map(({ col, label }) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                      >
                        {col === "email" ? (
                          <div className="flex items-center gap-1.5">
                            <span>{label}</span>
                            <SortIcon col={col} active={sortCol === col} dir={sortDir} />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const allEmails = [...new Set(companies.flatMap((c) => c.emails).filter(Boolean))];
                                if (allEmails.length === 0) return;
                                navigator.clipboard.writeText(allEmails.join("\n")).then(() => {
                                  setEmailCopied(true);
                                  setTimeout(() => setEmailCopied(false), 2000);
                                });
                              }}
                              title="이메일 전체 복사"
                              className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium transition-colors border border-indigo-100 whitespace-nowrap normal-case tracking-normal"
                            >
                              {emailCopied ? "복사됨 ✓" : "전체 복사"}
                            </button>
                          </div>
                        ) : (
                          <>
                            {label}
                            <SortIcon col={col} active={sortCol === col} dir={sortDir} />
                          </>
                        )}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedCompanies.map((c, rowIndex) => {
                    const isUpdating = updatingIds.has(c.id);
                    const isDeleting = deletingIds.has(c.id);
                    const isSelected = selectedIds.has(c.id);
                    const rowCls =
                      isDeleting ? "opacity-30" :
                      c.status === "excluded" ? "opacity-40 bg-gray-50" :
                      isSelected ? "bg-indigo-50/50" :
                      c.status === "confirmed" ? "bg-emerald-50/30" :
                      "";

                    return (
                      <tr key={c.id} className={`hover:bg-gray-50/70 transition-colors ${rowCls}`}>
                        {/* 체크박스 */}
                        <td className="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={c.status === "excluded" || isDeleting}
                            onChange={(e) => toggleOne(c.id, rowIndex, ((e.nativeEvent as MouseEvent).shiftKey) ?? false)}
                            className="w-4 h-4 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
                          />
                        </td>

                        {/* 기업명 */}
                        <td className="px-3 py-2.5 min-w-[140px]">
                          <Link
                            href={`/companies/${c.id}`}
                            className="font-medium text-gray-900 hover:text-indigo-700 transition-colors block"
                          >
                            {c.normalized_name || c.raw_name}
                          </Link>
                          {c.normalized_name && c.normalized_name !== c.raw_name && (
                            <span className="text-xs text-gray-400">{c.raw_name}</span>
                          )}
                        </td>

                        {/* 점수 */}
                        <td className="px-3 py-2.5 text-center">
                          <ScoreBadge score={c.score} />
                        </td>

                        {/* 홈페이지 (수기 입력 가능, 값 있으면 링크) */}
                        <td className="px-3 py-2.5 min-w-[160px] max-w-[200px]">
                          <EditableCell
                            value={c.homepage ?? ""}
                            placeholder="홈페이지 입력"
                            onSave={(v) => saveContact(c.id, "homepage", v)}
                            isUrl
                          />
                        </td>

                        {/* 이메일 (수기 입력 가능) */}
                        <td className="px-3 py-2.5 min-w-[160px] max-w-[200px]">
                          <EditableCell
                            value={c.emails[0] ?? ""}
                            placeholder="이메일 입력"
                            onSave={(v) => saveContact(c.id, "email", v)}
                          />
                        </td>

                        {/* 전화 (수기 입력 가능) */}
                        <td className="px-3 py-2.5 min-w-[120px]">
                          <EditableCell
                            value={c.phones[0] ?? ""}
                            placeholder="전화번호 입력"
                            onSave={(v) => saveContact(c.id, "phone", v)}
                          />
                        </td>

                        {/* 상태 */}
                        <td className="px-3 py-2.5">
                          <StatusBadge status={c.status} />
                        </td>

                        {/* 액션 */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            {c.status !== "confirmed" && (
                              <button
                                disabled={isUpdating}
                                onClick={() => updateStatus(c.id, "confirmed")}
                                className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium transition-colors disabled:opacity-40"
                              >
                                확정
                              </button>
                            )}
                            {c.status !== "excluded" ? (
                              <button
                                disabled={isUpdating}
                                onClick={() => updateStatus(c.id, "excluded")}
                                className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 font-medium transition-colors disabled:opacity-40"
                              >
                                제외
                              </button>
                            ) : (
                              <button
                                disabled={isUpdating}
                                onClick={() => updateStatus(c.id, "candidate")}
                                className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 font-medium transition-colors disabled:opacity-40"
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

            {/* 하단 전체선택 */}
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <button onClick={toggleAll} className="text-xs text-gray-500 hover:text-indigo-600 font-medium transition-colors">
                {isAllSelected ? "전체 선택 해제" : "전체 선택"}
              </button>
              <span>
                {selectedIds.size > 0
                  ? <span className="text-indigo-600 font-medium">{selectedIds.size}개 선택됨</span>
                  : "기업을 선택하여 일괄 작업"}
              </span>
            </div>
          </div>
        )}

        {/* 빈 상태 */}
        {companies.length === 0 && !crawling && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">수집된 기업이 없습니다</p>
            <p className="text-xs text-gray-400">URL을 입력하고 기업명 수집을 시작하세요.</p>
          </div>
        )}
      </main>

      {/* 삭제 확인 다이얼로그 */}
      {confirmDeleteSelected && (
        <Dialog
          title={`선택한 ${selectedIds.size}개 기업을 삭제할까요?`}
          description="삭제된 기업과 수집된 연락처 데이터가 모두 제거됩니다. 이 작업은 되돌릴 수 없습니다."
          confirmLabel="삭제"
          confirmClass="bg-red-500 hover:bg-red-600"
          onConfirm={deleteSelected}
          onCancel={() => setConfirmDeleteSelected(false)}
        />
      )}

      {/* 초기화 확인 다이얼로그 */}
      {confirmReset && (
        <Dialog
          title="연락처 정보를 초기화할까요?"
          description="이 박람회의 모든 홈페이지/이메일/전화번호 수집 결과가 삭제됩니다. 기업 목록은 유지됩니다."
          confirmLabel={resetting ? "초기화 중..." : "초기화"}
          confirmClass="bg-red-500 hover:bg-red-600"
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}

/* ─── 확인 다이얼로그 컴포넌트 ─── */
function Dialog({
  title,
  description,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-5">{description}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
