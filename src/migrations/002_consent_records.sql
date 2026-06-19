-- 수집 동의 기록 테이블
-- 법적 근거: 개인정보보호법 제15조, 제22조

CREATE TABLE IF NOT EXISTS consent_records (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_id       text NOT NULL,
  subject_type     text NOT NULL CHECK (subject_type IN ('runner', 'staff', 'contract')),
  consent_version  text NOT NULL,
  consented_at     timestamptz NOT NULL,
  revoked_at       timestamptz,
  items            jsonb NOT NULL,           -- 동의 항목 배열
  channel          text NOT NULL CHECK (channel IN ('web', 'sms', 'email')),
  ip_address       text,
  created_at       timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS consent_records_subject_id_idx ON consent_records (subject_id);
CREATE INDEX IF NOT EXISTS consent_records_consented_at_idx ON consent_records (consented_at);
