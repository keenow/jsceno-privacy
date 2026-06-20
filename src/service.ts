/**
 * @jsceno/privacy — PrivacyService
 *
 * 사용법:
 *   const privacy = createPrivacyService(supabaseClient, { encryptionKey })
 *   await privacy.logAccess({ ... })
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt, decrypt, maskPhone, maskEmail, maskRrn, maskAccount } from './encrypt'
import type {
  PrivacyConfig,
  AuditLogInput, AuditLog, AuditFilter,
  RetentionInput, RetentionRecord, NoticeTarget,
  PurgeInput, PurgeResult, BatchPurgeResult,
  ConsentInput, ConsentRecord,
  DsarInput, DsarRequest, DsarFilter,
  BreachInput, BreachIncident,
} from './types'

const DSAR_DUE_DAYS = 10  // 법 제38조: 10일 이내 처리

export class PrivacyService {
  private db: SupabaseClient
  private key: string
  private cfg: Required<Omit<PrivacyConfig, 'scheduler'>> & { scheduler?: PrivacyConfig['scheduler'] }

  constructor(db: SupabaseClient, config: PrivacyConfig) {
    if (!config.encryptionKey) throw new Error('PRIVACY_ENCRYPTION_KEY 필요')
    this.db = db
    this.key = config.encryptionKey
    this.cfg = {
      encryptionKey: config.encryptionKey,
      encryptPhone: config.encryptPhone ?? true,
      encryptEmail: config.encryptEmail ?? true,
      scheduler: config.scheduler,
    }
  }

  // ─── 암호화 (순수 함수 위임) ─────────────────────────────────────────────

  encrypt(plain: string): string {
    return encrypt(plain, this.key)
  }

  decrypt(cipher: string): string {
    return decrypt(cipher, this.key)
  }

  encryptPhone(phone: string): string {
    return this.cfg.encryptPhone ? this.encrypt(phone) : phone
  }

  encryptEmail(email: string): string {
    return this.cfg.encryptEmail ? this.encrypt(email) : email
  }

  maskPhone = maskPhone
  maskEmail = maskEmail
  maskRrn = maskRrn
  maskAccount = maskAccount

  // ─── 접속기록 ───────────────────────────────────────────────────────────

  async logAccess(entry: AuditLogInput): Promise<void> {
    await this.db.from('privacy_audit_logs').insert({
      actor_id: entry.actorId,
      actor_type: entry.actorType,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
      metadata: entry.metadata ?? null,
    })
  }

  async getAccessLogs(filter: AuditFilter = {}): Promise<AuditLog[]> {
    let q = this.db.from('privacy_audit_logs').select('*')
    if (filter.actorId) q = q.eq('actor_id', filter.actorId)
    if (filter.resourceType) q = q.eq('resource_type', filter.resourceType)
    if (filter.action) q = q.eq('action', filter.action)
    if (filter.from) q = q.gte('created_at', filter.from.toISOString())
    if (filter.to) q = q.lte('created_at', filter.to.toISOString())
    q = q.order('created_at', { ascending: false }).limit(filter.limit ?? 100)

    const { data } = await q
    return (data ?? []).map(r => ({
      id: r.id,
      actorId: r.actor_id,
      actorType: r.actor_type,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      metadata: r.metadata,
      createdAt: new Date(r.created_at),
    }))
  }

  // ─── 보관기간 ───────────────────────────────────────────────────────────

  async setRetention(input: RetentionInput): Promise<void> {
    const expiresAt = new Date(
      (input.lastActivityAt ?? new Date()).getTime() +
      input.retentionYears * 365 * 24 * 60 * 60 * 1000
    )
    await this.db.from('retention_policies').upsert({
      subject_id: input.subjectId,
      subject_type: input.subjectType,
      retention_years: input.retentionYears,
      last_activity_at: input.lastActivityAt?.toISOString() ?? new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'subject_id' })

    // 스케줌러 주입된 경우 자동 등록
    if (this.cfg.scheduler) {
      const notifyAt = this.cfg.scheduler.calcNotifyAt
        ? this.cfg.scheduler.calcNotifyAt(expiresAt)
        : (() => { const d = new Date(expiresAt); d.setUTCDate(d.getUTCDate() - 30); d.setUTCHours(2,0,0,0); return d })()
      await this.cfg.scheduler.register({
        action: 'privacy-renewal',
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        notifyAt,
        expiresAt,
      })
    }
  }

  async getExpired(subjectType?: string): Promise<RetentionRecord[]> {
    let q = this.db.from('retention_policies')
      .select('*')
      .lte('expires_at', new Date().toISOString())
      .is('purged_at', null)
    if (subjectType) q = q.eq('subject_type', subjectType)

    const { data } = await q
    return (data ?? []).map(this._toRetentionRecord)
  }

  async getPendingNotices(daysBeforeExpiry = 30): Promise<NoticeTarget[]> {
    const deadline = new Date(Date.now() + daysBeforeExpiry * 24 * 60 * 60 * 1000)
    const { data } = await this.db.from('retention_policies')
      .select('*')
      .lte('expires_at', deadline.toISOString())
      .is('notified_at', null)
      .is('purged_at', null)

    return (data ?? []).map(r => ({
      subjectId: r.subject_id,
      subjectType: r.subject_type,
      contact: r.contact ?? '',  // 프로젝트에서 채워야 함
      expiresAt: new Date(r.expires_at),
      daysRemaining: Math.ceil(
        (new Date(r.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      ),
    }))
  }

  async renewRetention(subjectId: string): Promise<{ newExpiresAt: Date }> {
    const { data: current } = await this.db.from('retention_policies')
      .select('retention_years, subject_type')
      .eq('subject_id', subjectId)
      .single()

    const years = current?.retention_years ?? 3
    const newExpiresAt = new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000)

    await this.db.from('retention_policies').update({
      expires_at: newExpiresAt.toISOString(),
      notified_at: null,
      updated_at: new Date().toISOString(),
    }).eq('subject_id', subjectId)

    // 스케줌러 주입된 경우 자동 갱신
    if (this.cfg.scheduler) {
      const notifyAt = this.cfg.scheduler.calcNotifyAt
        ? this.cfg.scheduler.calcNotifyAt(newExpiresAt)
        : (() => { const d = new Date(newExpiresAt); d.setUTCDate(d.getUTCDate() - 30); d.setUTCHours(2,0,0,0); return d })()
      await this.cfg.scheduler.renew({
        action: 'privacy-renewal',
        subjectId,
        subjectType: current?.subject_type,
        notifyAt,
        expiresAt: newExpiresAt,
      })
    }

    return { newExpiresAt }
  }

  async markNotified(subjectId: string): Promise<void> {
    await this.db.from('retention_policies').update({
      notified_at: new Date().toISOString(),
    }).eq('subject_id', subjectId)
  }

  // ─── 파기 ───────────────────────────────────────────────────────────────

  async purgeFields(input: PurgeInput): Promise<PurgeResult> {
    const purgedFields: string[] = []
    const exemptedFields: string[] = []
    const nullUpdate: Record<string, null> = {}

    for (const field of input.fields) {
      if (input.exemptFields?.includes(field)) {
        exemptedFields.push(field)
      } else {
        nullUpdate[field] = null
        purgedFields.push(field)
      }
    }

    if (Object.keys(nullUpdate).length > 0) {
      await this.db.from(input.table).update(nullUpdate).eq('id', input.recordId)
    }

    // 파기 이력 기록
    await this.db.from('privacy_purge_logs').insert({
      table_name: input.table,
      field_name: purgedFields.join(','),
      record_id: input.recordId,
      reason: input.reason,
      purged_by: input.purgedBy ?? null,
    })

    // retention_policies purged_at 업데이트
    await this.db.from('retention_policies').update({
      purged_at: new Date().toISOString(),
    }).eq('subject_id', input.recordId)

    // 스케줌러 주입된 경우 자동 취소
    if (this.cfg.scheduler) {
      await this.cfg.scheduler.cancel(input.recordId)
    }

    const purgedAt = new Date()
    return { recordId: input.recordId, purgedFields, exemptedFields, purgedAt }
  }

  async batchPurge(subjectType?: string): Promise<BatchPurgeResult> {
    const expired = await this.getExpired(subjectType)
    let totalProcessed = 0
    const errors: string[] = []

    for (const record of expired) {
      try {
        await this.db.from('retention_policies').update({
          purged_at: new Date().toISOString(),
        }).eq('subject_id', record.subjectId)
        totalProcessed++
      } catch (e) {
        errors.push(`${record.subjectId}: ${(e as Error).message}`)
      }
    }

    return { totalProcessed, purgedFields: [], errors }
  }

  async getPurgeHistory(filter: { from?: Date; to?: Date } = {}): Promise<PurgeResult[]> {
    let q = this.db.from('privacy_purge_logs').select('*').order('created_at', { ascending: false })
    if (filter.from) q = q.gte('created_at', filter.from.toISOString())
    if (filter.to) q = q.lte('created_at', filter.to.toISOString())
    const { data } = await q
    return (data ?? []).map(r => ({
      recordId: r.record_id,
      purgedFields: r.field_name ? r.field_name.split(',') : [],
      exemptedFields: [],
      purgedAt: new Date(r.created_at),
    }))
  }

  // ─── 수집 동의 ──────────────────────────────────────────────────────────

  async recordConsent(input: ConsentInput): Promise<void> {
    await this.db.from('consent_records').insert({
      subject_id: input.subjectId,
      subject_type: input.subjectType,
      consent_version: input.consentVersion,
      consented_at: new Date().toISOString(),
      items: input.items,
      channel: input.channel,
      ip_address: input.ipAddress ?? null,
    })
  }

  async revokeConsent(subjectId: string, reason?: string): Promise<void> {
    await this.db.from('consent_records').update({
      revoked_at: new Date().toISOString(),
    }).eq('subject_id', subjectId).is('revoked_at', null)

    if (reason) {
      await this.logAccess({
        actorId: subjectId,
        actorType: 'system',
        action: 'delete',
        resourceType: 'consent',
        resourceId: subjectId,
        metadata: { reason },
      })
    }
  }

  async getConsentHistory(subjectId: string): Promise<ConsentRecord[]> {
    const { data } = await this.db.from('consent_records')
      .select('*')
      .eq('subject_id', subjectId)
      .order('consented_at', { ascending: false })

    return (data ?? []).map(r => ({
      id: r.id,
      subjectId: r.subject_id,
      subjectType: r.subject_type,
      consentVersion: r.consent_version,
      consentedAt: new Date(r.consented_at),
      revokedAt: r.revoked_at ? new Date(r.revoked_at) : undefined,
      items: r.items,
      channel: r.channel,
      ipAddress: r.ip_address,
      createdAt: new Date(r.created_at),
    }))
  }

  // ─── 정보주체 권리 요청 (DSAR) ──────────────────────────────────────────

  async submitRequest(input: DsarInput): Promise<{ requestId: string; dueAt: Date }> {
    const dueAt = new Date(Date.now() + DSAR_DUE_DAYS * 24 * 60 * 60 * 1000)

    const { data } = await this.db.from('dsar_requests').insert({
      request_type: input.requestType,
      subject_name: input.subjectName,
      subject_contact: input.subjectContact,
      description: input.description ?? null,
      status: 'pending',
      due_at: dueAt.toISOString(),
    }).select('id').single()

    return { requestId: data!.id, dueAt }
  }

  async listRequests(filter: DsarFilter = {}): Promise<DsarRequest[]> {
    let q = this.db.from('dsar_requests').select('*').order('created_at', { ascending: false })
    if (filter.status) q = q.eq('status', filter.status)
    if (filter.requestType) q = q.eq('request_type', filter.requestType)

    const { data } = await q
    return (data ?? []).map(r => ({
      id: r.id,
      requestType: r.request_type,
      subjectName: r.subject_name,
      subjectContact: r.subject_contact,
      description: r.description,
      status: r.status,
      dueAt: new Date(r.due_at),
      processedAt: r.processed_at ? new Date(r.processed_at) : undefined,
      result: r.result,
      createdAt: new Date(r.created_at),
    }))
  }

  async resolveRequest(requestId: string, result: string): Promise<void> {
    await this.db.from('dsar_requests').update({
      status: 'completed',
      result,
      processed_at: new Date().toISOString(),
    }).eq('id', requestId)
  }

  // ─── 유출 대응 ──────────────────────────────────────────────────────────

  async reportBreach(input: BreachInput): Promise<{
    incidentId: string
    reportDeadline: Date
    notifyDeadline: Date
  }> {
    const now = new Date()
    // 1,000명 이상이면 72시간 내 위원회 신고
    const reportDeadline = input.affectedCount >= 1000
      ? new Date(now.getTime() + 72 * 60 * 60 * 1000)
      : new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) // 그 외 5일
    const notifyDeadline = new Date(now.getTime() + 72 * 60 * 60 * 1000) // 지체없이 (72h 기준)

    const { data } = await this.db.from('breach_incidents').insert({
      discovered_at: now.toISOString(),
      affected_count: input.affectedCount,
      affected_data_types: input.affectedDataTypes,
      cause: input.cause,
      immediate_actions: input.immediateActions,
      report_deadline: reportDeadline.toISOString(),
      notify_deadline: notifyDeadline.toISOString(),
    }).select('id').single()

    return { incidentId: data!.id, reportDeadline, notifyDeadline }
  }

  async markBreachReported(incidentId: string): Promise<void> {
    await this.db.from('breach_incidents').update({
      reported_at: new Date().toISOString(),
    }).eq('id', incidentId)
  }

  async markBreachNotified(incidentId: string): Promise<void> {
    await this.db.from('breach_incidents').update({
      notified_at: new Date().toISOString(),
    }).eq('id', incidentId)
  }

  async getBreachIncidents(): Promise<BreachIncident[]> {
    const { data } = await this.db.from('breach_incidents')
      .select('*').order('created_at', { ascending: false })
    return (data ?? []).map(r => ({
      id: r.id,
      discoveredAt: new Date(r.discovered_at),
      affectedCount: r.affected_count,
      affectedDataTypes: r.affected_data_types,
      cause: r.cause,
      immediateActions: r.immediate_actions,
      reportDeadline: r.report_deadline ? new Date(r.report_deadline) : undefined,
      notifyDeadline: r.notify_deadline ? new Date(r.notify_deadline) : undefined,
      reportedAt: r.reported_at ? new Date(r.reported_at) : undefined,
      notifiedAt: r.notified_at ? new Date(r.notified_at) : undefined,
      createdAt: new Date(r.created_at),
    }))
  }

  // ─── 내부 헬퍼 ──────────────────────────────────────────────────────────

  private _toRetentionRecord(r: Record<string, unknown>): RetentionRecord {
    return {
      id: r.id as string,
      subjectId: r.subject_id as string,
      subjectType: r.subject_type as RetentionRecord['subjectType'],
      retentionYears: r.retention_years as number,
      lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at as string) : undefined,
      expiresAt: new Date(r.expires_at as string),
      notifiedAt: r.notified_at ? new Date(r.notified_at as string) : undefined,
      purgedAt: r.purged_at ? new Date(r.purged_at as string) : undefined,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
    }
  }
}
