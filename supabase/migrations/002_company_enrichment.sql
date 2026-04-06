-- company_sources: 공식 홈페이지 후보 (검증 전 후보 데이터)
CREATE TABLE IF NOT EXISTS company_sources (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id            UUID          NOT NULL REFERENCES company_candidates(id) ON DELETE CASCADE,
  source_url            TEXT          NOT NULL,
  source_type           TEXT          NOT NULL DEFAULT 'serper',
  title                 TEXT,
  confidence            NUMERIC(4,2)  NOT NULL DEFAULT 0,
  reason                TEXT[]        NOT NULL DEFAULT '{}',
  is_official_candidate BOOLEAN       NOT NULL DEFAULT true,
  is_selected           BOOLEAN       NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_sources_company_id
  ON company_sources (company_id);

-- company_contacts: 연락처 후보 (검수 전 상태로 저장)
CREATE TABLE IF NOT EXISTS company_contacts (
  id                  UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID          NOT NULL REFERENCES company_candidates(id) ON DELETE CASCADE,
  homepage_url        TEXT,
  email               TEXT,
  telephone           TEXT,
  source_url          TEXT,
  extraction_method   TEXT,
  confidence          NUMERIC(4,2)  NOT NULL DEFAULT 0,
  is_verified         BOOLEAN       NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_contacts_company_id
  ON company_contacts (company_id);
