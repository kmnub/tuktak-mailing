import { searchSerper } from "@/lib/integrations/serper";

export interface WebsiteCandidate {
  url: string;
  source: "serper";
  title: string;
  snippet?: string;
  confidence: number;
  reason: string[];
}

// 블랙리스트 도메인 — 저장 금지
const BLACKLIST_DOMAINS = [
  "coupang.com",
  "auction.co.kr",
  "11st.co.kr",
  "smartstore.naver.com",
  "daangn.com",
  "blog.naver.com",
  "tistory.com",
  "brunch.co.kr",
  "news.naver.com",
  "news.daum.net",
  "m.news.naver.com",
  "gmarket.co.kr",
  "wemakeprice.com",
  "interpark.com",
  "namu.wiki",
  "wikipedia.org",
  "naver.com",
  "kakao.com",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "blog.kakao.com",
];

// URL 경로에 포함되면 제외
const BLACKLIST_PATH_KEYWORDS = [
  "smartstore",
  "/blog/",
  "/news/",
  "/shopping/",
  "/product/",
];

function isBlacklisted(url: string): { blocked: boolean; reason: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    for (const d of BLACKLIST_DOMAINS) {
      if (host === d || host.endsWith(`.${d}`)) {
        return { blocked: true, reason: `블랙리스트 도메인: ${d}` };
      }
    }

    const fullUrl = url.toLowerCase();
    for (const kw of BLACKLIST_PATH_KEYWORDS) {
      if (fullUrl.includes(kw)) {
        return { blocked: true, reason: `블랙리스트 키워드: ${kw}` };
      }
    }

    return { blocked: false, reason: "" };
  } catch {
    return { blocked: true, reason: "유효하지 않은 URL" };
  }
}

// 우선 TLD — 공식 홈페이지 가능성 높음
const PRIORITY_TLDS = [".co.kr", ".com", ".kr"];

function scoreCandidate(
  position: number,
  url: string,
  snippet?: string
): { confidence: number; reasons: string[] } {
  const reasons: string[] = [`검색 순위 ${position}위`];
  // 위치 기반 기본 점수 (1위=0.55, 2위=0.45, ...)
  let confidence = Math.max(0.15, 0.55 - (position - 1) * 0.1);

  if (PRIORITY_TLDS.some((t) => url.includes(t))) {
    confidence += 0.05;
    reasons.push("공식 도메인(.co.kr/.com/.kr)");
  }

  if (
    snippet &&
    (snippet.includes("공식") ||
      snippet.toLowerCase().includes("official") ||
      snippet.includes("홈페이지") ||
      snippet.includes("대표 홈"))
  ) {
    confidence += 0.1;
    reasons.push("공식 홈페이지 언급");
  }

  return { confidence: Math.min(Math.round(confidence * 100) / 100, 0.85), reasons };
}

export async function findOfficialWebsiteCandidates(
  companyName: string,
  serperApiKey: string
): Promise<WebsiteCandidate[]> {
  const query = `${companyName} 공식 홈페이지`;
  const results = await searchSerper(query, serperApiKey, 8);

  const candidates: WebsiteCandidate[] = [];

  for (const result of results) {
    const { blocked } = isBlacklisted(result.link);
    if (blocked) continue;

    const { confidence, reasons } = scoreCandidate(result.position, result.link, result.snippet);

    candidates.push({
      url: result.link,
      source: "serper",
      title: result.title,
      snippet: result.snippet,
      confidence,
      reason: reasons,
    });

    if (candidates.length >= 3) break;
  }

  return candidates;
}
