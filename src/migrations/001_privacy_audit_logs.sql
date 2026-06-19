-- 접속기록 테이블
-- 법적 보관기간: 최소 1년 (5만명↑ 2년)
-- 법적 근거: 개인정보보호법 시행령 제30조의2

CREATE TABLE IF NOT EXISTS privacy_audit_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id      text NOT NULL,
  actor_type    text NOT NULL CHECK (actor_type IN ('admin', 'api', 'system')),
  action        text NOT NULL CHECK (action IN ('read', 'write', 'delete', 'export')),
  resource_type text NOT NULL,
  resource_id   text NOT NULL,
  ip_address    text,
  user_agent    text,
  metadata      jsonb,
  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS privacy_audit_logs_actor_id_idx    ON privacy_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS privacy_audit_logs_resource_idx    ON privacy_audit_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS privacy_audit_logs_created_at_idx  ON privacy_audit_logs (created_at);
