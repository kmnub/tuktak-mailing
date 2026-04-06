import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// 박람회 소속 기업 전체 enrichment 데이터 초기화
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 박람회 소속 기업 ID 목록
  const { data: companies, error: fetchErr } = await supabase
    .from("company_candidates")
    .select("id")
    .eq("exhibition_id", id);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const ids = (companies ?? []).map((c) => c.id);
  if (ids.length === 0) return NextResponse.json({ success: true, cleared: 0 });

  await Promise.all([
    supabase.from("company_sources").delete().in("company_id", ids),
    supabase.from("company_contacts").delete().in("company_id", ids),
  ]);

  return NextResponse.json({ success: true, cleared: ids.length });
}
