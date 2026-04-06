"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Company {
  id: string;
  raw_name: string;
  normalized_name: string;
  score: number;
  status: string;
  source_url: string;
  crawl_id: string;
}

interface Source {
  id: string;
  source_url: string;
  title?: string;
  confidence: number;
  reason: string[];
  is_official_candidate: boolean;
  is_selected: boolean;
}

interface Contact {
  id: string;
  homepage_url?: string;
  email?: string;
  telephone?: string;
  source_url?: string;
  extraction_method?: string;
  confidence: number;
  is_verified: boolean;
}

interface PageData {
  company: Company;
  sources: Source[];
  contacts: Contact[];
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 70 ? "bg-green-100 text-green-700" :
    pct >= 40 ? "bg-yellow-100 text-yellow-700" :
    "bg-gray-100 text-gray-500";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${color}`}>
      {pct}%
    </span>
  );
}

export default function CompanyDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [updatingSource, setUpdatingSource] = useState<Set<string>>(new Set());
  const [updatingContact, setUpdatingContact] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/companies/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runEnrich = async () => {
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const res = await fetch(`/api/companies/${id}/enrich`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setEnrichMsg(`오류: ${d.error}`);
      } else if (!d.success) {
        setEnrichMsg(d.message ?? "검색 결과 없음");
      } else {
        setEnrichMsg(
          `완료 — 홈페이지 후보 ${d.sourcesFound}개, 연락처 ${d.contactsFound}개${d.usedAIFallback ? " (AI fallback 사용)" : ""}`
        );
        load();
      }
    } catch {
      setEnrichMsg("네트워크 오류");
    } finally {
      setEnriching(false);
    }
  };

  const toggleSource = async (sourceId: string, current: boolean) => {
    setUpdatingSource((p) => new Set(p).add(sourceId));
    try {
      await fetch(`/api/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_selected: !current }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              sources: prev.sources.map((s) =>
                s.id === sourceId ? { ...s, is_selected: !current } : s
              ),
            }
          : prev
      );
    } finally {
      setUpdatingSource((p) => { const n = new Set(p); n.delete(sourceId); return n; });
    }
  };

  const toggleContact = async (contactId: string, current: boolean) => {
    setUpdatingContact((p) => new Set(p).add(contactId));
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_verified: !current }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              contacts: prev.contacts.map((c) =>
                c.id === contactId ? { ...c, is_verified: !current } : c
              ),
            }
          : prev
      );
    } finally {
      setUpdatingContact((p) => { const n = new Set(p); n.delete(contactId); return n; });
    }
  };

  if (loading) return <main className="max-w-3xl mx-auto px-4 py-10 text-sm text-gray-400">불러오는 중...</main>;
  if (error) return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
    </main>
  );
  if (!data) return null;

  const { company, sources, contacts } = data;

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          {company.crawl_id && (
            <Link href={`/crawls/${company.crawl_id}`} className="text-sm text-gray-400 hover:text-gray-600">
              ← 검수 목록
            </Link>
          )}
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{company.normalized_name || company.raw_name}</h1>
            {company.normalized_name && company.normalized_name !== company.raw_name && (
              <p className="text-sm text-gray-400 mt-0.5">원본: {company.raw_name}</p>
            )}
            <a
              href={company.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline mt-1 inline-block"
            >
              크롤링 출처 →
            </a>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={runEnrich}
              disabled={enriching}
              className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enriching ? "수집 중..." : sources.length > 0 ? "다시 수집" : "연락처 수집 시작"}
            </button>
            {enrichMsg && (
              <p className={`text-xs ${enrichMsg.startsWith("오류") ? "text-red-500" : "text-gray-500"}`}>
                {enrichMsg}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 공식 홈페이지 후보 */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          공식 홈페이지 후보 <span className="text-gray-400 font-normal text-sm">({sources.length}개)</span>
        </h2>
        {sources.length === 0 ? (
          <p className="text-sm text-gray-400">수집된 후보가 없습니다. 연락처 수집을 실행하세요.</p>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-10">선택</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">URL</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">신뢰도</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">근거</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sources.map((s) => (
                  <tr key={s.id} className={s.is_selected ? "bg-blue-50" : ""}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={s.is_selected}
                        disabled={updatingSource.has(s.id)}
                        onChange={() => toggleSource(s.id, s.is_selected)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline break-all text-xs"
                      >
                        {s.source_url}
                      </a>
                      {s.title && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{s.title}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ConfidenceBadge value={s.confidence} />
                    </td>
                    <td className="px-3 py-2">
                      <ul className="text-xs text-gray-500 space-y-0.5">
                        {s.reason.map((r, i) => (
                          <li key={i}>· {r}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 연락처 */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          연락처 <span className="text-gray-400 font-normal text-sm">({contacts.length}개)</span>
        </h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400">수집된 연락처가 없습니다.</p>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-14">검증</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-16">유형</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">값</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">신뢰도</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">수집 방법</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((c) => (
                  <tr key={c.id} className={c.is_verified ? "bg-green-50" : ""}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={c.is_verified}
                        disabled={updatingContact.has(c.id)}
                        onChange={() => toggleContact(c.id, c.is_verified)}
                        className="w-4 h-4 accent-green-600"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 font-medium">
                      {c.email ? "이메일" : "전화"}
                    </td>
                    <td className="px-3 py-2 text-gray-800 font-mono text-xs break-all">
                      {c.email ?? c.telephone}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ConfidenceBadge value={c.confidence} />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {c.extraction_method}
                      {c.extraction_method?.includes("openai") && (
                        <span className="ml-1 text-orange-500">(AI)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
