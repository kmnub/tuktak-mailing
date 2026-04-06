import * as cheerio from "cheerio";
import { scrapeWithFirecrawl } from "@/lib/integrations/firecrawl";

export interface ValidationResult {
  validated: boolean;
  confidence: number;
  matchedSignals: string[];
  homepageUrl: string;
  pageTitle?: string;
  extractionMethod: "firecrawl" | "fetch";
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

// 회사명에서 의미 있는 키워드 추출 (법인 접미어 제거)
function extractKeywords(companyName: string): string[] {
  const cleaned = companyName
    .replace(/(주식회사|유한회사|유한책임회사|\(주\)|㈜|Co\.,?\s*Ltd\.?|Inc\.?|Corp\.?|LLC)/gi, "")
    .trim();

  return cleaned
    .split(/[\s,·\-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function analyzeHtml(
  html: string,
  companyName: string,
  url: string,
  fcTitle?: string
): { signals: string[]; score: number } {
  const $ = cheerio.load(html);
  const signals: string[] = [];
  let score = 0;

  const keywords = extractKeywords(companyName);
  const pageTitle = fcTitle ?? $("title").text().trim();
  const domain = getDomain(url);

  // 1. 페이지 제목에 기업명 포함 (+0.3)
  if (keywords.some((k) => pageTitle.includes(k))) {
    signals.push(`페이지 제목에 기업명 포함 ("${pageTitle.slice(0, 40)}")`);
    score += 0.3;
  }

  // 2. 도메인에 기업명 키워드 포함 (+0.25)
  const domainNorm = domain.replace(/[-_.]/g, "").split(".")[0];
  if (
    keywords.some(
      (k) =>
        domainNorm.includes(k.toLowerCase().replace(/\s/g, "")) ||
        k.toLowerCase().replace(/\s/g, "").includes(domainNorm)
    )
  ) {
    signals.push(`도메인에 기업명 키워드 포함 (${domain})`);
    score += 0.25;
  }

  // 3. 본문에 기업명 포함 (+0.15)
  $("script, style, nav, header, footer, noscript").remove();
  const bodyText = $("body").text();
  if (keywords.some((k) => bodyText.includes(k))) {
    signals.push("본문에 기업명 포함");
    score += 0.15;
  }

  // 4. contact/about 링크 존재 (+0.1)
  const links = $("a[href]")
    .map((_, el) => ($(el).attr("href") ?? "").toLowerCase())
    .get();
  const contactPaths = ["/contact", "/about", "/company", "/about-us", "/contact-us", "문의", "회사소개"];
  if (links.some((l) => contactPaths.some((p) => l.includes(p)))) {
    signals.push("연락처/회사소개 링크 존재");
    score += 0.1;
  }

  // 5. schema.org Organization (+0.1)
  const jsonLdScripts = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).html() ?? "")
    .get();
  if (jsonLdScripts.some((s) => s.includes("Organization"))) {
    signals.push("schema.org Organization 마크업 존재");
    score += 0.1;
  }

  // 6. 이메일 또는 전화번호 존재 (+0.1)
  const hasEmail = /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(bodyText);
  const hasPhone = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/.test(bodyText);
  if (hasEmail || hasPhone) {
    signals.push("이메일/전화번호 정보 존재");
    score += 0.1;
  }

  return { signals, score: Math.min(score, 1.0) };
}

async function fetchBasic(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** fetch 결과가 의미 있는 콘텐츠인지 확인 (JS 렌더링 전 빈 페이지 감지) */
function isThinContent(html: string): boolean {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.length < 200;
}

export async function validateOfficialWebsite(
  companyName: string,
  candidateUrl: string,
  firecrawlApiKey: string
): Promise<ValidationResult> {
  let html: string | null = null;
  let fcTitle: string | undefined;
  let method: "firecrawl" | "fetch" = "fetch";

  // fetch 먼저 시도
  html = await fetchBasic(candidateUrl);

  // fetch 실패 또는 콘텐츠가 너무 적으면 (JS 렌더링 페이지) Firecrawl 시도
  if (!html || isThinContent(html)) {
    const fcResult = await scrapeWithFirecrawl(candidateUrl, firecrawlApiKey);
    if (fcResult?.html) {
      html = fcResult.html;
      fcTitle = fcResult.title;
      method = "firecrawl";
    }
  }

  if (!html) {
    return {
      validated: false,
      confidence: 0,
      matchedSignals: ["페이지 접근 불가"],
      homepageUrl: candidateUrl,
      extractionMethod: method,
    };
  }

  const { signals, score } = analyzeHtml(html, companyName, candidateUrl, fcTitle);
  const roundedScore = Math.round(score * 100) / 100;

  // 페이지 타이틀 추출
  let pageTitle = fcTitle;
  if (!pageTitle) {
    const $ = cheerio.load(html);
    pageTitle = $("title").text().trim() || undefined;
  }

  return {
    validated: roundedScore >= 0.4,
    confidence: roundedScore,
    matchedSignals: signals,
    homepageUrl: candidateUrl,
    pageTitle,
    extractionMethod: method,
  };
}
