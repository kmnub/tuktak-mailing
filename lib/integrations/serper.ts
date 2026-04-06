// Serper API 래퍼 — 비즈니스 로직 없이 API 호출만 담당

export interface SerperResult {
  title: string;
  link: string;
  snippet?: string;
  position: number;
}

export async function searchSerper(
  query: string,
  apiKey: string,
  num = 8
): Promise<SerperResult[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num, gl: "kr", hl: "ko" }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Serper API 오류: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const organic: unknown[] = data.organic ?? [];

  return organic
    .filter(
      (r): r is { title?: string; link: string; snippet?: string; position?: number } =>
        r !== null &&
        typeof r === "object" &&
        typeof (r as Record<string, unknown>).link === "string"
    )
    .map((r, i) => ({
      title: r.title ?? "",
      link: r.link,
      snippet: r.snippet,
      position: r.position ?? i + 1,
    }));
}
