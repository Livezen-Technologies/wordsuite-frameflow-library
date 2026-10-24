// Packaging (§5 stage 5) in the format the FrameFlow desktop installer
// reads (worksuite-frameflow electron/asset-pack-io.js): deterministic ZIPs
// with pack.json + index.json, sha256, and an Ed25519-signed catalog.json.
import crypto from "node:crypto";
import zlib from "node:zlib";
import { ASSET_TYPES, compareSemver, planOf, tagsByScript } from "../../../packages/asset-schema/index.js";

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

export function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** Safe relative entry name, or null (no absolute paths, `..`, backslashes, NULs). */
export function safeEntryName(name) {
	if (typeof name !== "string" || !name || name.length > 512) return null;
	if (name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return null;
	const parts = name.split("/");
	if (parts.at(-1) === "") parts.pop();
	if (!parts.length || parts.some((p) => p === "" || p === "." || p === "..")) return null;
	return name;
}

/** Deterministic ZIP (fixed 1980-01-01 times) of `{ name, data }` entries. */
export function createZip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const { name, data } of entries) {
		if (!safeEntryName(name)) throw new Error(`Bad zip entry name: ${name}`);
		const nameBuf = Buffer.from(name, "utf8");
		const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
		const deflated = zlib.deflateRawSync(raw, { level: 9 });
		const useDeflate = deflated.length < raw.length;
		const body = useDeflate ? deflated : raw;
		const crc = crc32(raw);
		const h = Buffer.alloc(30);
		h.writeUInt32LE(0x04034b50, 0);
		h.writeUInt16LE(20, 4);
		h.writeUInt16LE(0x0800, 6);
		h.writeUInt16LE(useDeflate ? 8 : 0, 8);
		h.writeUInt16LE(0x21, 12);
		h.writeUInt32LE(crc, 14);
		h.writeUInt32LE(body.length, 18);
		h.writeUInt32LE(raw.length, 22);
		h.writeUInt16LE(nameBuf.length, 26);
		locals.push(h, nameBuf, body);
		const c = Buffer.alloc(46);
		c.writeUInt32LE(0x02014b50, 0);
		c.writeUInt16LE(0x031e, 4);
		c.writeUInt16LE(20, 6);
		c.writeUInt16LE(0x0800, 8);
		c.writeUInt16LE(useDeflate ? 8 : 0, 10);
		c.writeUInt16LE(0x21, 14);
		c.writeUInt32LE(crc, 16);
		c.writeUInt32LE(body.length, 20);
		c.writeUInt32LE(raw.length, 24);
		c.writeUInt16LE(nameBuf.length, 28);
		c.writeUInt32LE((0o100644 << 16) >>> 0, 38);
		c.writeUInt32LE(offset, 42);
		centrals.push(c, nameBuf);
		offset += h.length + nameBuf.length + body.length;
	}
	const size = centrals.reduce((n, b) => n + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(size, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, ...centrals, end]);
}

/**
 * Lists a ZIP's entries for the upload gate (§4.1 path safety, zip-bomb
 * guard). Throws on unsafe names, symlinks, > 10k entries or > 100:1 ratio.
 */
export function inspectZip(buf) {
	let end = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			end = i;
			break;
		}
	}
	if (end < 0) throw Object.assign(new Error("Not a zip file"), { rule: "zip.format" });
	const count = buf.readUInt16LE(end + 10);
	if (count > 10000) throw Object.assign(new Error("Archive has more than 10,000 entries"), { rule: "zip.entries", value: count });
	let p = buf.readUInt32LE(end + 16);
	let total = 0;
	const names = [];
	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) throw Object.assign(new Error("Corrupt zip directory"), { rule: "zip.format" });
		total += buf.readUInt32LE(p + 24);
		const nameLen = buf.readUInt16LE(p + 28);
		const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
		const mode = (buf.readUInt32LE(p + 38) >>> 16) & 0o170000;
		if (!safeEntryName(name)) throw Object.assign(new Error(`Archive contains an unsafe path: ${name}`), { rule: "zip.path", value: name });
		if (mode === 0o120000) throw Object.assign(new Error(`Archive contains a symlink: ${name}`), { rule: "zip.symlink", value: name });
		names.push(name);
		p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
	}
	if (total > buf.length * 100) throw Object.assign(new Error("Archive expands more than 100:1"), { rule: "zip.ratio", value: Math.round(total / buf.length) });
	return names;
}

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export function sign(data, privateKeyPem) {
	return crypto.sign(null, Buffer.from(data), crypto.createPrivateKey(privateKeyPem)).toString("base64");
}

export function verify(data, signature, publicKeyPem) {
	try {
		return crypto.verify(null, Buffer.from(data), crypto.createPublicKey(publicKeyPem), Buffer.from(String(signature).trim(), "base64"));
	} catch {
		return false;
	}
}

export function generateKeyPair() {
	const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
	return { privateKey: privateKey.export({ type: "pkcs8", format: "pem" }), publicKey: publicKey.export({ type: "spki", format: "pem" }) };
}

export const publicKeyOf = (privateKeyPem) => crypto.createPublicKey(crypto.createPrivateKey(privateKeyPem)).export({ type: "spki", format: "pem" });

/** FrameFlow pack id for an asset (its slug; FrameFlow allows up to 64 chars). */
export const packIdOf = (asset) => asset.slug.slice(0, 64).replace(/-+$/, "");

/** The search terms an asset publishes: tags, keywords, category names. */
const termsOf = (asset, category) => [...new Set([...(asset.tags ?? []), ...(asset.keywords ?? []), ...(category ? [category.name.toLowerCase()] : [])])];

/**
 * index.json for the pack, in the shape FrameFlow's registry reads for its
 * pack type (apps/web/src/asset-library/registry.ts).
 */
function indexFor(asset, version, category, files) {
	const pack = ASSET_TYPES[asset.type].pack;
	const main = files.find((f) => f.role === "main");
	const m = { ...(asset.meta ?? {}), ...(version.meta ?? {}) };
	if (pack === "motion") {
		const res = m.resolution ?? { w: 1920, h: 1080 };
		return {
			schema: 1,
			name: asset.title,
			license: asset.licence_terms,
			categories: [{ id: category?.slug ?? "library", name: category?.name ?? "Library", count: 1 }],
			assets: [
				{
					id: asset.slug,
					name: asset.title,
					category: category?.slug ?? "library",
					path: asset.slug,
					tags: termsOf(asset, category),
					durationSec: (m.duration_ms ?? 3000) / 1000,
					loop: !!m.loop,
					width: res.w,
					height: res.h,
					colors: m.editable_colors ?? [],
					files: Object.fromEntries(files.filter((f) => f.path.startsWith(`${asset.slug}/`)).map((f) => [f.path.slice(asset.slug.length + 1), { sha256: sha256(f.data) }])),
				},
			],
		};
	}
	if (pack === "sounds") return { schema: 1, name: asset.title, sounds: [{ id: asset.slug, name: asset.title, file: main.path, sha256: sha256(main.data) }] };
	if (pack === "fonts") return { schema: 1, name: asset.title, fonts: [{ family: m.family ?? asset.title, weight: m.weight ?? 400, style: m.italic ? "italic" : "normal", file: main.path }] };
	return {
		schema: 1,
		name: asset.title,
		items: [{ id: asset.slug, name: asset.title, file: main.path, type: asset.type, thumbnail: files.find((f) => f.role === "thumbnail")?.path ?? null, ...m }],
	};
}

/**
 * Builds the `.ffpkg` for one version: pack.json, index.json, manifest.json
 * (frameflow.asset/1), licence.txt, the payload and its thumbnail.
 * `readFile(sha)` returns an uploaded file's bytes.
 */
export function buildPackage(asset, version, { category, readFile }) {
	const files = version.files.map((f) => {
		const ext = f.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
		const name = f.role === "thumbnail" ? `thumbnail${ext}` : f.role === "main" ? `${asset.slug}${ext}` : f.filename.replace(/[^\w.-]/g, "_");
		return { role: f.role, path: `${asset.slug}/${name}`, data: readFile(f.sha256) };
	});
	if (asset.thumbnail_file && !files.some((f) => f.role === "thumbnail")) {
		const ext = asset.thumbnail_file.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ".png";
		files.push({ role: "thumbnail", path: `${asset.slug}/thumbnail${ext}`, data: readFile(asset.thumbnail_file.sha256) });
	}
	const packType = ASSET_TYPES[asset.type].pack;
	const id = packIdOf(asset);
	const licence = `${asset.title}\nLicence: ${asset.licence_tier} · ${asset.licence_terms}\n${asset.licence_text ?? ""}\n${asset.attribution_required ? `Attribution: ${asset.attribution_text}\n` : ""}${asset.author ? `Author: ${asset.author}\n` : ""}`;
	const packJson = {
		id,
		type: packType,
		version: version.version,
		title: asset.title,
		description: asset.description || asset.title,
		tags: tagsByScript(termsOf(asset, category)),
		languages: ["en"],
		licence: `${asset.licence_terms}${asset.attribution_required ? ` (attribution: ${asset.attribution_text})` : ""}`,
		minAppVersion: version.min_app_version ?? asset.min_app_version,
		plan: planOf(asset.licence_tier),
	};
	const manifest = {
		schema: "frameflow.asset/1",
		id: asset.id,
		slug: asset.slug,
		type: asset.type,
		version: version.version,
		min_app_version: packJson.minAppVersion,
		entry: files.find((f) => f.role === "main")?.path ?? null,
		files: files.map((f) => ({ path: f.path, sha256: sha256(f.data), size: f.data.length })),
		dependencies: asset.dependencies ?? [],
		params: asset.meta?.params ?? [],
		licence: { tier: asset.licence_tier, terms: asset.licence_terms },
	};
	const json = (v) => Buffer.from(`${JSON.stringify(v, null, "\t")}\n`);
	const zip = createZip([
		{ name: "pack.json", data: json(packJson) },
		{ name: "index.json", data: json(indexFor(asset, version, category, files)) },
		{ name: "manifest.json", data: json(manifest) },
		{ name: "licence.txt", data: Buffer.from(licence) },
		...files.map((f) => ({ name: f.path, data: f.data })),
	]);
	const thumb = files.find((f) => f.role === "thumbnail");
	return { zip, sha256: sha256(zip), size: zip.length, packJson, manifest, thumbnail: thumb ?? null };
}

/**
 * catalog.json for a channel (FrameFlow schema 1). `entries` are
 * `{ asset, version, category }` for each published asset.
 */
export function buildCatalog(channel, entries, generatedAt = new Date().toISOString()) {
	const packs = entries
		.filter(({ version }) => version?.package)
		.sort((a, b) => a.asset.slug.localeCompare(b.asset.slug))
		.map(({ asset, version, category }) => {
			const base = `packs/${packIdOf(asset)}-${version.version}`;
			return {
				id: packIdOf(asset),
				type: ASSET_TYPES[asset.type].pack,
				version: version.version,
				title: asset.title,
				description: asset.description || asset.title,
				tags: tagsByScript(termsOf(asset, category)),
				languages: ["en"],
				sizeBytes: version.package.size,
				sha256: version.package.sha256,
				licence: asset.licence_terms,
				minAppVersion: version.min_app_version ?? asset.min_app_version,
				thumbnailUrl: version.package.thumbnail ? `${base}${version.package.thumbnail.ext}` : null,
				previewUrl: version.package.thumbnail ? `${base}${version.package.thumbnail.ext}` : null,
				files: `${base}.zip`,
				plan: planOf(asset.licence_tier),
				assetCount: 1,
				assetIds: [asset.slug],
				libraryAssetId: asset.id,
				libraryType: asset.type,
			};
		});
	return { schema: 1, channel, generatedAt, packs };
}

export { compareSemver };
