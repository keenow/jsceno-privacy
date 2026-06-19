/**
 * @jsceno/privacy
 * JSCENO 공통 개인정보보호 모듈
 *
 * 사용법:
 *   const privacy = createPrivacyService(supabaseClient, { encryptionKey })
 */

import { PrivacyService } from './service'
import type { PrivacyConfig } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createPrivacyService(
  db: SupabaseClient,
  config: PrivacyConfig
): PrivacyService {
  return new PrivacyService(db, config)
}

export { PrivacyService } from './service'
export { encrypt, decrypt, isEncrypted, maskPhone, maskEmail, maskRrn, maskAccount } from './encrypt'
export type {
  PrivacyConfig,
  AuditLogInput, AuditLog, AuditFilter,
  RetentionInput, RetentionRecord, NoticeTarget,
  PurgeInput, PurgeResult, BatchPurgeResult,
  ConsentInput, ConsentRecord,
  DsarInput, DsarRequest, DsarFilter,
  BreachInput, BreachIncident,
} from './types'
