-- 정보주체 권리 요청 테이블 (DSAR)
-- 법적 근거: 개인정보보호법 제35조~제37조, 제38조 (10일 이내 처리)

CREATE TABLE IF NOT EXISTS dsar_requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_type     text NOT NULL CHECK (request_type IN ('access', 'rectify', 'delete', 'restrict')),
  subject_name     text NOT NULL,
  subject_contact  text NOT NULL,            -- 이메일 또는 전화번호
  description      text,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  due_at           timestamptz NOT NULL,     -- 접수 후 10일 (법 제38조)
  processed_at     timestamptz,
  result           text,
  created_at       timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS dsar_requests_status_idx    ON dsar_requests (status);
CREATE INDEX IF NOT EXISTS dsar_requests_due_at_idx    ON dsar_requests (due_at);
CREATE INDEX IF NOT EXISTS dsar_requests_created_at_idx ON dsar_requests (created_at);
