import { NextRequest, NextResponse } from "next/server";
import { extractCompanies } from "@/lib/parser/extract-companies";
import { dedupe } from "@/lib/normalize/dedupe";
import { supabase } from "@/lib/supabase/client";

// CLAUDE.md §2-2: 모든 데이터에 source_url 필수
// CLAUDE.md §9-5: 실패는 throw 대신 Result 구조로 반환

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();

    // URL 유효성 검사
    if (
      !body ||
      typeof body !== "object" ||
      !("url" in body) ||
      typeof body.url !== "string"
    ) {
      return NextResponse.json(
        { error: "url 필드가 필요합니다." },
        { status: 400 }
      );
    }

    const { url } = body;

    if (!/^https?:\/\/.+/.test(url)) {
      return NextResponse.json(
        { error: "http:// 또는 https://로 시작하는 URL을 입력해주세요." },
        { status: 400 }
      );
    }

    // [1] HTML 수집 (정적 fetch — Playwright 사용 금지: 1단계)
    let html: string;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(15000), // 15초 타임아웃
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `HTML 수집 실패: HTTP ${response.status}` },
          { status: 502 }
        );
      }

      html = await response.text();
    } catch (fetchErr) {
      const message =
        fetchErr instanceof Error ? fetchErr.message : "알 수 없는 네트워크 오류";
      return NextResponse.json(
        { error: `페이지 접근 실패: ${message}` },
        { status: 502 }
      );
    }

    // [2] 기업명 후보 추출 (순수 함수 — I/O 없음)
    const rawCandidates = extractCompanies(html, url);

    // [3] 중복 제거 (순수 함수)
    const uniqueCompanies = dedupe(rawCandidates);

    // [4] DB 저장 (CLAUDE.md §2-2: source_url 필수)
    if (uniqueCompanies.length > 0) {
      const records = uniqueCompanies.map((c) => ({
        raw_name: c.name,
        normalized_name: c.normalizedName,
        source_url: c.source_url, // 반드시 포함
        status: "candidate" as const, // CLAUDE.md §2-3: 확정/후보 분리
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
      count: uniqueCompanies.length,
      companies: uniqueCompanies.map((c) => c.name),
    });
  } catch (err) {
    console.error("[크롤링 API 오류]", err);
    return NextResponse.json(
      { error: "서버 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
