-- 개인정보 유출 사고 테이블
-- 법적 근거: 개인정보보호법 제39조의4
-- 1,000명↑: 72시간 내 위원회 신고 의무

CREATE TABLE IF NOT EXISTS breach_incidents (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discovered_at       timestamptz NOT NULL DEFAULT now(),
  affected_count      integer NOT NULL,
  affected_data_types jsonb NOT NULL,        -- ['phone', 'email', 'resident_number']
  cause               text,
  immediate_actions   jsonb,
  report_deadline     timestamptz,           -- 위원회 신고 기한
  notify_deadline     timestamptz,           -- 정보주체 통지 기한
  reported_at         timestamptz,           -- 위원회 신고 완료
  notified_at         timestamptz,           -- 정보주체 통지 완료
  created_at          timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS breach_incidents_discovered_at_idx ON breach_incidents (discovered_at);
