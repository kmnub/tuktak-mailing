import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export const maxDuration = 60;

const BASE_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
};

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((curr: unknown, key) => {
    if (curr && typeof curr === "object" && !Array.isArray(curr))
      return (curr as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function detectListPath(data: Record<string, unknown>): string | null {
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val) && val.length > 0) return key;
  }
  return null;
}

function detectTotalPages(data: Record<string, unknown>): number {
  for (const val of Object.values(data)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const p = val as Record<string, unknown>;
      const tp = p.totalPage ?? p.totalPages ?? p.total_pages ?? p.lastPage ?? p.pageCount;
      if (typeof tp === "number" && tp > 0) return tp;
      if (typeof p.totalCnt === "number" && typeof p.pageList === "number" && p.pageList > 0)
        return Math.ceil(p.totalCnt / p.pageList);
    }
  }
  const tp = (data.totalPage ?? data.totalPages ?? data.total_pages) as number | undefined;
  return typeof tp === "number" && tp > 0 ? tp : 1;
}

function detectPageKey(body: Record<string, unknown>): string | null {
  const candidates = ["curPage", "page", "pageNo", "currentPage", "pageNum", "p", "pg"];
  return candidates.find((k) => k in body) ?? null;
}

const NAME_KEYS = [
  "companyNameKor", "companyName", "name", "exhibitorName",
  "title", "companyNm", "bizName", "corpName",
];

function extractCompanyName(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;

  for (const key of NAME_KEYS) {
    if (typeof obj[key] === "string" && (obj[key] as string).trim())
      return (obj[key] as string).trim();
  }

  for (const val of Object.values(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;
      for (const key of NAME_KEYS) {
        if (typeof nested[key] === "string" && (nested[key] as string).trim())
          return (nested[key] as string).trim();
      }
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { apiUrl, requestBody, exhibitionId, originHeader } = body as {
      apiUrl: string;
      requestBody: Record<string, unknown>;
      exhibitionId?: string;
      originHeader?: string;
    };

    if (!apiUrl || !requestBody) {
      return NextResponse.json({ error: "apiUrl과 requestBody가 필요합니다." }, { status: 400 });
    }

    const origin = originHeader ?? new URL(apiUrl).origin;
    const extraHeaders = { Origin: origin, Referer: origin + "/" };

    // ── [1] 첫 페이지 호출 & 구조 감지 ──────────────────────────────────
    const pageKey = detectPageKey(requestBody);
    const firstBody = { ...requestBody, ...(pageKey ? { [pageKey]: 1 } : {}) };

    const firstRes = await fetch(apiUrl, {
      method: "POST",
      headers: { ...BASE_HEADERS, ...extraHeaders },
      body: JSON.stringify(firstBody),
      signal: AbortSignal.timeout(15000),
    });

    if (!firstRes.ok) {
      return NextResponse.json({ error: `API 호출 실패: ${firstRes.status}` }, { status: 502 });
    }

    const firstData = (await firstRes.json()) as Record<string, unknown>;
    const listPath = detectListPath(firstData);

    if (!listPath) {
      return NextResponse.json(
        { error: "응답에서 기업 목록을 찾을 수 없습니다." },
        { status: 422 }
      );
    }

    const totalPages = detectTotalPages(firstData);
    const firstList = (getNestedValue(firstData, listPath) as unknown[]) ?? [];

    console.log(`[JSON API] ${apiUrl} — ${totalPages}페이지, 첫 페이지 ${firstList.length}개`);

    // ── [2] 나머지 페이지 병렬 호출 ─────────────────────────────────────
    const allItems: unknown[] = [...firstList];

    if (pageKey && totalPages > 1) {
      const rest = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      await Promise.all(
        rest.map(async (pageNum) => {
          try {
            const res = await fetch(apiUrl, {
              method: "POST",
              headers: { ...BASE_HEADERS, ...extraHeaders },
              body: JSON.stringify({ ...requestBody, [pageKey]: pageNum }),
              signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) return;
            const data = (await res.json()) as Record<string, unknown>;
            const list = getNestedValue(data, listPath) as unknown[] | undefined;
            if (list) allItems.push(...list);
          } catch {
            // 실패한 페이지는 건너뜀
          }
        })
      );
    }

    // ── [3] 기업명 추출 & 중복 제거 ─────────────────────────────────────
    const names = [...new Set(allItems.map(extractCompanyName).filter((n): n is string => n !== null))];

    let toInsert = names;
    if (exhibitionId && names.length > 0) {
      const { data: existing } = await supabase
        .from("company_candidates")
        .select("normalized_name")
        .eq("exhibition_id", exhibitionId);
      const existingNames = new Set((existing ?? []).map((e) => e.normalized_name));
      toInsert = names.filter((n) => !existingNames.has(n));
    }

    // ── [4] DB 저장 ──────────────────────────────────────────────────────
    const crawlId = crypto.randomUUID();

    if (toInsert.length > 0) {
      const records = toInsert.map((name) => ({
        crawl_id: crawlId,
        ...(exhibitionId && { exhibition_id: exhibitionId }),
        raw_name: name,
        normalized_name: name,
        source_url: apiUrl,
        score: 8,
        selector: "json-api",
        extraction_method: "json-api",
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
      pages_fetched: totalPages,
      count: toInsert.length,
      companies: toInsert.map((name) => ({ name, score: 8 })),
    });
  } catch (err) {
    console.error("[JSON API 오류]", err);
    return NextResponse.json({ error: "서버 내부 오류가 발생했습니다." }, { status: 500 });
  }
}
