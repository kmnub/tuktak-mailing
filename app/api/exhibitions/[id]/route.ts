import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  const allowed = ["name", "manager", "date", "location"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] ?? null;
  }

  if (!updates.name || typeof updates.name !== "string" || !(updates.name as string).trim()) {
    return NextResponse.json({ error: "박람회명은 필수입니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("exhibitions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exhibition: data });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 박람회 정보
  const { data: exhibition, error: exhErr } = await supabase
    .from("exhibitions")
    .select("*")
    .eq("id", id)
    .single();

  if (exhErr || !exhibition) {
    return NextResponse.json({ error: "박람회를 찾을 수 없습니다." }, { status: 404 });
  }

  // 기업 목록
  const { data: companies } = await supabase
    .from("company_candidates")
    .select("id, raw_name, normalized_name, score, status, extraction_method, source_url, crawl_id")
    .eq("exhibition_id", id)
    .order("score", { ascending: false });

  const companyIds = (companies ?? []).map((c) => c.id);

  // 선택된 홈페이지, 이메일, 전화 병합
  const homepageMap: Record<string, string> = {};
  const emailMap: Record<string, string[]> = {};
  const phoneMap: Record<string, string[]> = {};

  if (companyIds.length > 0) {
    const [{ data: sources }, { data: contacts }] = await Promise.all([
      supabase
        .from("company_sources")
        .select("company_id, source_url")
        .in("company_id", companyIds)
        .eq("is_selected", true),
      supabase
        .from("company_contacts")
        .select("company_id, email, telephone")
        .in("company_id", companyIds),
    ]);

    for (const s of sources ?? []) homepageMap[s.company_id] = s.source_url;
    for (const c of contacts ?? []) {
      if (c.email) {
        emailMap[c.company_id] = emailMap[c.company_id] ?? [];
        emailMap[c.company_id].push(c.email);
      }
      if (c.telephone) {
        phoneMap[c.company_id] = phoneMap[c.company_id] ?? [];
        phoneMap[c.company_id].push(c.telephone);
      }
    }
  }

  const enriched = (companies ?? []).map((c) => ({
    ...c,
    homepage: homepageMap[c.id] ?? null,
    emails: emailMap[c.id] ?? [],
    phones: phoneMap[c.id] ?? [],
    enriched: !!(homepageMap[c.id] || emailMap[c.id]?.length || phoneMap[c.id]?.length),
  }));

  return NextResponse.json({ exhibition, companies: enriched });
}
