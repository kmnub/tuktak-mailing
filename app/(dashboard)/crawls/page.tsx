"use client";

import { useState } from "react";

interface CrawlResponse {
  success: boolean;
  source_url: string;
  pages_fetched: number;
  extraction_method: "ai" | "static";
  count: number;
  companies: string[];
}

function isValidUrl(value: string): boolean {
  return /^https?:\/\/.+/.test(value);
}

export default function CrawlsPage() {
  const [url, setUrl] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CrawlResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isValidUrl(url)) {
      setError("http:// 또는 https://로 시작하는 URL을 입력해주세요.");
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, useAI }),
      });

      const data: CrawlResponse & { error?: string } = await res.json();

      if (!res.ok) {
        setError(data.error ?? "알 수 없는 오류가 발생했습니다.");
        return;
      }

      setResult(data);
      console.log("[크롤링 결과]", data);
    } catch {
      setError("요청 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">박람회 기업명 추출</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://expo-example.co.kr/exhibitors"
          disabled={loading}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />

        <label className="flex items-center gap-2 text-sm text-gray-600 select-none cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) => setUseAI(e.target.checked)}
            disabled={loading}
            className="w-4 h-4 accent-blue-600"
          />
          AI 추출 사용
          <span className="text-xs text-gray-400">(OpenAI GPT — 문맥 기반, 더 정확)</span>
        </label>

        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "크롤링 중..." : "크롤링 시작"}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6">
          <p className="text-sm text-gray-500 mb-2">
            추출된 기업 후보:{" "}
            <span className="font-semibold text-gray-800">{result.count}개</span>
            {" · "}
            {result.pages_fetched}페이지 수집
            {" · "}
            <span className={result.extraction_method === "ai" ? "text-blue-600" : "text-gray-500"}>
              {result.extraction_method === "ai" ? "AI 추출" : "정적 추출"}
            </span>
          </p>
          <ul className="border border-gray-200 rounded divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {result.companies.map((name, i) => (
              <li key={i} className="px-3 py-2 text-sm text-gray-700">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
