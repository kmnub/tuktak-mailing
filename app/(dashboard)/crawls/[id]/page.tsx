"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Candidate {
  id: string;
  raw_name: string;
  normalized_name: string;
  score: number;
  selector: string;
  source_url: string;
  extraction_method: string;
  status: "candidate" | "confirmed" | "excluded";
}

const SELECTOR_LABEL: Record<string, string> = {
  h2: "H2",
  h3: "H3",
  li: "LI",
  a: "A",
  ai: "AI",
};

const METHOD_COLOR: Record<string, string> = {
  html: "text-gray-500",
  playwright: "text-purple-600",
  ai: "text-blue-600",
};

export default function CrawlDetailPage() {
  const params = useParams();
  const crawlId = params.id as string;

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/crawl/${crawlId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setCandidates(data.candidates ?? []);
        }
      })
      .catch(() => setError("데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [crawlId]);

  const updateStatus = useCallback(
    async (id: string, status: "confirmed" | "excluded" | "candidate") => {
      setUpdating((prev) => new Set(prev).add(id));
      try {
        await fetch(`/api/candidates/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        setCandidates((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status } : c))
        );
      } finally {
        setUpdating((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    []
  );

  const confirmed = candidates.filter((c) => c.status === "confirmed");
  const pending = candidates.filter((c) => c.status === "candidate");
  const excluded = candidates.filter((c) => c.status === "excluded");

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10 text-sm text-gray-500">
        불러오는 중...
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
        <Link href="/crawls" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← 목록으로
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/crawls" className="text-sm text-gray-400 hover:text-gray-600">
          ← 뒤로
        </Link>
        <h1 className="text-2xl font-bold">기업명 검수</h1>
        <span className="text-sm text-gray-400 font-mono">{crawlId.slice(0, 8)}…</span>
      </div>

      <div className="flex gap-4 text-sm text-gray-500 mb-6">
        <span>전체 {candidates.length}개</span>
        <span className="text-green-600 font-medium">확정 {confirmed.length}개</span>
        <span>미결 {pending.length}개</span>
        <span className="text-red-500">제외 {excluded.length}개</span>
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-gray-400">후보가 없습니다.</p>
      ) : (
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-8">확정</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">기업명</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 w-14">점수</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 w-14">태그</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">방법</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 w-14">제외</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {candidates.map((c) => {
                const isUpdating = updating.has(c.id);
                const rowBg =
                  c.status === "confirmed"
                    ? "bg-green-50"
                    : c.status === "excluded"
                    ? "bg-red-50 opacity-50"
                    : "";

                return (
                  <tr key={c.id} className={rowBg}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={c.status === "confirmed"}
                        disabled={isUpdating}
                        onChange={(e) =>
                          updateStatus(c.id, e.target.checked ? "confirmed" : "candidate")
                        }
                        className="w-4 h-4 accent-green-600"
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-800">{c.raw_name}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          c.score >= 7
                            ? "bg-green-100 text-green-700"
                            : c.score >= 5
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {c.score}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-gray-400 font-mono">
                      {SELECTOR_LABEL[c.selector] ?? c.selector}
                    </td>
                    <td
                      className={`px-3 py-2 text-center text-xs ${
                        METHOD_COLOR[c.extraction_method] ?? "text-gray-400"
                      }`}
                    >
                      {c.extraction_method}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        disabled={isUpdating}
                        onClick={() =>
                          updateStatus(c.id, c.status === "excluded" ? "candidate" : "excluded")
                        }
                        className={`text-xs px-2 py-0.5 rounded border ${
                          c.status === "excluded"
                            ? "border-gray-300 text-gray-400"
                            : "border-red-200 text-red-500 hover:bg-red-50"
                        } disabled:opacity-40`}
                      >
                        {c.status === "excluded" ? "복원" : "제외"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
