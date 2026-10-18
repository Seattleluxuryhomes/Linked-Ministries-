/* photo.mjs — what a ministry's picture is allowed to be, checked and cleaned before it is stored. Pure: bytes in, bytes out.
   A picture is a JPEG or a PNG, at most 1.5 MB, at most 8000 pixels on a side. The label a browser sends is not trusted: the
   bytes must be what they say. Anything a phone writes into a picture that is not the picture (where it was taken, the camera's
   serial number, a note) is taken out before it is kept: a JPEG's APP1 to APP15 and comment segments, a PNG's text and EXIF chunks.
   The picture itself is not re-drawn and not changed. */
export const MAX_BYTES = 1572864;
export const MAX_SIDE = 8000;

const fail = (code, words) => ({ ok: false, code, words });

function cleanJpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return fail("not_a_picture", "That file is not a JPEG or a PNG picture.");
  const out = [b.subarray(0, 2)];
  let i = 2, w = 0, h = 0, sos = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return fail("not_a_picture", "That picture could not be read.");
    let m = b[i + 1];
    while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]; }          /* fill bytes */
    if (m === 0xd9) { out.push(b.subarray(i, i + 2)); i += 2; break; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { out.push(b.subarray(i, i + 2)); i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) return fail("not_a_picture", "That picture could not be read.");
    const seg = b.subarray(i, i + 2 + len);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); }
    const drop = (m >= 0xe1 && m <= 0xef) || m === 0xfe;                    /* APP1..APP15 (EXIF, XMP, ...) and comments; APP0 (JFIF) stays */
    if (!drop) out.push(seg);
    i += 2 + len;
    if (m === 0xda) { sos = true; out.push(b.subarray(i)); i = b.length; break; }   /* the scan and everything after it is the picture */
  }
  if (!sos) return fail("not_a_picture", "That picture could not be read.");
  if (!w || !h) return fail("not_a_picture", "That picture could not be read.");
  return { ok: true, type: "image/jpeg", bytes: Buffer.concat(out), width: w, height: h };
}

const PNG_SIG = Buffer.from("89504e470d0a1a0a", "hex");
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
function cleanPng(b) {
  if (b.length < 33 || !b.subarray(0, 8).equals(PNG_SIG)) return fail("not_a_picture", "That file is not a JPEG or a PNG picture.");
  const out = [b.subarray(0, 8)];
  let i = 8, w = 0, h = 0, end = false;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i), type = b.toString("latin1", i + 4, i + 8);
    if (i + 12 + len > b.length) return fail("not_a_picture", "That picture could not be read.");
    if (type === "IHDR") { w = b.readUInt32BE(i + 8); h = b.readUInt32BE(i + 12); }
    if (!PNG_DROP.has(type)) out.push(b.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === "IEND") { end = true; break; }
  }
  if (!end || !w || !h) return fail("not_a_picture", "That picture could not be read.");
  return { ok: true, type: "image/png", bytes: Buffer.concat(out), width: w, height: h };
}

/** check and clean a picture. { ok: true, type, bytes, width, height } or { ok: false, code, words } */
export function cleanPhoto(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (b.length < 100) return fail("not_a_picture", "That file is too small to be a picture.");
  if (b.length > MAX_BYTES) return fail("photo_too_big", "That picture is bigger than 1.5 MB. Choose a smaller one.");
  const r = b[0] === 0xff ? cleanJpeg(b) : b[0] === 0x89 ? cleanPng(b) : fail("not_a_picture", "That file is not a JPEG or a PNG picture.");
  if (!r.ok) return r;
  if (r.width > MAX_SIDE || r.height > MAX_SIDE) return fail("photo_too_wide", "That picture is too large on a side. Choose one under 8000 pixels.");
  return r;
}
