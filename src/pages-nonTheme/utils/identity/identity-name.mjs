// Explicit code-point ranges keep rare Han names supported on older App and
// mini-program engines, without Unicode property-escape syntax requirements.
const HAN_RANGES = [
  [0x3400, 0x4DBF], [0x4E00, 0x9FFF], [0xF900, 0xFAFF],
  [0x20000, 0x2A6DF], [0x2A700, 0x2B73F], [0x2B740, 0x2B81F],
  [0x2B820, 0x2CEAF], [0x2CEB0, 0x2EBEF], [0x2EBF0, 0x2EE5F],
  [0x2F800, 0x2FA1F], [0x30000, 0x3134F], [0x31350, 0x323AF], [0x323B0, 0x33479]
];
export function normalizeIdentityName(value) {
  // Only trim the edges and standardise visually similar name separators.
  // Do not remove inner spaces, arbitrary punctuation or change Han characters.
  return typeof value === 'string' ? value.trim().replace(/[•・‧∙]/g, '·') : '';
}
export function identityNameError(value) {
  const name = normalizeIdentityName(value);
  if (name.length > 100) return '请填写2至50个字符的本人姓名';
  const characters = Array.from(name);
  if (characters.length < 2 || characters.length > 50) return '请填写2至50个字符的本人姓名';
  if (name.startsWith('·') || name.endsWith('·') || name.includes('··')) return '姓名间隔符“·”应位于文字之间，且不能连续使用';
  if (!characters.every(character => {
    if (character === '·') return true;
    const point = character.codePointAt(0);
    return point === 0x3007 || HAN_RANGES.some(([first, last]) => point >= first && point <= last);
  })) return '姓名仅支持汉字和间隔符“·”，请按身份证填写';
  return '';
}
