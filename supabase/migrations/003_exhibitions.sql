-- 박람회 테이블
CREATE TABLE IF NOT EXISTS exhibitions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  manager     TEXT,
  date        DATE,
  location    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exhibitions_created_at
  ON exhibitions (created_at DESC);

-- company_candidates에 exhibition_id 추가
ALTER TABLE company_candidates
  ADD COLUMN IF NOT EXISTS exhibition_id UUID
    REFERENCES exhibitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_candidates_exhibition_id
  ON company_candidates (exhibition_id);
