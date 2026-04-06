export interface RawCandidate {
  name: string;
  source_url: string;
  selector: string;
}

export interface ScoredCandidate {
  name: string;
  normalizedName: string;
  score: number;
  source_url: string;
  selector: string;
}

const PENALTY_KEYWORDS = [
  "신청", "문의", "더보기", "login", "자세히보기", "register",
  "signin", "signup", "subscribe",
];

function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\(주\)|주식회사|㈜|\(유\)|유한회사|co\.,?\s?ltd\.?/gi, "");
}

/**
 * 후보 전체를 한 번에 스코어링한다.
 * - 빈도(frequency) 계산을 위해 배열 전체를 먼저 순회한다.
 * - 동일한 normalized key가 여러 번 등장하면 태그 우선순위가 높은 것을 보존한다.
 */
export function scoreAll(candidates: RawCandidate[]): ScoredCandidate[] {
  // 1. 빈도 집계
  const freq = new Map<string, number>();
  for (const c of candidates) {
    const key = toKey(c.name);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  // 태그 우선순위 (낮을수록 우선)
  const TAG_RANK: Record<string, number> = { h2: 0, h3: 1, li: 2, a: 3 };

  // 2. 동일 key 중 태그 우선순위가 높은 대표 후보 선택
  const best = new Map<string, RawCandidate>();
  for (const c of candidates) {
    const key = toKey(c.name);
    const existing = best.get(key);
    if (!existing) {
      best.set(key, c);
    } else {
      const curRank = TAG_RANK[c.selector] ?? 99;
      const exRank = TAG_RANK[existing.selector] ?? 99;
      if (curRank < exRank) best.set(key, c);
    }
  }

  // 3. 스코어 계산
  const result: ScoredCandidate[] = [];

  for (const [key, c] of best.entries()) {
    let score = 0;
    const { name, selector, source_url } = c;

    // 태그 점수
    if (selector === "h2" || selector === "h3") score += 3;
    else if (selector === "a") score += 2;
    else if (selector === "li") score += 1;

    // 반복 등장 가산
    if ((freq.get(key) ?? 1) >= 2) score += 2;

    // 길이 점수
    const len = name.length;
    if (len >= 3 && len <= 30) score += 2;
    else score -= 1;

    // 감점 키워드
    const lower = name.toLowerCase();
    if (PENALTY_KEYWORDS.some((kw) => lower.includes(kw))) score -= 5;

    // 특수문자·숫자 비율 감점
    const specialCount = (name.match(/[\d!@#$%^&*()\[\]{};':"\\|,.<>\/?]/g) ?? []).length;
    if (name.length > 0 && specialCount / name.length > 0.4) score -= 2;

    result.push({ name, normalizedName: key, score, source_url, selector });
  }

  return result;
}
