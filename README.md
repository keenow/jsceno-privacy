# @jsceno/privacy

JSCENO 공통 개인정보보호 모듈

법적 근거: 개인정보보호법 + 「개인정보의 안전성 확보조치 기준 안내서」 2024.10.

---

## 설치 (서브모듈)

```bash
git submodule add https://github.com/keenow/jsceno-privacy.git src/lib/privacy-module
git submodule update --init
```

---

## 기본 사용법

```typescript
import { createClient } from '@supabase/supabase-js'
import { createPrivacyService } from './src/lib/privacy-module/src'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const privacy = createPrivacyService(admin, {
  encryptionKey: process.env.PRIVACY_ENCRYPTION_KEY!,
})
```

---

## 기능별 사용 예시

### 암호화

```typescript
// 주민번호 저장 시
const encRrn = privacy.encrypt(residentNumber)
await db.from('inquiries').update({ resident_number: encRrn }).eq('id', id)

// 조회 후 복호화
const plain = privacy.decrypt(encRrn)

// 화면 표시용 마스킹 (복호화 불필요)
privacy.maskPhone('01012345678')   // "010-****-5678"
privacy.maskEmail('k@gmail.com')   // "k@gmail.com"
privacy.maskRrn('9001011234567')   // "900101-*******"
privacy.maskAccount('110123456789') // "1101******89"
```

### 접속기록

```typescript
// 관리자가 개인정보 조회 시
await privacy.logAccess({
  actorId: session.user.id,
  actorType: 'admin',
  action: 'read',
  resourceType: 'inquiry',
  resourceId: inquiryId,
  ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
})

// 접속 기록 조회
const logs = await privacy.getAccessLogs({
  resourceType: 'inquiry',
  from: new Date('2026-01-01'),
  limit: 50,
})
```

### 보관기간 관리

```typescript
// 이벤트 종료 시 보관기간 설정
await privacy.setRetention({
  subjectId: runnerId,
  subjectType: 'runner',
  retentionYears: 3,
})

// 만료 30일 전 통지 대상 조회 (cron으로 매일 실행)
const notices = await privacy.getPendingNotices(30)
for (const notice of notices) {
  // SMS/이메일 발송은 프로젝트에서 처리
  await sendSms(notice.contact, `보관기간 만료 예정 (${notice.daysRemaining}일 후)`)
  await privacy.markNotified(notice.subjectId)
}

// 정보주체가 갱신 요청 시
const { newExpiresAt } = await privacy.renewRetention(subjectId)
```

### 파기

```typescript
// 단건 파기 (기간 만료 시)
await privacy.purgeFields({
  table: 'inquiries',
  fields: ['name', 'phone', 'email', 'resident_number', 'account_number'],
  exemptFields: ['resident_number', 'account_number'],  // 세법 5년 보관
  recordId: inquiryId,
  reason: '보관기간 만료',
})

// 일괄 파기 (cron으로 정기 실행)
const result = await privacy.batchPurge('runner')
console.log(`${result.totalProcessed}건 파기 완료`)
```

### 수집 동의

```typescript
// 등록 시 동의 기록
await privacy.recordConsent({
  subjectId: runnerId,
  subjectType: 'runner',
  consentVersion: '2026-v1',
  items: ['개인정보 수집·이용 동의', '제3자 제공 동의'],
  channel: 'web',
  ipAddress: clientIp,
})

// 동의 철회
await privacy.revokeConsent(subjectId, '본인 요청')
```

### DSAR (정보주체 권리 요청)

```typescript
// 삭제 요청 접수 (채널: 이메일 info@jsceno.com)
const { requestId, dueAt } = await privacy.submitRequest({
  requestType: 'delete',
  subjectName: '홍길동',
  subjectContact: 'hong@example.com',
  description: '모든 개인정보 삭제 요청',
})

// 처리 완료
await privacy.resolveRequest(requestId, '요청 처리 완료 — 데이터 파기 실행됨')
```

### 유출 대응

```typescript
// 사고 등록
const { incidentId, reportDeadline, notifyDeadline } = await privacy.reportBreach({
  affectedCount: 1500,
  affectedDataTypes: ['phone', 'email'],
  cause: '외부 해킹',
  immediateActions: ['서비스 임시 중단', '비밀번호 초기화'],
})
// reportDeadline: 72시간 내 위원회 신고 기한 (1,000명↑)

// 신고·통지 완료 처리
await privacy.markBreachReported(incidentId)
await privacy.markBreachNotified(incidentId)
```

---

## DB 마이그레이션

```bash
# Supabase SQL Editor에서 순서대로 실행
src/migrations/001_privacy_audit_logs.sql
src/migrations/002_consent_records.sql
src/migrations/003_retention_policies.sql
src/migrations/004_dsar_requests.sql
src/migrations/005_breach_incidents.sql
src/migrations/006_privacy_purge_logs.sql
```

---

## 환경변수

```env
# 필수 — openssl rand -hex 32 로 생성
PRIVACY_ENCRYPTION_KEY=<64자 hex 문자열>

# 선택 (기본값 있음)
PRIVACY_ENCRYPT_PHONE=true
PRIVACY_ENCRYPT_EMAIL=true
```

---

## 암호화 포맷

```
저장값: "enc:v1:BASE64(16byte-IV + ciphertext + 16byte-AuthTag)"

복호화:
  "enc:v1:" 시작 → AES-256-GCM 복호화
  그 외 → 평문 그대로 반환 (레거시 데이터 호환)
```

---

## 세법 보관 예외

| 항목 | 보관 의무 | 근거 |
|------|---------|------|
| 주민번호 | 5년 | 소득세법 제163조 |
| 계좌번호 | 5년 | 근로기준법 제42조 |

`purgeFields()` 호출 시 `exemptFields` 옵션으로 해당 필드를 제외하세요.

---

## 적용 프로젝트

- [JSCENO PASS](https://github.com/keenow/jsceno-pass)
- KTSA (예정)
