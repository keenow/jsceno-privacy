/**
 * @jsceno/privacy — 암호화 유틸
 *
 * 알고리즘: AES-256-GCM
 * 저장 포맷: "enc:v1:BASE64(16byte-IV + ciphertext + 16byte-AuthTag)"
 *
 * 레거시 호환:
 *   - "enc:" prefix 없으면 평문으로 판단 → 그대로 반환
 *   - 점진적 마이그레이션 가능
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const PREFIX = 'enc:v1:'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const ALGORITHM = 'aes-256-gcm'

function getKey(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) {
    throw new Error(`암호화 키는 32바이트(64자 hex)여야 합니다. 현재: ${key.length}바이트`)
  }
  return key
}

/**
 * 암호화
 * @returns "enc:v1:base64(iv+ciphertext+authTag)"
 */
export function encrypt(plainText: string, keyHex: string): string {
  if (!plainText) return plainText

  const key = getKey(keyHex)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  const combined = Buffer.concat([iv, encrypted, authTag])
  return PREFIX + combined.toString('base64')
}

/**
 * 복호화
 * - "enc:v1:" prefix 없으면 평문 그대로 반환 (레거시 호환)
 */
export function decrypt(cipherText: string, keyHex: string): string {
  if (!cipherText) return cipherText
  if (!cipherText.startsWith(PREFIX)) return cipherText  // 평문 그대로

  const key = getKey(keyHex)
  const combined = Buffer.from(cipherText.slice(PREFIX.length), 'base64')

  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(encrypted) + decipher.final('utf8')
}

/**
 * 암호화 여부 확인
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

/**
 * 전화번호 마스킹 (화면 표시용 — 복호화 불필요 시)
 * "01012345678" → "010-****-5678"
 */
export function maskPhone(phone: string): string {
  if (!phone) return ''
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-****-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-***-${digits.slice(7)}`
  }
  return phone.slice(0, 3) + '****'
}

/**
 * 이메일 마스킹 (화면 표시용)
 * "keenow@gmail.com" → "k****w@gmail.com"
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return ''
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `${'*'.repeat(local.length)}@${domain}`
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`
}

/**
 * 주민번호 마스킹
 * "9001011234567" → "900101-*******"
 */
export function maskRrn(rrn: string): string {
  if (!rrn) return ''
  const digits = rrn.replace(/[^0-9]/g, '')
  if (digits.length !== 13) return '******-*******'
  return `${digits.slice(0, 6)}-*******`
}

/**
 * 계좌번호 마스킹
 * "1234567890123" → "123456*****23"
 */
export function maskAccount(account: string): string {
  if (!account) return ''
  const digits = account.replace(/[^0-9]/g, '')
  if (digits.length < 6) return '*'.repeat(digits.length)
  return `${digits.slice(0, 4)}${'*'.repeat(digits.length - 6)}${digits.slice(-2)}`
}
