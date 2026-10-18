/* tests/fixtures.mjs — small, made-up pictures for the tests: a JPEG that carries a camera's note about where it was taken, and a PNG that
   carries a text chunk. They are not real photographs; they have the structure a picture file has, which is what the server reads. */
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

export const SECRET = "GPSLatitude47.6062N-SECRET-PLACE";
export function makeJpeg({ w = 800, h = 600, exif = true, pad = 400 } = {}) {
  const app0 = Buffer.concat([Buffer.from("ffe0", "hex"), u16(16), Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")]);
  const exifBody = Buffer.from("Exif\0\0" + SECRET, "latin1");
  const app1 = Buffer.concat([Buffer.from("ffe1", "hex"), u16(exifBody.length + 2), exifBody]);
  const com = Buffer.concat([Buffer.from("fffe", "hex"), u16(2 + 9), Buffer.from("a comment", "latin1")]);
  const sof = Buffer.concat([Buffer.from("ffc0", "hex"), u16(17), Buffer.from([8]), u16(h), u16(w), Buffer.from([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])]);
  const sos = Buffer.concat([Buffer.from("ffda", "hex"), u16(12), Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0])]);
  return Buffer.concat([Buffer.from("ffd8", "hex"), app0, ...(exif ? [app1, com] : []), sof, sos, Buffer.alloc(pad, 0x55), Buffer.from("ffd9", "hex")]);
}
const chunk = (type, data) => Buffer.concat([u32(data.length), Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
export function makePng({ w = 640, h = 480, text = true, pad = 300 } = {}) {
  const ihdr = Buffer.concat([u32(w), u32(h), Buffer.from([8, 2, 0, 0, 0])]);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), ...(text ? [chunk("tEXt", Buffer.from("Author\0" + SECRET, "latin1"))] : []), chunk("IDAT", Buffer.alloc(pad, 3)), chunk("IEND", Buffer.alloc(0))]);
}
