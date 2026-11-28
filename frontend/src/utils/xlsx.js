/**
 * Small, dependency-free .xlsx reader (first worksheet only).
 * An .xlsx file is a ZIP of XML parts; we unzip with the browser's DecompressionStream
 * and read sharedStrings / styles / the first sheet. Returns the same shape as parseCsv:
 * { headers: string[], rows: Array<Record<string,string>> }.
 * Legacy binary .xls (Excel 97-2003) is not supported — save it as .xlsx or .csv.
 */

import { parseCsv } from './csv';

// ---------- ZIP ----------
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read Excel files. Please update it or upload a CSV file.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  // Find End Of Central Directory record (signature 0x06054b50), scanning backwards.
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('NOT_ZIP');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries[name] = { method, compSize, localOff };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    has: (name) => name in entries,
    async text(name) {
      const e = entries[name];
      if (!e) return null;
      const lnameLen = dv.getUint16(e.localOff + 26, true);
      const lextraLen = dv.getUint16(e.localOff + 28, true);
      const start = e.localOff + 30 + lnameLen + lextraLen;
      const data = u8.subarray(start, start + e.compSize);
      const raw = e.method === 0 ? data : e.method === 8 ? await inflateRaw(data) : null;
      if (!raw) throw new Error('Unsupported compression in Excel file.');
      return dec.decode(raw);
    },
  };
}

// ---------- XML helpers ----------
const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const byTag = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
const textOf = (node) => byTag(node, 't').map((t) => t.textContent).join('');

function colIndex(ref) {
  const letters = /^[A-Z]+/i.exec(ref || '')?.[0]?.toUpperCase() || '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const isDateFormat = (code) => /[dmyhs]/i.test(String(code).replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));

function serialToDate(serial, date1904) {
  const ms = Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const iso = d.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
}

function formatNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  // Remove float noise like 0.30000000000000004
  return String(Number.isInteger(n) ? n : parseFloat(n.toPrecision(15)));
}

// ---------- Workbook ----------
export async function parseXlsx(arrayBuffer) {
  let zip;
  try { zip = await unzip(arrayBuffer); } catch (e) {
    if (e.message === 'NOT_ZIP') throw new Error('This is not a valid .xlsx file. Old .xls files must be saved as .xlsx or .csv first.');
    throw e;
  }

  // Locate the first worksheet through workbook.xml + its relationships.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  let date1904 = false;
  const wbXml = await zip.text('xl/workbook.xml');
  if (wbXml) {
    const wb = parseXml(wbXml);
    date1904 = ['1', 'true'].includes(byTag(wb, 'workbookPr')[0]?.getAttribute('date1904'));
    const firstSheet = byTag(wb, 'sheet')[0];
    const rid = firstSheet && (firstSheet.getAttribute('r:id') || firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const relsXml = await zip.text('xl/_rels/workbook.xml.rels');
    if (rid && relsXml) {
      const rel = byTag(parseXml(relsXml), 'Relationship').find((r) => r.getAttribute('Id') === rid);
      const target = rel?.getAttribute('Target');
      if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    }
  }
  if (!zip.has(sheetPath)) throw new Error('The Excel file has no worksheet.');

  const ssXml = await zip.text('xl/sharedStrings.xml');
  const shared = ssXml ? byTag(parseXml(ssXml), 'si').map(textOf) : [];

  // Which cell styles are dates.
  let dateStyles = [];
  const stXml = await zip.text('xl/styles.xml');
  if (stXml) {
    const st = parseXml(stXml);
    const custom = Object.fromEntries(byTag(st, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode')]));
    const cellXfs = byTag(st, 'cellXfs')[0];
    if (cellXfs) {
      dateStyles = byTag(cellXfs, 'xf').map((xf) => {
        const id = Number(xf.getAttribute('numFmtId') || 0);
        return BUILTIN_DATE_FMTS.has(id) || (custom[id] != null && isDateFormat(custom[id]));
      });
    }
  }

  const sheet = parseXml(await zip.text(sheetPath));
  const grid = [];
  for (const rowEl of byTag(sheet, 'row')) {
    const row = [];
    let next = 0;
    for (const c of byTag(rowEl, 'c')) {
      const ref = c.getAttribute('r');
      const idx = ref ? colIndex(ref) : next;
      next = idx + 1;
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? '';
      let val;
      if (type === 's') val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = byTag(c, 'is')[0] ? textOf(byTag(c, 'is')[0]) : '';
      else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str' || type === 'e') val = v;
      else if (v === '') val = '';
      else if (dateStyles[Number(c.getAttribute('s') || 0)]) val = serialToDate(Number(v), date1904);
      else val = formatNumber(v);
      row[idx] = String(val);
    }
    if (row.some((x) => x != null && x.trim() !== '')) grid.push(Array.from(row, (x) => x ?? ''));
  }

  if (!grid.length) return { headers: [], rows: [] };
  const headers = grid[0].map((h) => h.trim());
  return {
    headers,
    rows: grid.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))),
  };
}

/** Reads a CSV or .xlsx File into { headers, rows }. */
export async function parseSpreadsheet(file) {
  const name = file?.name || '';
  if (/\.xls$/i.test(name)) throw new Error('Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV.');
  if (/\.xlsx$/i.test(name)) return parseXlsx(await file.arrayBuffer());
  return parseCsv(await file.text());
}
