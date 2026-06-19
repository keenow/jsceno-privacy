/**
 * @jsceno/privacy — 타입 정의
 */

// ─── 설정 ──────────────────────────────────────────────────────────────────

export interface PrivacyConfig {
  encryptionKey: string        // PRIVACY_ENCRYPTION_KEY (32바이트 hex)
  encryptPhone?: boolean       // 전화번호 암호화 여부 (기본: true)
  encryptEmail?: boolean       // 이메일 암호화 여부 (기본: true)
}

// ─── 암호화 ────────────────────────────────────────────────────────────────

export interface EncryptResult {
  cipherText: string           // "enc:v1:base64(iv+cipher)"
  isEncrypted: true
}

// ─── 접속기록 ──────────────────────────────────────────────────────────────

export type ActorType = 'admin' | 'api' | 'system'
export type AuditAction = 'read' | 'write' | 'delete' | 'export'

export interface AuditLogInput {
  actorId: string
  actorType: ActorType
  action: AuditAction
  resourceType: string         // 'runner' | 'inquiry' | 'contract' 등
  resourceId: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

export interface AuditLog extends AuditLogInput {
  id: string
  createdAt: Date
}

export interface AuditFilter {
  actorId?: string
  resourceType?: string
  action?: AuditAction
  from?: Date
  to?: Date
  limit?: number
}

// ─── 보관기간 ──────────────────────────────────────────────────────────────

export type SubjectType = 'runner' | 'staff' | 'contract'

export interface RetentionInput {
  subjectId: string
  subjectType: SubjectType
  retentionYears: number       // 기본 3년
  lastActivityAt?: Date
}

export interface RetentionRecord extends RetentionInput {
  id: string
  expiresAt: Date
  notifiedAt?: Date
  purgedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface NoticeTarget {
  subjectId: string
  subjectType: SubjectType
  contact: string              // 전화번호 또는 이메일 (복호화 후)
  expiresAt: Date
  daysRemaining: number
}

// ─── 파기 ──────────────────────────────────────────────────────────────────

export interface PurgeInput {
  table: string
  fields: string[]             // 파기할 필드 (NULL 처리)
  exemptFields?: string[]      // 세법 보관 예외 필드 (주민번호·계좌번호)
  recordId: string
  reason: string
  purgedBy?: string
}

export interface PurgeResult {
  recordId: string
  purgedFields: string[]
  exemptedFields: string[]
  purgedAt: Date
}

export interface BatchPurgeResult {
  totalProcessed: number
  purgedFields: string[]
  errors: string[]
}

// ─── 수집 동의 ─────────────────────────────────────────────────────────────

export interface ConsentInput {
  subjectId: string
  subjectType: SubjectType
  consentVersion: string       // "2026-v1"
  items: string[]              // ["개인정보 수집·이용", "제3자 제공"]
  channel: 'web' | 'sms' | 'email'
  ipAddress?: string
}

export interface ConsentRecord extends ConsentInput {
  id: string
  consentedAt: Date
  revokedAt?: Date
  createdAt: Date
}

// ─── 정보주체 권리 요청 (DSAR) ──────────────────────────────────────────────

export type DsarRequestType = 'access' | 'rectify' | 'delete' | 'restrict'
export type DsarStatus = 'pending' | 'processing' | 'completed' | 'rejected'

export interface DsarInput {
  requestType: DsarRequestType
  subjectName: string
  subjectContact: string       // 이메일 또는 전화번호
  description?: string
}

export interface DsarRequest extends DsarInput {
  id: string
  status: DsarStatus
  dueAt: Date                  // 접수 후 10일 (법 제38조)
  processedAt?: Date
  result?: string
  createdAt: Date
}

export interface DsarFilter {
  status?: DsarStatus
  requestType?: DsarRequestType
}

// ─── 유출 대응 ─────────────────────────────────────────────────────────────

export interface BreachInput {
  affectedCount: number
  affectedDataTypes: string[]  // ['phone', 'email', 'resident_number']
  cause: string
  immediateActions: string[]
}

export interface BreachIncident extends BreachInput {
  id: string
  discoveredAt: Date
  reportDeadline?: Date        // 72시간 (1,000명↑ 위원회 신고)
  notifyDeadline?: Date        // 지체없이 정보주체 통지
  reportedAt?: Date
  notifiedAt?: Date
  createdAt: Date
}
