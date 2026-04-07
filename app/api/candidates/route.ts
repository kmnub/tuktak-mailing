import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { ids } = body as { ids: unknown };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids 배열이 필요합니다." }, { status: 400 });
  }

  const validIds = ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
  if (validIds.length === 0) {
    return NextResponse.json({ error: "유효한 id가 없습니다." }, { status: 400 });
  }

  const { error } = await supabase
    .from("company_candidates")
    .delete()
    .in("id", validIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: validIds.length });
}
