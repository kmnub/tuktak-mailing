import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

type Status = "candidate" | "confirmed" | "excluded";
const VALID_STATUSES: Status[] = ["candidate", "confirmed", "excluded"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: unknown = await req.json();

  if (!body || typeof body !== "object" || !("status" in body)) {
    return NextResponse.json({ error: "status 필드가 필요합니다." }, { status: 400 });
  }

  const { status } = body as { status: unknown };
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as Status)) {
    return NextResponse.json(
      { error: `status는 ${VALID_STATUSES.join(" | ")} 중 하나여야 합니다.` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("company_candidates")
    .update({ status })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
