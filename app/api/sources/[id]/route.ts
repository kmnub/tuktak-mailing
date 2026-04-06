import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: unknown = await req.json();

  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).is_selected !== "boolean") {
    return NextResponse.json({ error: "is_selected(boolean) 필드가 필요합니다." }, { status: 400 });
  }

  const { is_selected } = body as { is_selected: boolean };

  const { error } = await supabase
    .from("company_sources")
    .update({ is_selected })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
