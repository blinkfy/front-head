const REGION_PREFIXES = new Set([
  '11', '12', '13', '14', '15', '21', '22', '23',
  '31', '32', '33', '34', '35', '36', '37', '41', '42', '43', '44', '45', '46',
  '50', '51', '52', '53', '54', '61', '62', '63', '64', '65', '71', '81', '82'
]);
const CHECK_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_DIGITS = '10X98765432';
const normalize = number => typeof number === 'string' ? number.trim().toUpperCase() : '';
// Match the issuing region prefix, not today's county list: historical county
// codes remain in valid identity numbers after an administrative reorganisation.
export function identityNumberError(number, now = Date.now()) {
  const id = normalize(number);
  if (!/^[1-9]\d{16}[\dX]$/.test(id)) return '请填写有效的18位身份证号码';
  if (!REGION_PREFIXES.has(id.slice(0, 2))) return '身份证地区代码不正确，请核对';
  const birth = `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
  const date = new Date(`${birth}T00:00:00Z`);
  if (Number(id.slice(6, 10)) < 1 || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birth) return '身份证出生日期不正确，请核对';
  // Mainland China civil date; device/server timezone must not shift a birthday.
  const today = new Date(Number(now) + 8 * 60 * 60 * 1000);
  if (!Number.isFinite(today.getTime())) return '暂时无法校验身份证号码，请稍后重试';
  if (birth > today.toISOString().slice(0, 10)) return '身份证出生日期不正确，请核对';
  const sum = CHECK_WEIGHTS.reduce((total, weight, index) => total + Number(id[index]) * weight, 0);
  if (id[17] !== CHECK_DIGITS[sum % 11]) return '身份证号码校验未通过，请核对后重新填写';
  return '';
}
export function identityAgeError(number, now = Date.now()) {
  const error = identityNumberError(number, now);
  if (error) return error;
  const id = normalize(number), birth = `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
  const today = new Date(Number(now) + 8 * 60 * 60 * 1000);
  const year = today.getUTCFullYear(), month = String(today.getUTCMonth() + 1).padStart(2, '0'), day = String(today.getUTCDate()).padStart(2, '0');
  return birth > `${year - 18}-${month}-${day}` ? '实名认证需年满18周岁' : '';
}
