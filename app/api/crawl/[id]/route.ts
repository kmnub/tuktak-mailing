import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "유효하지 않은 crawl_id입니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("company_candidates")
    .select("id, raw_name, normalized_name, score, selector, source_url, extraction_method, status")
    .eq("crawl_id", id)
    .order("score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ crawl_id: id, candidates: data ?? [] });
}
