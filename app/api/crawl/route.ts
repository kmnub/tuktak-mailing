import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { extractCompanies } from "@/lib/parser/extract-companies";
import { extractCompaniesWithAI } from "@/lib/ai/extract-with-ai";
import { extractCompaniesAI } from "@/lib/crawl/ai-extractor";
import { scrapeWithFirecrawl, scrapeWithScroll } from "@/lib/integrations/firecrawl";
import { scoreAll, type RawCandidate } from "@/lib/scoring/score-company";
import { filterCompanies } from "@/lib/filter/filter-companies";
import { supabase } from "@/lib/supabase/client";

// Playwright 크롤링은 최대 60초
export const maxDuration = 60;

const MAX_PAGES = 100;
const FETCH_TIMEOUT_MS = 15000;
const PLAYWRIGHT_THRESHOLD = 5; // 이 수 이하면 Playwright 시도

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

/** body 전체 텍스트 추출 (AI fallback용) */
function getCleanText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
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
 */
async function buildPageUrls(
  firstHtml: string,
  originalUrl: string,
  totalPages: number
): Promise<string[]> {
  const base = new URL(originalUrl);
  const PAGE_PARAMS = ["page", "cpage", "p", "pagenum", "pg"];

  for (const param of PAGE_PARAMS) {
    if (base.searchParams.has(param)) {
      return Array.from({ length: totalPages - 1 }, (_, i) => {
        const u = new URL(originalUrl);
        u.searchParams.set(param, String(i + 2));
        return u.toString();
      });
    }
  }

  for (const param of PAGE_PARAMS) {
    const testUrl = new URL(originalUrl);
    testUrl.searchParams.set(param, "2");
    const testHtml = await fetchHtml(testUrl.toString());
    if (testHtml && testHtml !== firstHtml) {
      return Array.from({ length: totalPages - 1 }, (_, i) => {
        const u = new URL(originalUrl);
        u.searchParams.set(param, String(i + 2));
        return u.toString();
      });
    }
  }

  return Array.from({ length: totalPages - 1 }, (_, i) => {
    const u = new URL(originalUrl);
    u.searchParams.set("page", String(i + 2));
    return u.toString();
  });
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "요청 본문이 필요합니다." }, { status: 400 });
    }

    const b = body as Record<string, unknown>;

    // ── HTML 직접 붙여넣기 모드 ──────────────────────────────────────────────
    if ("html" in b && typeof b.html === "string") {
      const pastedHtml = b.html.trim();
      const sourceUrl = typeof b.url === "string" ? b.url : "pasted";
      const exhibitionId = typeof b.exhibitionId === "string" ? b.exhibitionId : undefined;

      if (!pastedHtml) {
        return NextResponse.json({ error: "HTML이 비어 있습니다." }, { status: 400 });
      }

      const crawlId = crypto.randomUUID();
      const rawCandidates = extractCompanies(pastedHtml, sourceUrl);
      const scored = scoreAll(rawCandidates);
      const filtered = filterCompanies(scored);

      if (filtered.length > 0) {
        const records = filtered.map((c) => ({
          crawl_id: crawlId,
          ...(exhibitionId && { exhibition_id: exhibitionId }),
          raw_name: c.name,
          normalized_name: c.normalizedName,
          source_url: c.source_url,
          score: c.score,
          selector: c.selector,
          extraction_method: "html-paste",
          status: "candidate" as const,
        }));
        const { error: dbError } = await supabase.from("company_candidates").insert(records);
        if (dbError) {
          return NextResponse.json({ error: `DB 저장 실패: ${dbError.message}` }, { status: 500 });
        }
      }

      return NextResponse.json({
        success: true,
        crawl_id: crawlId,
        source_url: sourceUrl,
        pages_fetched: 1,
        extraction_method: "html-paste",
        count: filtered.length,
        companies: filtered.map((c) => ({ name: c.name, score: c.score })),
      });
    }

    // ── URL 크롤 모드 ────────────────────────────────────────────────────────
    if (!("url" in b) || typeof b.url !== "string") {
      return NextResponse.json({ error: "url 또는 html 필드가 필요합니다." }, { status: 400 });
    }

    const {
      url,
      useAI = false,
      totalPages,
      exhibitionId,
      singlePage = false,
      infiniteScroll = false,
      scrollCount = 20,
    } = b as {
      url: string;
      useAI?: boolean;
      totalPages?: number;
      exhibitionId?: string;
      singlePage?: boolean;
      infiniteScroll?: boolean;
      scrollCount?: number;
    };

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
    const crawlId = crypto.randomUUID();

    // ── [1] 첫 페이지 수집 ──────────────────────────────────────────────────
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    let firstHtml: string | null = null;
    let extractionMethod: "html" | "firecrawl" | "ai" = "html";

    // 무한 스크롤 모드: 바로 Firecrawl 스크롤 액션 사용
    if (infiniteScroll && firecrawlKey) {
      console.log(`[크롤링] 무한 스크롤 모드 — Firecrawl scroll x${scrollCount}`);
      const fcResult = await scrapeWithScroll(url, firecrawlKey, scrollCount, 90000);
      if (fcResult?.html) {
        firstHtml = fcResult.html;
        extractionMethod = "firecrawl";
      }
    }

    // 일반 모드: fetch 우선, 결과 부족하면 Firecrawl
    if (!firstHtml) {
      firstHtml = await fetchHtml(url);
      const quickCheck = firstHtml ? extractCompanies(firstHtml, url) : [];
      if (quickCheck.length < PLAYWRIGHT_THRESHOLD && firecrawlKey) {
        console.log(`[크롤링] 정적 결과 ${quickCheck.length}개 → Firecrawl 시도`);
        const fcResult = await scrapeWithFirecrawl(url, firecrawlKey, 30000);
        if (fcResult?.html) {
          firstHtml = fcResult.html;
          extractionMethod = "firecrawl";
        }
      }
    }

    if (!firstHtml) {
      return NextResponse.json(
        { error: "페이지 접근 실패: HTML을 가져올 수 없습니다." },
        { status: 502 }
      );
    }

    // ── [2] 추가 페이지 URL 결정 ────────────────────────────────────────────
    let additionalPageUrls: string[];
    if (infiniteScroll || singlePage) {
      additionalPageUrls = [];
    } else if (totalPages && totalPages > 1) {
      additionalPageUrls = await buildPageUrls(firstHtml, url, totalPages);
    } else {
      additionalPageUrls = detectPageUrls(firstHtml, url);
    }

    // ── [3] 추가 페이지 병렬 수집 ───────────────────────────────────────────
    const additionalHtmls = await Promise.all(
      additionalPageUrls.map(async (pageUrl) => {
        const html = await fetchHtml(pageUrl);
        const check = html ? extractCompanies(html, pageUrl) : [];
        if (check.length < PLAYWRIGHT_THRESHOLD && firecrawlKey) {
          const fcResult = await scrapeWithFirecrawl(pageUrl, firecrawlKey, 30000);
          return fcResult?.html ?? html;
        }
        return html;
      })
    );

    const allPages: { html: string; pageUrl: string }[] = [
      { html: firstHtml, pageUrl: url },
      ...additionalPageUrls
        .map((pageUrl, i) => ({ html: additionalHtmls[i], pageUrl }))
        .filter((p): p is { html: string; pageUrl: string } => p.html !== null),
    ];

    console.log(
      `[크롤링] ${url} — ${allPages.length}페이지, 추출방법: ${shouldUseAI ? "AI(명시)" : extractionMethod}`
    );

    // ── [4] 기업명 추출 ──────────────────────────────────────────────────────
    let rawCandidates: RawCandidate[];

    if (shouldUseAI) {
      // 사용자가 "AI 추출 사용" 체크 → extract-with-ai 사용
      extractionMethod = "ai";
      const perPageResults = await Promise.all(
        allPages.map(({ html, pageUrl }) =>
          extractCompaniesWithAI(html, pageUrl).catch((err) => {
            console.error(`[AI 추출 오류] ${pageUrl}:`, err);
            return extractCompanies(html, pageUrl);
          })
        )
      );
      rawCandidates = perPageResults.flat().map((c) => ({
        ...c,
        selector: (c as { selector?: string }).selector ?? "ai",
      }));
    } else {
      // 정적 추출
      rawCandidates = allPages.flatMap(({ html, pageUrl }) =>
        extractCompanies(html, pageUrl)
      );

      // ── [5] AI auto-fallback: 결과가 너무 적으면 최후 시도 ─────────────
      if (rawCandidates.length < PLAYWRIGHT_THRESHOLD && process.env.OPENAI_API_KEY) {
        console.log(`[크롤링] 결과 ${rawCandidates.length}개 → AI fallback 시도`);
        extractionMethod = "ai";
        const aiResults = await extractCompaniesAI(
          getCleanText(firstHtml),
          url
        );
        rawCandidates = [...rawCandidates, ...aiResults];
      }
    }

    // ── [6] 스코어링 → 필터링 ───────────────────────────────────────────────
    const scored = scoreAll(rawCandidates);
    const filtered = filterCompanies(scored);

    // ── [7] DB 저장 ──────────────────────────────────────────────────────────
    // 같은 박람회에 이미 수집된 기업은 중복 삽입하지 않음
    let toInsert = filtered;
    if (exhibitionId && filtered.length > 0) {
      const { data: existing } = await supabase
        .from("company_candidates")
        .select("normalized_name")
        .eq("exhibition_id", exhibitionId);
      const existingNames = new Set((existing ?? []).map((e) => e.normalized_name));
      toInsert = filtered.filter((c) => !existingNames.has(c.normalizedName));
    }

    if (toInsert.length > 0) {
      const records = toInsert.map((c) => ({
        crawl_id: crawlId,
        ...(exhibitionId && { exhibition_id: exhibitionId }),
        raw_name: c.name,
        normalized_name: c.normalizedName,
        source_url: c.source_url,
        score: c.score,
        selector: c.selector,
        extraction_method: extractionMethod,
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
      crawl_id: crawlId,
      source_url: url,
      pages_fetched: allPages.length,
      extraction_method: extractionMethod,
      count: toInsert.length,
      companies: toInsert.map((c) => ({ name: c.name, score: c.score })),
    });
  } catch (err) {
    console.error("[크롤링 API 오류]", err);
    return NextResponse.json({ error: "서버 내부 오류가 발생했습니다." }, { status: 500 });
  }
}
