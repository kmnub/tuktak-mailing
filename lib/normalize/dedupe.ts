// CLAUDE.md §5-4 / 설계 §6 deduplicator
// 순수 함수 — I/O 없음, 크롤링 없음

// 비교용 정규화 키 생성 (공백 제거 + 소문자 + 법인 접미사 통일)
function toNormalizedKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\(주\)|주식회사|㈜|\(유\)|유한회사|co\.,?\s?ltd\.?/gi, "");
}

export interface DedupeResult {
  name: string;
  normalizedName: string;
  source_url: string;
}

// 중복 제거: normalizedKey 기준으로 첫 등장한 항목만 유지
export function dedupe(
  candidates: { name: string; source_url: string }[]
): DedupeResult[] {
  const seen = new Set<string>();
  const result: DedupeResult[] = [];

  for (const candidate of candidates) {
    const key = toNormalizedKey(candidate.name);
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        name: candidate.name,
        normalizedName: key,
        source_url: candidate.source_url,
      });
    }
  }

  return result;
}
