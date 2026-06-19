import { describe, it, expect } from 'vitest'
import {
  encrypt, decrypt, isEncrypted,
  maskPhone, maskEmail, maskRrn, maskAccount,
} from '../encrypt'

const TEST_KEY = 'a'.repeat(64) // 32바이트 hex

describe('E1: 암호화·복호화', () => {
  it('E1-1: 암호화 후 복호화 시 원문 일치', () => {
    const plain = '01012345678'
    const cipher = encrypt(plain, TEST_KEY)
    expect(decrypt(cipher, TEST_KEY)).toBe(plain)
  })

  it('E1-2: 암호화 결과는 enc:v1: 로 시작', () => {
    expect(encrypt('test', TEST_KEY)).toMatch(/^enc:v1:/)
  })

  it('E1-3: 같은 값을 두 번 암호화하면 결과가 다름 (IV 랜덤)', () => {
    const a = encrypt('01012345678', TEST_KEY)
    const b = encrypt('01012345678', TEST_KEY)
    expect(a).not.toBe(b)
  })

  it('E1-4: 레거시 평문 복호화 시 그대로 반환', () => {
    expect(decrypt('01012345678', TEST_KEY)).toBe('01012345678')
  })

  it('E1-5: 빈 값 처리', () => {
    expect(encrypt('', TEST_KEY)).toBe('')
    expect(decrypt('', TEST_KEY)).toBe('')
  })

  it('E1-6: 주민번호 암호화·복호화', () => {
    const rrn = '9001011234567'
    expect(decrypt(encrypt(rrn, TEST_KEY), TEST_KEY)).toBe(rrn)
  })

  it('E1-7: 계좌번호 암호화·복호화', () => {
    const account = '110123456789'
    expect(decrypt(encrypt(account, TEST_KEY), TEST_KEY)).toBe(account)
  })
})

describe('E2: isEncrypted', () => {
  it('E2-1: 암호화된 값 감지', () => {
    expect(isEncrypted(encrypt('test', TEST_KEY))).toBe(true)
  })

  it('E2-2: 평문 감지', () => {
    expect(isEncrypted('01012345678')).toBe(false)
  })
})

describe('E3: 마스킹', () => {
  it('E3-1: 전화번호 마스킹 (11자리)', () => {
    expect(maskPhone('01012345678')).toBe('010-****-5678')
  })

  it('E3-2: 이메일 마스킹', () => {
    expect(maskEmail('keenow@gmail.com')).toBe('k****w@gmail.com')
    expect(maskEmail('ab@gmail.com')).toBe('**@gmail.com')
  })

  it('E3-3: 주민번호 마스킹', () => {
    expect(maskRrn('9001011234567')).toBe('900101-*******')
  })

  it('E3-4: 계좌번호 마스킹', () => {
    expect(maskAccount('110123456789')).toBe('1101******89')
  })
})
