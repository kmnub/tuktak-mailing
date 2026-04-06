import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// 수기 연락처 저장 — 기존 수기 입력 레코드가 있으면 업데이트, 없으면 추가
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: unknown = await req.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { field, value } = body as { field: "homepage" | "email" | "phone"; value: string };

  if (!["homepage", "email", "phone"].includes(field)) {
    return NextResponse.json({ error: "field는 homepage | email | phone 이어야 합니다." }, { status: 400 });
  }

  if (field === "homepage") {
    // company_sources에 수기 입력으로 저장 (기존 선택 해제 후 새 레코드를 선택)
    await supabase.from("company_sources").update({ is_selected: false }).eq("company_id", id);

    if (value.trim()) {
      // 이미 같은 URL의 source가 있으면 선택만, 없으면 추가
      const { data: existing } = await supabase
        .from("company_sources")
        .select("id")
        .eq("company_id", id)
        .eq("source_url", value.trim())
        .maybeSingle();

      if (existing) {
        await supabase.from("company_sources").update({ is_selected: true }).eq("id", existing.id);
      } else {
        await supabase.from("company_sources").insert({
          company_id: id,
          source_url: value.trim(),
          source_type: "manual",
          title: "수기 입력",
          confidence: 1.0,
          reason: ["사용자 직접 입력"],
          is_official_candidate: true,
          is_selected: true,
        });
      }
    }
    return NextResponse.json({ success: true });
  }

  // email 또는 phone — 수기 입력 레코드 upsert
  const column = field === "email" ? "email" : "telephone";

  // 기존 수기 입력 레코드 찾기
  const { data: existing } = await supabase
    .from("company_contacts")
    .select("id")
    .eq("company_id", id)
    .eq("extraction_method", "manual")
    .eq(column, value.trim().length === 0 ? null : value.trim())
    .maybeSingle();

  if (!value.trim()) {
    // 빈 값 = 해당 수기 레코드 삭제
    if (existing) {
      await supabase.from("company_contacts").delete().eq("id", existing.id);
    }
    return NextResponse.json({ success: true });
  }

  // 수기 입력 레코드가 없으면 새로 추가
  const { error } = await supabase.from("company_contacts").insert({
    company_id: id,
    homepage_url: null,
    email: field === "email" ? value.trim() : null,
    telephone: field === "phone" ? value.trim() : null,
    source_url: "manual",
    extraction_method: "manual",
    confidence: 1.0,
    is_verified: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
