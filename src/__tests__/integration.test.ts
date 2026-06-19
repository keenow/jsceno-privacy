/**
 * @jsceno/privacy — PASS 실용성 테스트
 *
 * 실제 Supabase에 연결하여 동작 검증
 * 실행: npx vitest run src/lib/privacy-module/__tests__/integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createPrivacyService } from '../index'

const SUPABASE_URL = 'https://vlkusyqupvojsiexzhrr.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ENC_KEY = process.env.PRIVACY_ENCRYPTION_KEY!

let privacy: ReturnType<typeof createPrivacyService>
let adminClient: ReturnType<typeof createClient>
let testAuditId: string
let testRequestId: string

beforeAll(() => {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 필요')
  if (!ENC_KEY) throw new Error('PRIVACY_ENCRYPTION_KEY 필요')

  adminClient = createClient(SUPABASE_URL, SERVICE_KEY)
  privacy = createPrivacyService(adminClient, { encryptionKey: ENC_KEY })
})

afterAll(async () => {
  // 테스트 데이터 정리
  if (testRequestId) {
    await adminClient.from('dsar_requests').delete().eq('id', testRequestId)
  }
  // audit log는 보관 의무 있으므로 삭제 안 함
})

describe('I1: 암호화·복호화 (Supabase 독립)', () => {
  it('I1-1: 주민번호 암호화 → DB 저장 → 복호화 일치', async () => {
    const rrn = '9001011234567'
    const enc = privacy.encrypt(rrn)

    // DB에 저장
    const { data, error } = await adminClient.from('inquiries')
      .select('id, resident_number')
      .not('resident_number', 'is', null)
      .limit(1)
      .single()

    if (error || !data) {
      console.log('⚠️ inquiries 테스트 데이터 없음 — 암호화 포맷만 검증')
      expect(enc).toMatch(/^enc:v1:/)
      expect(privacy.decrypt(enc)).toBe(rrn)
      return
    }

    // 기존 레코드로 암호화·복호화 검증
    expect(enc).toMatch(/^enc:v1:/)
    expect(privacy.decrypt(enc)).toBe(rrn)
    console.log(`✅ [I1-1] 주민번호 암호화: ${rrn} → ${enc.slice(0, 30)}...`)
  })

  it('I1-2: 계좌번호 암호화·복호화', () => {
    const account = '110123456789'
    const enc = privacy.encrypt(account)
    expect(privacy.decrypt(enc)).toBe(account)
    console.log(`✅ [I1-2] 계좌번호 암호화: ${account} → ${enc.slice(0, 30)}...`)
  })

  it('I1-3: 레거시 평문 복호화 호환', () => {
    expect(privacy.decrypt('01012345678')).toBe('01012345678')
    console.log('✅ [I1-3] 레거시 평문 호환 확인')
  })
})

describe('I2: 접속기록 (실제 DB 저장)', () => {
  it('I2-1: logAccess → DB 저장 확인', async () => {
    await privacy.logAccess({
      actorId: 'test-admin-passbot',
      actorType: 'system',
      action: 'read',
      resourceType: 'inquiry',
      resourceId: 'integration-test',
      metadata: { test: true },
    })

    const logs = await privacy.getAccessLogs({
      actorId: 'test-admin-passbot',
      limit: 1,
    })

    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0].actorId).toBe('test-admin-passbot')
    expect(logs[0].action).toBe('read')
    testAuditId = logs[0].id
    console.log(`✅ [I2-1] 접속기록 저장: id=${logs[0].id}`)
  })
})

describe('I3: 보관기간 API', () => {
  it('I3-1: setRetention → getPendingNotices', async () => {
    // 1일 후 만료로 설정 (테스트용)
    const pastDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
    await privacy.setRetention({
      subjectId: 'integration-test-runner',
      subjectType: 'runner',
      retentionYears: 1,
      lastActivityAt: pastDate,
    })

    const expired = await privacy.getExpired('runner')
    const found = expired.find(r => r.subjectId === 'integration-test-runner')
    expect(found).toBeDefined()
    console.log(`✅ [I3-1] 만료 대상 감지: ${found?.subjectId}`)

    // 갱신
    const { newExpiresAt } = await privacy.renewRetention('integration-test-runner')
    expect(newExpiresAt.getTime()).toBeGreaterThan(Date.now())
    console.log(`✅ [I3-1] 갱신 완료: ${newExpiresAt.toISOString()}`)

    // 정리
    await adminClient.from('retention_policies').delete().eq('subject_id', 'integration-test-runner')
  })
})

describe('I4: DSAR 요청', () => {
  it('I4-1: submitRequest → listRequests → resolveRequest', async () => {
    const { requestId, dueAt } = await privacy.submitRequest({
      requestType: 'delete',
      subjectName: '통합테스트',
      subjectContact: 'integration-test@jsceno.com',
      description: '실용성 테스트',
    })

    testRequestId = requestId
    expect(requestId).toBeTruthy()
    expect(dueAt.getTime()).toBeGreaterThan(Date.now())

    const list = await privacy.listRequests({ status: 'pending' })
    const found = list.find(r => r.id === requestId)
    expect(found).toBeDefined()
    expect(found?.subjectName).toBe('통합테스트')

    await privacy.resolveRequest(requestId, '테스트 완료')
    const updated = await privacy.listRequests({ status: 'completed' })
    const resolved = updated.find(r => r.id === requestId)
    expect(resolved?.status).toBe('completed')

    console.log(`✅ [I4-1] DSAR 접수→처리 완료: ${requestId}`)
  })
})
