-- CLAUDE.md §2-2: source_url NOT NULL 필수
-- CLAUDE.md §2-3: status 필드로 confirmed/candidate/rejected 구분

CREATE TABLE IF NOT EXISTS company_candidates (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_name        TEXT        NOT NULL,
  normalized_name TEXT        NOT NULL,
  source_url      TEXT        NOT NULL,           -- 출처 필수 (NULL 허용 안 함)
  status          TEXT        NOT NULL DEFAULT 'candidate'
                              CHECK (status IN ('confirmed', 'candidate', 'rejected')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 검색 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_company_candidates_source_url
  ON company_candidates (source_url);

CREATE INDEX IF NOT EXISTS idx_company_candidates_status
  ON company_candidates (status);

CREATE INDEX IF NOT EXISTS idx_company_candidates_normalized_name
  ON company_candidates (normalized_name);
