import type { ScoredCandidate } from "@/lib/scoring/score-company";

const BLACKLIST = new Set([
  "더보기", "자세히보기", "로그인", "신청하기", "회원가입",
  "닫기", "확인", "취소", "목록", "전체보기", "이전", "다음", "검색",
  "홈", "메인", "공지사항", "문의하기", "고객센터",
]);

/**
 * score 기준으로 필터링한다.
 * @param candidates scoreAll()로 나온 스코어 배열
 * @param threshold  이 값 이상인 후보만 통과 (기본 3)
 * @returns score 내림차순으로 정렬된 배열
 */
export function filterCompanies(
  candidates: ScoredCandidate[],
  threshold = 3,
): ScoredCandidate[] {
  return candidates
    .filter((c) => !BLACKLIST.has(c.name))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
