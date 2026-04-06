import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function GET() {
  const { data, error } = await supabase
    .from("exhibitions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const exhibitions = data ?? [];
  if (exhibitions.length === 0) return NextResponse.json({ exhibitions: [] });

  // 기업 수 카운트
  const ids = exhibitions.map((e) => e.id);
  const { data: countData } = await supabase
    .from("company_candidates")
    .select("exhibition_id")
    .in("exhibition_id", ids);

  const countMap: Record<string, number> = {};
  for (const c of countData ?? []) {
    if (c.exhibition_id) {
      countMap[c.exhibition_id] = (countMap[c.exhibition_id] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    exhibitions: exhibitions.map((e) => ({
      ...e,
      company_count: countMap[e.id] ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { name, manager, date, location } = body as Record<string, unknown>;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "박람회명은 필수입니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("exhibitions")
    .insert({
      name: name.trim(),
      manager: typeof manager === "string" ? manager.trim() || null : null,
      date: typeof date === "string" && date ? date : null,
      location: typeof location === "string" ? location.trim() || null : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exhibition: data }, { status: 201 });
}
