-- 개인정보 파기 이력 테이블
-- 법적 근거: 개인정보보호법 제21조 (파기 증명)

CREATE TABLE IF NOT EXISTS privacy_purge_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name  text NOT NULL,
  field_name  text NOT NULL,                 -- 파기된 필드명 (콤마 구분)
  record_id   text NOT NULL,
  reason      text NOT NULL,
  purged_by   text,                          -- 파기 실행자 (admin ID 또는 'system')
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS privacy_purge_logs_record_id_idx  ON privacy_purge_logs (record_id);
CREATE INDEX IF NOT EXISTS privacy_purge_logs_created_at_idx ON privacy_purge_logs (created_at);
