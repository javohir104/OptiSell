/** EAN-13 barcode as SVG (no library). Returns null for codes that are not 13 digits. */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export const isEan13 = (code) => {
  if (!/^\d{13}$/.test(String(code))) return false;
  const d = String(code);
  const sum = [...d.slice(0, 12)].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
};

/** Bit string: 1 = bar. 95 modules. */
function bits(code) {
  const d = String(code);
  const parity = PARITY[Number(d[0])];
  let out = '101';
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === 'L' ? L : G)[Number(d[i])];
  out += '01010';
  for (let i = 7; i <= 12; i++) out += R[Number(d[i])];
  return `${out}101`;
}

/** SVG markup, `module` = width of one bar unit in px. */
export function ean13Svg(code, { module = 2, height = 50 } = {}) {
  if (!isEan13(code)) return null;
  const b = bits(code);
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  const quiet = 9 * module;
  const w = quiet * 2 + b.length * module;
  const textH = 12;
  let rects = '';
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== '1') continue;
    const h = guard.has(i) ? height + 5 : height;
    rects += `<rect x="${quiet + i * module}" y="0" width="${module}" height="${h}"/>`;
  }
  const d = String(code);
  const fs = 11;
  const text = `<text x="${quiet - 4}" y="${height + textH}" font-size="${fs}" text-anchor="end">${d[0]}</text>`
    + `<text x="${quiet + 24 * module}" y="${height + textH}" font-size="${fs}" text-anchor="middle" letter-spacing="1">${d.slice(1, 7)}</text>`
    + `<text x="${quiet + 71 * module}" y="${height + textH}" font-size="${fs}" text-anchor="middle" letter-spacing="1">${d.slice(7)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${height + textH + 2}" width="${w}" height="${height + textH + 2}" font-family="monospace" fill="#000">${rects}${text}</svg>`;
}
