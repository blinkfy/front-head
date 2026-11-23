const KEYBOARD_ROWS = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  '1234567890',
  '1qaz2wsx3edc4rfv',
  'qazwsxedcrfvtgb'
]

const WEAK_PASSWORD_PATTERNS = [
  '123456',
  '12345',
  '123123',
  '654321',
  '111111',
  '000000',
  '666666',
  '888888',
  '5201314',
  'password',
  'passwd',
  'admin',
  'root',
  'qwerty',
  'asdfgh',
  'zxcvbn',
  'qazwsx',
  'iloveyou',
  'welcome',
  'abc123',
  'asdf123',
  'qwer123',
  'zxcv123',
  '1q2w3e',
  'q1w2e3',
  'a1b2c3',
  '1a2b3c'
]

function hasKeyboardSequence(str, minLen = 4) {
  const lower = str.toLowerCase()
  for (const row of KEYBOARD_ROWS) {
    if (row.length < minLen) continue
    const rev = row.split('').reverse().join('')
    for (let i = 0; i <= row.length - minLen; i++) {
      const sub = row.slice(i, i + minLen)
      const revSub = rev.slice(i, i + minLen)
      if (lower.includes(sub) || lower.includes(revSub)) {
        return true
      }
    }
  }
  return false
}

function hasSequentialChars(str, minLen = 4) {
  const lower = str.toLowerCase()
  let asc = 1
  let desc = 1
  for (let i = 1; i < lower.length; i++) {
    const prev = lower.charCodeAt(i - 1)
    const curr = lower.charCodeAt(i)
    const isDigit = prev >= 48 && prev <= 57 && curr >= 48 && curr <= 57
    const isAlpha = prev >= 97 && prev <= 122 && curr >= 97 && curr <= 122

    if ((isDigit || isAlpha) && curr - prev === 1) {
      asc++
      desc = 1
    } else if ((isDigit || isAlpha) && prev - curr === 1) {
      desc++
      asc = 1
    } else {
      asc = 1
      desc = 1
    }
    if (asc >= minLen || desc >= minLen) {
      return true
    }
  }
  return false
}

function isRepeatingChunkPattern(str) {
  const lower = str.toLowerCase()
  return /^(.{1,3})\1+$/.test(lower)
}

/**
 * 评估密码复杂度与弱口令特征
 * @param {string} password 待校验的密码
 * @param {{ username?: string, oldPassword?: string }} options 上下文选项
 * @returns {{ valid: boolean, level: 'none'|'weak'|'medium'|'strong', score: number, hint: string, message: string }}
 */
export function evaluatePassword(password, options = {}) {
  const pwd = String(password || '')
  const username = String(options.username || '').trim()
  const oldPassword = String(options.oldPassword || '')

  if (!pwd) {
    return {
      valid: false,
      level: 'none',
      score: 0,
      hint: '请输入密码',
      message: '请输入密码'
    }
  }

  if (pwd.length < 6) {
    return {
      valid: false,
      level: 'weak',
      score: 1,
      hint: '密码过于简单',
      message: '密码长度至少6位'
    }
  }

  if (oldPassword && pwd === oldPassword) {
    return {
      valid: false,
      level: 'weak',
      score: 1,
      hint: '新旧密码相同',
      message: '新密码不能与当前密码相同'
    }
  }

  let complexity = 0
  if (/[a-z]/.test(pwd)) complexity++
  if (/[A-Z]/.test(pwd)) complexity++
  if (/[0-9]/.test(pwd)) complexity++
  if (/[^A-Za-z0-9]/.test(pwd)) complexity++

  if (complexity < 2) {
    return {
      valid: false,
      level: 'weak',
      score: 1,
      hint: '密码过于简单',
      message: '密码需包含大小写字母、数字、特殊字符中至少两种'
    }
  }

  const lower = pwd.toLowerCase()
  const lowerUser = username.toLowerCase()

  // 与用户名相同或包含用户名
  if (lowerUser && (lower === lowerUser || (lowerUser.length >= 3 && lower.includes(lowerUser)))) {
    return {
      valid: false,
      level: 'weak',
      score: 1,
      hint: '密码过于简单',
      message: '密码过于简单，不能与用户名相同或包含用户名'
    }
  }

  // 常见弱密码黑名单匹配（或弱口令仅加简单前后缀）
  const strippedDigits = lower.replace(/^[0-9]+|[0-9]+$/g, '')
  if (
    WEAK_PASSWORD_PATTERNS.some(
      pattern =>
        lower === pattern ||
        (pwd.length <= 10 && lower.includes(pattern)) ||
        (strippedDigits.length >= 4 && strippedDigits === pattern)
    )
  ) {
    return {
      valid: false,
      level: 'weak',
      score: 1,
      hint: '密码过于简单',
      message: '密码过于简单，请勿使用常见简单组合'
    }
  }

  // 连续相同字符（如 aaa111）或重复短周期（如 abab12、ab1ab1）或唯一字符过少
  if (/(.)\1{2,}/i.test(pwd) || isRepeatingChunkPattern(pwd) || new Set(lower).size < 4) {
    return {
      valid: false,
      level: 'weak',
      score: 1,
      hint: '密码过于简单',
      message: '密码过于简单，请勿使用连续或大量重复字符'
    }
  }

  // 键盘连续序列（如 asdf123、qwer123）与字母/数字顺子（如 abc123、ab1234）
  const hasKey4 = hasKeyboardSequence(pwd, 4)
  const hasKey3 = hasKeyboardSequence(pwd, 3)
  const hasSeq4 = hasSequentialChars(pwd, 4)
  const hasSeq3 = hasSequentialChars(pwd, 3)

  if (hasKey4 || hasSeq4 || (hasKey3 && hasSeq3)) {
    return {
      valid: false,
      level: 'weak',
      score: 1,
      hint: '密码过于简单',
      message: '密码过于简单，请勿使用连续键盘字符或顺子组合'
    }
  }

  // 拆分字母段与数字段：若短短6-7位密码中字母部分和数字部分都是顺子/键盘序/重复块
  const alphaPart = lower.replace(/[^a-z]/g, '')
  const digitPart = lower.replace(/[^0-9]/g, '')
  const isSimpleAlpha =
    hasKeyboardSequence(alphaPart, 3) ||
    hasSequentialChars(alphaPart, 3) ||
    /^(.)\1+$/.test(alphaPart) ||
    isRepeatingChunkPattern(alphaPart)
  const isSimpleDigit =
    hasSequentialChars(digitPart, 2) ||
    /^(.)\1+$/.test(digitPart) ||
    isRepeatingChunkPattern(digitPart)
  if (
    pwd.length <= 8 &&
    complexity === 2 &&
    alphaPart.length >= 2 &&
    digitPart.length >= 2 &&
    isSimpleAlpha &&
    isSimpleDigit
  ) {
    return {
      valid: false,
      level: 'weak',
      score: 1,
      hint: '密码过于简单',
      message: '密码过于简单，请勿使用连续键盘字符或顺子组合'
    }
  }

  let score = 2
  if (pwd.length >= 10) score++
  if (complexity >= 3) score++
  if (pwd.length >= 8 && complexity >= 3 && !hasSeq3 && !hasKey3) score++

  const level = score >= 4 ? 'strong' : 'medium'
  return {
    valid: true,
    level,
    score,
    hint: '',
    message: level === 'strong' ? '密码强度：强' : '密码强度：中'
  }
}
