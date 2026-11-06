// Minimal ICO writer: PNG-compressed entries (supported since Windows Vista and
// by every current browser). Layout: ICONDIR (6 B), one ICONDIRENTRY (16 B) per
// image, then the PNG payloads.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @param {{ size: number, png: Buffer }[]} images square PNGs, 1-256 px */
export function encodeIco(images) {
    if (images.length === 0) throw new Error('ICO needs at least one image');
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(images.length, 4);
    const entries = [];
    let offset = 6 + 16 * images.length;
    for (const { size, png } of images) {
        if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`Bad ICO size ${size}`);
        if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('ICO entries must be PNG');
        const e = Buffer.alloc(16);
        e.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
        e.writeUInt8(size === 256 ? 0 : size, 1); // height
        e.writeUInt8(0, 2); // palette colours
        e.writeUInt8(0, 3); // reserved
        e.writeUInt16LE(1, 4); // colour planes
        e.writeUInt16LE(32, 6); // bits per pixel
        e.writeUInt32LE(png.length, 8);
        e.writeUInt32LE(offset, 12);
        entries.push(e);
        offset += png.length;
    }
    return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/** Parse an ICO back into its entries (used by the tests). */
export function decodeIco(buf) {
    if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('Not an ICO file');
    const count = buf.readUInt16LE(4);
    return Array.from({ length: count }, (_, i) => {
        const at = 6 + 16 * i;
        const size = buf.readUInt8(at) || 256;
        const length = buf.readUInt32LE(at + 8);
        const offset = buf.readUInt32LE(at + 12);
        return { size, png: buf.subarray(offset, offset + length) };
    });
}
