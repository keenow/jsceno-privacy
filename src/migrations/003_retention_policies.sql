-- 보관기간 정책 테이블
-- 법적 근거: 개인정보보호법 제21조, 제21조의2 (유효기간제)

CREATE TABLE IF NOT EXISTS retention_policies (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_id       text NOT NULL UNIQUE,     -- 정보주체 레코드 ID
  subject_type     text NOT NULL CHECK (subject_type IN ('runner', 'staff', 'contract')),
  retention_years  integer NOT NULL DEFAULT 3,
  last_activity_at timestamptz,
  expires_at       timestamptz NOT NULL,
  notified_at      timestamptz,              -- 만료 30일 전 통지 완료 시각
  purged_at        timestamptz,              -- 파기(필드 NULL) 완료 시각
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS retention_policies_expires_at_idx   ON retention_policies (expires_at);
CREATE INDEX IF NOT EXISTS retention_policies_subject_type_idx ON retention_policies (subject_type);
CREATE INDEX IF NOT EXISTS retention_policies_purged_at_idx    ON retention_policies (purged_at);
