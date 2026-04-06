// Firecrawl API 래퍼 — 비즈니스 로직 없이 API 호출만 담당

export interface FirecrawlResult {
  markdown?: string;
  html?: string;
  title?: string;
}

export async function scrapeWithFirecrawl(
  url: string,
  apiKey: string,
  timeoutMs = 12000
): Promise<FirecrawlResult | null> {
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        onlyMainContent: false,
      }),
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
