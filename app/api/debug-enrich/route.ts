import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { searchSerper } from "@/lib/integrations/serper";
import { scrapeWithFirecrawl } from "@/lib/integrations/firecrawl";

export const maxDuration = 30;

// 진단 전용 엔드포인트 — 각 단계별 결과 확인
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const companyName = (body.name as string) || "삼성전자";

  const result: Record<string, unknown> = { companyName };

  // [1] 환경변수
  try {
    const env = getServerEnv();
    result.env = {
      SERPER: env.SERPER_API_KEY ? `설정됨 (${env.SERPER_API_KEY.slice(0, 6)}...)` : "없음",
      FIRECRAWL: env.FIRECRAWL_API_KEY ? `설정됨 (${env.FIRECRAWL_API_KEY.slice(0, 6)}...)` : "없음",
      OPENAI: env.OPENAI_API_KEY ? `설정됨 (${env.OPENAI_API_KEY.slice(0, 6)}...)` : "없음",
    };

    // [2] Serper 검색
    try {
      const serperResults = await searchSerper(`${companyName} 공식 홈페이지`, env.SERPER_API_KEY, 3);
      result.serper = {
        ok: true,
        count: serperResults.length,
        top: serperResults.slice(0, 3).map((r) => ({ title: r.title, link: r.link })),
      };

      // [3] Firecrawl 테스트 (첫 번째 결과로)
      if (serperResults.length > 0) {
        const testUrl = serperResults[0].link;
        try {
          const fc = await scrapeWithFirecrawl(testUrl, env.FIRECRAWL_API_KEY, 12000);
          result.firecrawl = {
            url: testUrl,
            ok: !!fc?.html,
            htmlLength: fc?.html?.length ?? 0,
            title: fc?.title ?? null,
          };
        } catch (e) {
          result.firecrawl = { ok: false, error: String(e) };
        }
      }
    } catch (e) {
      result.serper = { ok: false, error: String(e) };
    }
  } catch (e) {
    result.env = { error: String(e) };
  }

  return NextResponse.json(result, { status: 200 });
}
