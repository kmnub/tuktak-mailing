// Firecrawl API 래퍼 — 비즈니스 로직 없이 API 호출만 담당

export interface FirecrawlResult {
  markdown?: string;
  html?: string;
  title?: string;
}

async function callFirecrawl(
  url: string,
  apiKey: string,
  timeoutMs: number,
  body: object
): Promise<FirecrawlResult | null> {
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.success || !data.data) return null;

    return {
      markdown: data.data.markdown ?? undefined,
      html: data.data.html ?? undefined,
      title: data.data.metadata?.title ?? undefined,
    };
  } catch {
    return null;
  }
}

/** 일반 페이지 스크래핑 */
export async function scrapeWithFirecrawl(
  url: string,
  apiKey: string,
  timeoutMs = 12000
): Promise<FirecrawlResult | null> {
  return callFirecrawl(url, apiKey, timeoutMs, {
    url,
    formats: ["markdown", "html"],
    onlyMainContent: false,
  });
}

/**
 * 무한 스크롤 페이지 스크래핑.
 * scrolls 횟수만큼 아래로 스크롤하며 콘텐츠를 모두 로드한 뒤 HTML 반환.
 */
export async function scrapeWithScroll(
  url: string,
  apiKey: string,
  scrolls = 10,
  timeoutMs = 60000
): Promise<FirecrawlResult | null> {
  // 스크롤 action 배열 생성: scroll → wait 반복
  const actions: object[] = [];
  for (let i = 0; i < scrolls; i++) {
    actions.push({ type: "scroll", direction: "down", amount: 1000 });
    actions.push({ type: "wait", milliseconds: 800 });
  }

  return callFirecrawl(url, apiKey, timeoutMs, {
    url,
    formats: ["html"],
    onlyMainContent: false,
    actions,
  });
}
