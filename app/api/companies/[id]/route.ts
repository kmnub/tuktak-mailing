import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "유효하지 않은 id입니다." }, { status: 400 });
  }

  const [companyRes, sourcesRes, contactsRes] = await Promise.all([
    supabase
      .from("company_candidates")
      .select("id, raw_name, normalized_name, score, status, source_url, crawl_id")
      .eq("id", id)
      .single(),
    supabase
      .from("company_sources")
      .select("*")
      .eq("company_id", id)
      .order("confidence", { ascending: false }),
    supabase
      .from("company_contacts")
      .select("*")
      .eq("company_id", id)
      .order("confidence", { ascending: false }),
  ]);

  if (companyRes.error || !companyRes.data) {
    return NextResponse.json({ error: "기업을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    company: companyRes.data,
    sources: sourcesRes.data ?? [],
    contacts: contactsRes.data ?? [],
  });
}
