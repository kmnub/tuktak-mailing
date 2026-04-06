import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { extractCompanies } from "@/lib/parser/extract-companies";
import { extractCompaniesWithAI } from "@/lib/ai/extract-with-ai";
import { dedupe } from "@/lib/normalize/dedupe";
import { supabase } from "@/lib/supabase/client";

const MAX_PAGES = 50;
const FETCH_TIMEOUT_MS = 15000;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * 정적 HTML에서 페이지네이션 URL을 수집한다.
 * ?page=N / ?cpage=N / ?p=N 패턴만 허용.
 */
function detectPageUrls(html: string, originalUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(originalUrl);
  const urls = new Set<string>();

  const pagingEl = $(
    ".pagination, .paging, .page_nav, .paginate, .pages," +
      "[class*='paginat'], [class*='paging'], [class*='page_num']"
  );
  const anchors = pagingEl.length ? pagingEl.find("a") : $("a");

  anchors.each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href === "#" || href.startsWith("javascript")) return;

    let candidate: URL;
    try {
      candidate = new URL(href, base.origin);
    } catch {
      return;
    }

    if (candidate.pathname !== base.pathname) return;

    const pageParam =
      candidate.searchParams.get("page") ??
      candidate.searchParams.get("cpage") ??
      candidate.searchParams.get("p");
    if (!pageParam || !/^\d+$/.test(pageParam)) return;

    urls.add(candidate.toString());
  });

  urls.delete(originalUrl);
  return Array.from(urls).slice(0, MAX_PAGES - 1);
}

/**
 * 총 페이지 수를 지정하면 페이지 URL을 직접 생성한다.
 * 일반 파라미터명 후보(page, cpage, p)를 차례로 시도해 실제 콘텐츠가
 * 달라지는 파라미터를 선택한다.
 */
async function buildPageUrls(
  firstHtml: string,
  originalUrl: string,
  totalPages: number
): Promise<string[]> {
  const base = new URL(originalUrl);
  const PAGE_PARAMS = ["page", "cpage", "p", "pagenum", "pg"];

  // 이미 사용 중인 파라미터가 있으면 그대로 사용
  for (const param of PAGE_PARAMS) {
    if (base.searchParams.has(param)) {
      return Array.from({ length: totalPages - 1 }, (_, i) => {
        const u = new URL(originalUrl);
        u.searchParams.set(param, String(i + 2));
        return u.toString();
      });
    }
  }

  // 파라미터가 없으면 page=2 URL을 실제로 fetch해 1페이지와 내용이 다른지 확인
  for (const param of PAGE_PARAMS) {
    const testUrl = new URL(originalUrl);
    testUrl.searchParams.set(param, "2");
    const testHtml = await fetchHtml(testUrl.toString());
    if (testHtml && testHtml !== firstHtml) {
      // 내용이 다르면 이 파라미터가 페이지네이션용임
      return Array.from({ length: totalPages - 1 }, (_, i) => {
        const u = new URL(originalUrl);
        u.searchParams.set(param, String(i + 2));
        return u.toString();
      });
    }
  }

  // 판별 실패 시 기본값 page 사용
  return Array.from({ length: totalPages - 1 }, (_, i) => {
    const u = new URL(originalUrl);
    u.searchParams.set("page", String(i + 2));
    return u.toString();
  });
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();

    if (
      !body ||
      typeof body !== "object" ||
      !("url" in body) ||
      typeof body.url !== "string"
    ) {
      return NextResponse.json({ error: "url 필드가 필요합니다." }, { status: 400 });
    }

    const {
      url,
      useAI = false,
      totalPages,
    } = body as { url: string; useAI?: boolean; totalPages?: number };

    if (!/^https?:\/\/.+/.test(url)) {
      return NextResponse.json(
        { error: "http:// 또는 https://로 시작하는 URL을 입력해주세요." },
        { status: 400 }
      );
    }

    if (totalPages !== undefined && (totalPages < 1 || totalPages > MAX_PAGES)) {
      return NextResponse.json(
        { error: `totalPages는 1~${MAX_PAGES} 사이여야 합니다.` },
        { status: 400 }
      );
    }

    const shouldUseAI = useAI && !!process.env.OPENAI_API_KEY;

    // [1] 첫 페이지 수집
    const firstHtml = await fetchHtml(url);
    if (!firstHtml) {
      return NextResponse.json(
        { error: "페이지 접근 실패: HTML을 가져올 수 없습니다." },
        { status: 502 }
      );
    }

    // [2] 추가 페이지 URL 결정
    let additionalPageUrls: string[];

    if (totalPages && totalPages > 1) {
      // 사용자가 총 페이지 수를 직접 지정한 경우
      additionalPageUrls = await buildPageUrls(firstHtml, url, totalPages);
    } else {
      // 자동 탐지
      additionalPageUrls = detectPageUrls(firstHtml, url);
    }

    // [3] 추가 페이지 병렬 수집
    const additionalHtmls = await Promise.all(
      additionalPageUrls.map((pageUrl) => fetchHtml(pageUrl))
    );

    const allPages: { html: string; pageUrl: string }[] = [
      { html: firstHtml, pageUrl: url },
      ...additionalPageUrls
        .map((pageUrl, i) => ({ html: additionalHtmls[i], pageUrl }))
        .filter((p): p is { html: string; pageUrl: string } => p.html !== null),
    ];

    console.log(
      `[크롤링] ${url} — ${allPages.length}페이지, 추출방법: ${shouldUseAI ? "AI" : "정적"}`
    );

    // [4] 기업명 추출
    let rawCandidates: { name: string; source_url: string }[];

    if (shouldUseAI) {
      const perPageResults = await Promise.all(
        allPages.map(({ html, pageUrl }) =>
          extractCompaniesWithAI(html, pageUrl).catch((err) => {
            console.error(`[AI 추출 오류] ${pageUrl}:`, err);
            return extractCompanies(html, pageUrl);
          })
        )
      );
      rawCandidates = perPageResults.flat();
    } else {
      rawCandidates = allPages.flatMap(({ html, pageUrl }) =>
        extractCompanies(html, pageUrl)
      );
    }

    // [5] 중복 제거
    const uniqueCompanies = dedupe(rawCandidates);

    // [6] DB 저장
    if (uniqueCompanies.length > 0) {
      const records = uniqueCompanies.map((c) => ({
        raw_name: c.name,
        normalized_name: c.normalizedName,
        source_url: c.source_url,
        status: "candidate" as const,
      }));

      const { error: dbError } = await supabase
        .from("company_candidates")
        .insert(records);

      if (dbError) {
        console.error("[DB 저장 오류]", dbError.message);
        return NextResponse.json(
          { error: `DB 저장 실패: ${dbError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      source_url: url,
      pages_fetched: allPages.length,
      extraction_method: shouldUseAI ? "ai" : "static",
      count: uniqueCompanies.length,
      companies: uniqueCompanies.map((c) => c.name),
    });
  } catch (err) {
    console.error("[크롤링 API 오류]", err);
    return NextResponse.json({ error: "서버 내부 오류가 발생했습니다." }, { status: 500 });
  }
}
