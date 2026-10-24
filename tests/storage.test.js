// Blob storage on S3/R2: the backend against s3rver (an S3 API emulator; it
// doesn't verify SigV4, which backend/tests/unit/SigV4Test.php checks against
// the AWS SDK signer's output). PostgreSQL state is covered by running every
// suite with LIBRARY_PHP_DATABASE_URL (see README).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { startPhp, target, tmp } from "./harness.js";

async function startS3() {
	const { default: S3rver } = await import("s3rver");
	const s3 = new S3rver({ port: 0, address: "127.0.0.1", silent: true, directory: tmp("fflib-s3-"), configureBuckets: [{ name: "library" }] });
	const { port } = await s3.run();
	const creds = { endpoint: `http://127.0.0.1:${port}`, bucket: "library", accessKeyId: "S3RVER", secretAccessKey: "S3RVER", region: "us-east-1" };
	return { s3, creds };
}

/** Path-style object URL in the emulator (no auth needed). */
const objectUrl = (creds, key) => `${creds.endpoint}/${creds.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

test("packages go to the S3/R2 bucket and are served with ranges", { skip: target !== "php" && "starts its own backend" }, async (t) => {
	const { s3, creds } = await startS3();
	t.after(() => s3.close());
	const s = await startPhp({ tokens: "su:super_admin:u1", env: { LIBRARY_S3_ENDPOINT: creds.endpoint, LIBRARY_S3_BUCKET: creds.bucket, LIBRARY_S3_ACCESS_KEY_ID: creds.accessKeyId, LIBRARY_S3_SECRET_ACCESS_KEY: creds.secretAccessKey, LIBRARY_S3_REGION: creds.region } });
	t.after(() => s.server.close());
	const as = (p, init = {}) => fetch(s.base + p, { ...init, headers: { Authorization: "Bearer su", ...(init.headers ?? {}) } });
	const rows = [];
	for (let b = 0; b < 17; b++) for (let g = 0; g < 17; g++) for (let r = 0; r < 17; r++) rows.push(`${r / 16} ${g / 16} ${b / 16}`);
	const up = await (await as("/api/v1/admin/uploads", { method: "POST", body: `LUT_3D_SIZE 17\n${rows.join("\n")}\n`, headers: { "X-Filename": "warm.cube" } })).json();
	const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
	const thumb = await (await as("/api/v1/admin/uploads", { method: "POST", body: png, headers: { "X-Filename": "t.png" } })).json();
	const a = await (await as("/api/v1/admin/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload_id: up.id, thumbnail_upload_id: thumb.id, title: "Warm Film" }) })).json();
	assert.equal((await as(`/api/v1/admin/assets/${a.id}/publish`, { method: "POST" })).status, 200);
	const catalog = await (await fetch(`${s.base}/feed/stable/catalog.json`)).json();
	const zip = await fetch(`${s.base}/feed/stable/${catalog.packs[0].files}`, { headers: { Range: "bytes=0-3" } });
	assert.equal(zip.status, 206);
	assert.equal(Buffer.from(await zip.arrayBuffer()).readUInt32LE(0), 0x04034b50);
	const head = await fetch(objectUrl(creds, `packages/${catalog.packs[0].files.split("/").pop()}`), { method: "HEAD" });
	assert.equal(Number(head.headers.get("content-length")), catalog.packs[0].sizeBytes);
	assert.equal((await fetch(objectUrl(creds, `originals/${up.sha256}`), { method: "HEAD" })).status, 200);
	// Nothing is written to the local blob folder.
	assert.equal(fs.existsSync(path.join(s.dataDir, "blobs", "packages")), false);
});
