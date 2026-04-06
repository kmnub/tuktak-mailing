import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getServerEnv } from "@/lib/env";
import { findOfficialWebsiteCandidates } from "@/lib/enrichment/find-official-website";
import { validateOfficialWebsite } from "@/lib/enrichment/validate-official-website";
import { extractCompanyContact } from "@/lib/enrichment/extract-company-contact";
import { extractContactWithAI } from "@/lib/enrichment/ai-contact-extractor";

export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "유효하지 않은 id입니다." }, { status: 400 });
  }

  try {
    const env = getServerEnv();

    // [1] 회사명 조회
    const { data: company, error: companyError } = await supabase
      .from("company_candidates")
      .select("id, raw_name, normalized_name")
      .eq("id", id)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "기업을 찾을 수 없습니다." }, { status: 404 });
    }

    const companyName = company.normalized_name || company.raw_name;
    console.log(`[Enrich] 시작: ${companyName} (${id})`);

    // 재실행 시 기존 데이터 삭제
    await Promise.all([
      supabase.from("company_sources").delete().eq("company_id", id),
      supabase.from("company_contacts").delete().eq("company_id", id),
    ]);

    // [2] 공식 홈페이지 후보 검색 (Serper)
    console.log(`[Enrich] Serper 검색 중...`);
    let candidates;
    try {
      candidates = await findOfficialWebsiteCandidates(companyName, env.SERPER_API_KEY);
    } catch (err) {
      console.error("[Enrich] Serper 검색 실패:", err);
      return NextResponse.json({ error: "홈페이지 검색 실패 (Serper)" }, { status: 502 });
    }

    console.log(`[Enrich] 후보 ${candidates.length}개 발견`);

    if (candidates.length === 0) {
      return NextResponse.json({ success: false, message: "검색 결과 없음", companyName });
    }

    // [3] 후보 검증 — 상위 2개만 Firecrawl 검증, 나머지는 점수 0으로 처리
    console.log(`[Enrich] 후보 검증 중 (상위 2개)...`);
    const topCandidates = candidates.slice(0, 2);
    const restCandidates = candidates.slice(2);
    const topValidations = await Promise.all(
      topCandidates.map((c) =>
        validateOfficialWebsite(companyName, c.url, env.FIRECRAWL_API_KEY).catch((err) => {
          console.error(`[Enrich] 검증 오류 ${c.url}:`, err);
          return null;
        })
      )
    );
    const validations = [
      ...topValidations,
      ...restCandidates.map(() => null),
    ];

    // [4] company_sources 저장
    const sourceRecords = candidates.map((c, i) => {
      const v = validations[i];
      // 검색 점수 30% + 검증 점수 70%
      const finalConf = v
        ? Math.round((c.confidence * 0.3 + v.confidence * 0.7) * 100) / 100
        : c.confidence;
      const reasons = v ? [...c.reason, ...v.matchedSignals] : c.reason;

      return {
        company_id: id,
        source_url: c.url,
        source_type: c.source,
        title: v?.pageTitle ?? c.title,
        confidence: finalConf,
        reason: reasons,
        is_official_candidate: true,
        is_selected: false,
      };
    });

    // confidence 내림차순 정렬 → 최상위 자동 선택
    sourceRecords.sort((a, b) => b.confidence - a.confidence);
    if (sourceRecords.length > 0) sourceRecords[0].is_selected = true;

    const { error: srcErr } = await supabase.from("company_sources").insert(sourceRecords);
    if (srcErr) {
      console.error("[Enrich] company_sources 저장 오류:", srcErr.message);
      return NextResponse.json({ error: `소스 저장 실패: ${srcErr.message}` }, { status: 500 });
    }
    console.log(`[Enrich] 소스 ${sourceRecords.length}개 저장`);

    // [5] 연락처 추출 (상위 후보 기준)
    const topSource = sourceRecords[0];
    const contactResult = await extractCompanyContact(topSource.source_url, env.FIRECRAWL_API_KEY);
    console.log(
      `[Enrich] 연락처: 이메일 ${contactResult.emails.length}개, 전화 ${contactResult.telephones.length}개`
    );

    let usedAI = false;
    let finalEmails = contactResult.emails;
    let finalPhones = contactResult.telephones;
    let finalSourceUrl = contactResult.sourceUrls[0] ?? topSource.source_url;
    let finalMethod = contactResult.extractionMethods.join(", ");
    let finalConfidence = contactResult.confidence;

    // [6] AI fallback — Firecrawl + 파싱 모두 실패 시에만
    if (finalEmails.length === 0 && finalPhones.length === 0 && contactResult.firstPageHtml) {
      console.log(`[Enrich] 연락처 없음 → AI fallback 시도`);
      try {
        const aiResult = await extractContactWithAI(
          contactResult.firstPageHtml,
          companyName,
          topSource.source_url,
          env.OPENAI_API_KEY
        );
        if (aiResult.emails.length > 0 || aiResult.telephones.length > 0) {
          finalEmails = aiResult.emails;
          finalPhones = aiResult.telephones;
          finalSourceUrl = aiResult.sourceUrl;
          finalMethod = "openai";
          finalConfidence = 0.3; // AI 결과는 낮은 신뢰도
          usedAI = true;
        }
      } catch (err) {
        console.error("[Enrich] AI fallback 오류:", err);
      }
    }

    // [7] company_contacts 저장 — 이메일·전화 각각 별도 레코드
    type ContactRecord = {
      company_id: string;
      homepage_url: string;
      email: string | null;
      telephone: string | null;
      source_url: string;
      extraction_method: string;
      confidence: number;
      is_verified: boolean;
    };

    const contactRecords: ContactRecord[] = [];

    for (const email of finalEmails) {
      contactRecords.push({
        company_id: id,
        homepage_url: topSource.source_url,
        email,
        telephone: null,
        source_url: finalSourceUrl,
        extraction_method: finalMethod,
        confidence: finalConfidence,
        is_verified: false,
      });
    }
    for (const telephone of finalPhones) {
      contactRecords.push({
        company_id: id,
        homepage_url: topSource.source_url,
        email: null,
        telephone,
        source_url: finalSourceUrl,
        extraction_method: finalMethod,
        confidence: finalConfidence,
        is_verified: false,
      });
    }

    if (contactRecords.length > 0) {
      const { error: conErr } = await supabase.from("company_contacts").insert(contactRecords);
      if (conErr) console.error("[Enrich] company_contacts 저장 오류:", conErr.message);
    }

    console.log(`[Enrich] 완료: ${companyName} — 연락처 ${contactRecords.length}개`);

    return NextResponse.json({
      success: true,
      companyName,
      sourcesFound: sourceRecords.length,
      contactsFound: contactRecords.length,
      topSource: topSource.source_url,
      topSourceConfidence: topSource.confidence,
      usedAIFallback: usedAI,
    });
  } catch (err) {
    console.error("[Enrich] 예외:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 내부 오류" },
      { status: 500 }
    );
  }
}
