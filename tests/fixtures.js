// Test files shared by the suites (same fixtures as backend/tests/_support/Fixtures.php).
import zlib from "node:zlib";

export function cube(size = 17) {
	const rows = [];
	for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) rows.push(`${(r / (size - 1)).toFixed(4)} ${(g / (size - 1)).toFixed(4)} ${(b / (size - 1)).toFixed(4)}`);
	return `TITLE "Test"\nLUT_3D_SIZE ${size}\n${rows.join("\n")}\n`;
}

export function png(w, h) {
	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : 0);
		return Buffer.concat([len, body, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	const raw = Buffer.alloc((w * 4 + 1) * h);
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export const lottie = { v: "5.7.4", fr: 30, ip: 0, op: 60, w: 512, h: 512, layers: [{ ty: 4, nm: "shape" }, { ty: 5, nm: "Title" }], assets: [] };


/** Uploads a file (+ a PNG thumbnail), creates the asset and publishes it with `token` (a super admin). */
export async function publishAsset(call, token, filename, buf, body = {}, { publish = true } = {}) {
	const up = await call("POST", "/api/v1/admin/uploads", { token, raw: buf, headers: { "X-Filename": encodeURIComponent(filename) } });
	const thumb = await call("POST", "/api/v1/admin/uploads", { token, raw: png(640, 360), headers: { "X-Filename": "thumb.png" } });
	const a = await call("POST", "/api/v1/admin/assets", { token, body: { upload_id: up.data.id, thumbnail_upload_id: thumb.data.id, ...body } });
	if (a.status !== 201) throw new Error(`create failed: ${JSON.stringify(a.data)}`);
	if (!publish) return a.data;
	const p = await call("POST", `/api/v1/admin/assets/${a.data.id}/publish`, { token });
	if (p.status !== 200) throw new Error(`publish failed: ${JSON.stringify(p.data)}`);
	return p.data;
}
