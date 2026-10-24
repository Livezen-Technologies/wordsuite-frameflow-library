// Shared asset model and validation for the FrameFlow Asset Library
// (blueprint §2–§4). No I/O and no dependencies, so the API, the workers,
// the admin web and the desktop module all apply the same rules.

/** The 12 asset types (§2). `pack` is the FrameFlow download-center pack type it installs as. */
export const ASSET_TYPES = {
	graphic: { name: "Graphic Elements & Overlays", ext: ["png", "svg", "webp", "psd", "mov", "webm"], maxBytes: 200 * 1024 ** 2, dir: "graphics", pack: "graphics", target: "Canvas / overlay track" },
	sfx: { name: "Sound Effects & Audio", ext: ["wav", "flac", "mp3", "aac", "ogg"], maxBytes: 100 * 1024 ** 2, dir: "audio", pack: "sounds", target: "Audio track" },
	text_template: { name: "Text Templates & Animations", ext: ["fftext", "json"], maxBytes: 500 * 1024 ** 2, dir: "text", pack: "text-templates", target: "Text track / title editor" },
	video_template: { name: "Video Templates", ext: ["fftemplate"], maxBytes: 2 * 1024 ** 3, dir: "templates", pack: "video-templates", target: "New project / insert sequence" },
	motion: { name: "Motion Graphics & Animated Elements", ext: ["ffmotion", "mov", "webm", "json"], maxBytes: 500 * 1024 ** 2, dir: "motion", pack: "motion", target: "Overlay track" },
	transition: { name: "Video Effects & Transitions", ext: ["ffx"], maxBytes: 500 * 1024 ** 2, dir: "effects", pack: "transitions", target: "Clip / between-clip" },
	lut: { name: "LUTs & Color Presets", ext: ["cube", "3dl", "ffcolor"], maxBytes: 10 * 1024 ** 2, dir: "luts", pack: "luts", target: "Clip color panel" },
	font: { name: "Fonts & Font Packs", ext: ["ttf", "otf", "woff2"], maxBytes: 50 * 1024 ** 2, dir: "fonts", pack: "fonts", target: "Text engine" },
	filter: { name: "Video & Image Filters", ext: ["ffx"], maxBytes: 500 * 1024 ** 2, dir: "filters", pack: "filters", target: "Clip effects panel" },
	brand_kit: { name: "Brand Kits", ext: ["ffbrand", "json"], maxBytes: 200 * 1024 ** 2, dir: "brandkits", pack: "brand-kits", target: "Brand panel / project defaults" },
	gif_sticker: { name: "GIFs & Animated Stickers", ext: ["gif", "apng", "png", "webp"], maxBytes: 30 * 1024 ** 2, dir: "stickers", pack: "stickers", target: "Canvas / overlay track" },
	lottie: { name: "Lottie Animations", ext: ["json", "lottie"], maxBytes: 5 * 1024 ** 2, dir: "lottie", pack: "motion", target: "Canvas / overlay track" },
};
export const TYPE_KEYS = Object.keys(ASSET_TYPES);

export const STATUSES = ["draft", "processing", "ready_for_review", "approved", "published", "deprecated", "archived", "failed"];
export const VISIBILITIES = ["draft", "private", "internal", "public", "unlisted"];
export const TIERS = ["free", "pro", "business", "enterprise"];
export const LICENCE_TERMS = ["royalty_free", "editorial_only", "personal_only", "custom"];
export const ASPECTS = ["16:9", "9:16", "1:1", "4:5", "any"];
export const PLATFORMS = ["windows", "macos", "linux"];

export const SLUG = /^[a-z0-9-]{3,80}$/;
export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Allowed status moves (§3.1 lifecycle). */
export const TRANSITIONS = {
	draft: ["processing", "ready_for_review", "archived"],
	processing: ["draft", "failed"],
	failed: ["processing", "draft", "archived"],
	ready_for_review: ["approved", "draft"],
	approved: ["published", "draft"],
	published: ["deprecated", "archived", "draft"],
	deprecated: ["published", "archived"],
	archived: ["draft"],
};

/** Permissions by role (§6). "own" means only assets the actor created. */
export const ROLES = {
	super_admin: ["asset.create", "asset.edit.all", "asset.review", "asset.publish", "asset.publish.direct", "asset.delete", "asset.archive", "version.rollback", "taxonomy.manage", "access.manage", "analytics.view", "settings.manage"],
	library_manager: ["asset.create", "asset.edit.all", "asset.review", "asset.publish", "asset.archive", "version.rollback", "taxonomy.manage", "access.manage", "analytics.view"],
	content_editor: ["asset.create", "asset.edit.own", "analytics.view.own"],
	reviewer: ["asset.review", "analytics.view"],
	analyst: ["analytics.view"],
	/** Processing workers (apps/workers): claim jobs, read originals, store previews. */
	worker: ["jobs.process"],
};

export function can(role, permission) {
	return (ROLES[role] ?? []).includes(permission);
}

// ---------- semver ----------

export function compareSemver(a, b) {
	const parse = (v) => {
		const [core, pre] = String(v).replace(/^v/, "").split("-", 2);
		return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null };
	};
	const x = parse(a);
	const y = parse(b);
	for (let i = 0; i < 3; i++) if ((x.nums[i] ?? 0) !== (y.nums[i] ?? 0)) return (x.nums[i] ?? 0) > (y.nums[i] ?? 0) ? 1 : -1;
	if (x.pre === y.pre) return 0;
	if (x.pre === null) return 1;
	if (y.pre === null) return -1;
	return x.pre > y.pre ? 1 : -1;
}

export function bumpSemver(v, part = "minor") {
	const [maj, min, pat] = String(v).split("-")[0].split(".").map(Number);
	if (part === "major") return `${maj + 1}.0.0`;
	if (part === "patch") return `${maj}.${min}.${pat + 1}`;
	return `${maj}.${min + 1}.0`;
}

// ---------- errors (§4.4) ----------

export class ValidationError extends Error {
	constructor(message, details = [], code = "VALIDATION_FAILED") {
		super(message);
		this.code = code;
		this.details = details;
		this.status = 422;
	}
}

// ---------- metadata (§3.1) ----------

const str = (v) => (typeof v === "string" ? v.trim() : "");

export function slugify(title) {
	return str(title)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);
}

export function normalizeTags(tags) {
	const list = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",") : [];
	return [...new Set(list.map((t) => str(String(t)).toLowerCase()).filter(Boolean))];
}

/**
 * Field problems for asset metadata, as `{ field, rule, value }`. `partial`
 * checks only the fields present (for PATCH).
 */
export function metadataProblems(meta, { partial = false } = {}) {
	const out = [];
	const has = (k) => !partial || Object.hasOwn(meta, k);
	const bad = (field, rule, value) => out.push({ field, rule, value });
	if (has("type") && !TYPE_KEYS.includes(meta.type)) bad("type", "type.enum", meta.type);
	if (has("slug") && !SLUG.test(meta.slug ?? "")) bad("slug", "slug.pattern", meta.slug);
	if (has("title")) {
		const t = str(meta.title);
		if (t.length < 3 || t.length > 120) bad("title", "title.length", t.length);
	}
	if (has("description") && str(meta.description).length > 2000) bad("description", "description.max", str(meta.description).length);
	if (has("tags")) {
		const tags = normalizeTags(meta.tags);
		if (tags.length > 20) bad("tags", "tags.max", tags.length);
		for (const t of tags) if (t.length < 2 || t.length > 32) bad("tags", "tag.length", t);
	}
	if (has("keywords") && normalizeTags(meta.keywords).length > 30) bad("keywords", "keywords.max", normalizeTags(meta.keywords).length);
	if (has("aspect_ratios")) for (const a of meta.aspect_ratios ?? []) if (!ASPECTS.includes(a)) bad("aspect_ratios", "aspect.enum", a);
	if (has("platforms")) for (const p of meta.platforms ?? []) if (!PLATFORMS.includes(p)) bad("platforms", "platform.enum", p);
	if (has("min_app_version") && !SEMVER.test(meta.min_app_version ?? "")) bad("min_app_version", "semver", meta.min_app_version);
	if (has("licence_tier") && !TIERS.includes(meta.licence_tier)) bad("licence_tier", "tier.enum", meta.licence_tier);
	if (has("licence_terms") && !LICENCE_TERMS.includes(meta.licence_terms)) bad("licence_terms", "terms.enum", meta.licence_terms);
	if (has("visibility") && !VISIBILITIES.includes(meta.visibility)) bad("visibility", "visibility.enum", meta.visibility);
	if (has("attribution_required") && meta.attribution_required && !str(meta.attribution_text)) bad("attribution_text", "attribution.required", null);
	return out;
}

// ---------- upload gate (§4.1) ----------

const MAGIC = [
	["png", (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47],
	["gif", (b) => b.length > 6 && b.toString("ascii", 0, 4) === "GIF8"],
	["webp", (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"],
	["wav", (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE"],
	["flac", (b) => b.toString("ascii", 0, 4) === "fLaC"],
	["ogg", (b) => b.toString("ascii", 0, 4) === "OggS"],
	["mp3", (b) => b.toString("ascii", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)],
	["aac", (b) => b[0] === 0xff && (b[1] & 0xf6) === 0xf0],
	["ttf", (b) => b.length > 4 && (b.readUInt32BE(0) === 0x00010000 || b.toString("ascii", 0, 4) === "true")],
	["otf", (b) => b.toString("ascii", 0, 4) === "OTTO"],
	["woff2", (b) => b.toString("ascii", 0, 4) === "wOF2"],
	["psd", (b) => b.toString("ascii", 0, 4) === "8BPS"],
	["webm", (b) => b.length > 4 && b.readUInt32BE(0) === 0x1a45dfa3],
	["mov", (b) => b.length > 12 && ["ftyp", "moov", "wide", "mdat"].includes(b.toString("ascii", 4, 8))],
	["zip", (b) => b.length > 4 && b.readUInt32LE(0) === 0x04034b50],
];

/** The container format sniffed from the first bytes, or "text" / "unknown". */
export function sniff(buf) {
	for (const [kind, test] of MAGIC) if (test(buf)) return kind;
	const head = buf.subarray(0, 512).toString("utf8").trimStart();
	if (head.startsWith("<")) return "svg-or-xml";
	if (head.startsWith("{") || head.startsWith("[")) return "json";
	if (/^[\x09\x0a\x0d\x20-\x7e]*$/.test(buf.subarray(0, 512).toString("latin1"))) return "text";
	return "unknown";
}

/** What a file extension's content must sniff as. */
const EXPECT = {
	png: ["png"], apng: ["png"], gif: ["gif"], webp: ["webp"], svg: ["svg-or-xml"], psd: ["psd"], mov: ["mov"], webm: ["webm"],
	wav: ["wav"], flac: ["flac"], mp3: ["mp3"], aac: ["aac", "mov"], ogg: ["ogg"],
	ttf: ["ttf"], otf: ["otf"], woff2: ["woff2"],
	cube: ["text"], "3dl": ["text"], ffcolor: ["json"],
	json: ["json"], lottie: ["zip"],
	fftext: ["zip", "json"], fftemplate: ["zip", "json"], ffmotion: ["zip"], ffx: ["zip", "json"], ffbrand: ["zip", "json"],
};

export const extOf = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");

/** Picks a type for a file from its extension and content (§11 A3 auto type detection). */
export function detectType(filename, buf) {
	const ext = extOf(filename);
	if (ext === "json") {
		try {
			const j = JSON.parse(buf.toString("utf8"));
			if (j && typeof j === "object" && "v" in j && "layers" in j) return "lottie";
			if (j?.schema === "frameflow.brand/1" || Array.isArray(j?.colors)) return "brand_kit";
			if (j?.schema === "frameflow.text/1" || Array.isArray(j?.placeholders) || typeof j?.params?.content === "string") return "text_template";
			if (Array.isArray(j?.layers) && j?.aspect) return "video_template";
		} catch {
			return null;
		}
		return null;
	}
	if (ext === "gif" || ext === "apng") return "gif_sticker";
	if (ext === "ffx") return null; // transition or filter: the admin picks
	const hits = TYPE_KEYS.filter((t) => ASSET_TYPES[t].ext.includes(ext));
	return hits[0] ?? null;
}

/** Synchronous upload checks (§4.1). Returns check results `{ check, passed, detail }`. */
export function uploadChecks({ filename, type, buf }) {
	const results = [];
	const add = (check, passed, detail = null) => results.push({ check, passed, detail });
	const ext = extOf(filename);
	const def = ASSET_TYPES[type];
	if (!def) {
		add("type", false, { rule: "type.enum", value: type });
		return results;
	}
	add("extension", def.ext.includes(ext), { rule: "extension.allowed", value: ext, allowed: def.ext });
	const kind = sniff(buf);
	add("magic_bytes", (EXPECT[ext] ?? []).includes(kind), { rule: "magic.match", value: kind, expected: EXPECT[ext] ?? [] });
	add("size", buf.length <= def.maxBytes && buf.length > 0, { rule: "size.max", value: buf.length, max: def.maxBytes });
	return results;
}

// ---------- type validation (§4.2) ----------

/** Parses a .cube LUT; throws ValidationError on the first problem. */
export function parseCube(text) {
	let size = null;
	let count = 0;
	let min = [0, 0, 0];
	let max = [1, 1, 1];
	let title = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const [key, ...rest] = line.split(/\s+/);
		if (key === "TITLE") title = rest.join(" ").replace(/^"|"$/g, "");
		else if (key === "LUT_3D_SIZE") size = Number(rest[0]);
		else if (key === "LUT_1D_SIZE") throw new ValidationError("1D LUTs aren't supported; use a 3D .cube.", [{ field: "file", rule: "lut.dimension", value: "1D" }]);
		else if (key === "DOMAIN_MIN") min = rest.map(Number);
		else if (key === "DOMAIN_MAX") max = rest.map(Number);
		else if (/^[-+\d.eE]/.test(key)) {
			const v = [key, ...rest].map(Number);
			if (v.length !== 3 || v.some((n) => Number.isNaN(n))) throw new ValidationError(`LUT has a bad value row: "${line}".`, [{ field: "file", rule: "lut.nan", value: line }]);
			for (let i = 0; i < 3; i++) if (v[i] < min[i] - 1e-6 || v[i] > max[i] + 1e-6) throw new ValidationError("LUT values must be within the declared domain (0–1 by default).", [{ field: "file", rule: "lut.range", value: v[i] }]);
			count++;
		}
	}
	if (![17, 33, 65].includes(size)) throw new ValidationError("LUT size must be 17, 33 or 65.", [{ field: "file", rule: "lut.size", value: size }]);
	if (count !== size ** 3) throw new ValidationError(`LUT has ${count} rows; a ${size}³ LUT needs ${size ** 3}.`, [{ field: "file", rule: "lut.rows", value: count }]);
	return { lut_size: size, title };
}

/** SVG problems: scripts, event handlers, external refs, foreignObject (§4.2 graphic). */
export function svgProblems(text) {
	const p = [];
	if (/<script[\s/>]/i.test(text)) p.push({ field: "file", rule: "svg.script", value: "<script>" });
	if (/<foreignObject[\s/>]/i.test(text)) p.push({ field: "file", rule: "svg.foreignObject", value: "<foreignObject>" });
	if (/\son[a-z]+\s*=/i.test(text)) p.push({ field: "file", rule: "svg.event_handler", value: text.match(/\son[a-z]+\s*=/i)[0].trim() });
	const href = text.match(/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/)([^"']+)/i);
	if (href) p.push({ field: "file", rule: "svg.external_ref", value: href[1] });
	if (/javascript:/i.test(text)) p.push({ field: "file", rule: "svg.javascript_url", value: "javascript:" });
	return p;
}

/** Lottie (Bodymovin) checks: no expressions, embedded images only, ≤ 600 frames. */
export function lottieInfo(json) {
	if (!json || typeof json !== "object" || !("v" in json) || !Array.isArray(json.layers)) throw new ValidationError("Not a Lottie (Bodymovin) file.", [{ field: "file", rule: "lottie.schema", value: null }]);
	const frames = Math.round((json.op ?? 0) - (json.ip ?? 0));
	if (!(frames > 0)) throw new ValidationError("Lottie has no frames (op must be greater than ip).", [{ field: "file", rule: "lottie.frames", value: frames }]);
	if (frames > 600) throw new ValidationError("Lottie animations can have at most 600 frames.", [{ field: "file", rule: "lottie.frames", value: frames }]);
	const text = JSON.stringify(json);
	if (/"x"\s*:\s*"/.test(text)) throw new ValidationError("Lottie expressions aren't allowed.", [{ field: "file", rule: "lottie.expressions", value: true }]);
	for (const a of json.assets ?? []) {
		if (a.p && !(a.e === 1 || String(a.p).startsWith("data:"))) throw new ValidationError("Lottie images must be embedded (base64), not external files.", [{ field: "file", rule: "lottie.external_image", value: a.p }]);
	}
	return {
		lottie_version: String(json.v),
		frame_rate: json.fr,
		in_point: json.ip ?? 0,
		out_point: json.op,
		duration_ms: Math.round((frames / (json.fr || 30)) * 1000),
		resolution: { w: json.w, h: json.h },
		uses_expressions: false,
		uses_images: (json.assets ?? []).some((a) => a.p),
		text_layers: json.layers.filter((l) => l.ty === 5).map((l) => l.nm ?? ""),
	};
}

/** Reads width/height from PNG, GIF and WebP headers. */
export function imageSize(buf) {
	const kind = sniff(buf);
	if (kind === "png") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
	if (kind === "gif") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
	if (kind === "webp") {
		const chunk = buf.toString("ascii", 12, 16);
		if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
		if (chunk === "VP8L") {
			const b = buf.readUInt32LE(21);
			return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
		}
		if (chunk === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
	}
	return null;
}

/** Counts GIF frames (image descriptors) and reads the loop flag. */
export function gifInfo(buf) {
	let frames = 0;
	let loop = false;
	let p = 13;
	const flags = buf[10];
	if (flags & 0x80) p += 3 * 2 ** ((flags & 7) + 1);
	const skipBlocks = () => {
		while (p < buf.length && buf[p] !== 0) p += buf[p] + 1;
		p++;
	};
	while (p < buf.length) {
		const b = buf[p];
		if (b === 0x3b) break;
		if (b === 0x21) {
			if (buf[p + 1] === 0xff && buf.toString("ascii", p + 3, p + 14) === "NETSCAPE2.0") loop = true;
			p += 2;
			skipBlocks();
		} else if (b === 0x2c) {
			frames++;
			const lf = buf[p + 9];
			p += 10;
			if (lf & 0x80) p += 3 * 2 ** ((lf & 7) + 1);
			p++; // LZW min code size
			skipBlocks();
		} else break;
	}
	return { frame_count: frames, loop };
}

/** WAV header: sample rate, bit depth, channels, duration. */
export function wavInfo(buf) {
	let p = 12;
	let fmt = null;
	while (p + 8 <= buf.length) {
		const id = buf.toString("ascii", p, p + 4);
		const size = buf.readUInt32LE(p + 4);
		if (id === "fmt ") fmt = { channels: buf.readUInt16LE(p + 10), sample_rate: buf.readUInt32LE(p + 12), byteRate: buf.readUInt32LE(p + 16), bit_depth: buf.readUInt16LE(p + 22) };
		if (id === "data" && fmt) return { channels: fmt.channels, sample_rate: fmt.sample_rate, bit_depth: fmt.bit_depth, duration_ms: Math.round((size / fmt.byteRate) * 1000) };
		p += 8 + size + (size & 1);
	}
	throw new ValidationError("WAV file has no fmt/data chunk.", [{ field: "file", rule: "sfx.decode", value: null }]);
}

/** Family name from a TTF/OTF `name` table (nameID 1), when present. */
export function fontFamily(buf) {
	try {
		const n = buf.readUInt16BE(4);
		for (let i = 0; i < n; i++) {
			const rec = 12 + i * 16;
			if (buf.toString("ascii", rec, rec + 4) !== "name") continue;
			const off = buf.readUInt32BE(rec + 8);
			const count = buf.readUInt16BE(off + 2);
			const strings = off + buf.readUInt16BE(off + 4);
			for (let j = 0; j < count; j++) {
				const r = off + 6 + j * 12;
				const platform = buf.readUInt16BE(r);
				const nameId = buf.readUInt16BE(r + 6);
				if (nameId !== 1) continue;
				const len = buf.readUInt16BE(r + 8);
				const start = strings + buf.readUInt16BE(r + 10);
				const raw = buf.subarray(start, start + len);
				if (platform === 3 || platform === 0) return Buffer.from(raw).swap16().toString("utf16le");
				return raw.toString("latin1");
			}
		}
	} catch {
		/* fall through */
	}
	return null;
}

/**
 * Type validation (§4.2) for one main file. Returns `{ meta, checks }` with
 * type-specific metadata detected from the file. Throws ValidationError
 * for a failed blocking check.
 */
export function validateFile({ type, filename, buf }) {
	const ext = extOf(filename);
	const checks = [];
	const pass = (check, detail = null) => checks.push({ check, passed: true, detail });
	const meta = {};
	if (type === "lut") {
		if (ext !== "cube") throw new ValidationError("Only .cube LUTs are processed in v1.", [{ field: "file", rule: "lut.format", value: ext }]);
		Object.assign(meta, parseCube(buf.toString("utf8")));
		pass("lut.size", { value: meta.lut_size });
		pass("lut.range");
	} else if (type === "lottie") {
		if (ext !== "json") throw new ValidationError("Upload Lottie as Bodymovin .json in v1.", [{ field: "file", rule: "lottie.format", value: ext }]);
		let json;
		try {
			json = JSON.parse(buf.toString("utf8"));
		} catch {
			throw new ValidationError("Lottie file isn't valid JSON.", [{ field: "file", rule: "lottie.json", value: null }]);
		}
		Object.assign(meta, lottieInfo(json));
		pass("lottie.schema");
		pass("lottie.expressions");
		pass("lottie.frames", { value: meta.out_point - meta.in_point });
	} else if (type === "graphic" || type === "gif_sticker") {
		if (ext === "svg") {
			const problems = svgProblems(buf.toString("utf8"));
			if (problems.length) throw new ValidationError("SVG contains unsafe content.", problems);
			meta.vector = true;
			pass("svg.sanitized");
		} else {
			const size = imageSize(buf);
			if (size) {
				meta.resolution = size;
				if (type === "graphic" && Math.min(size.w, size.h) < 512) throw new ValidationError("Graphics must be at least 512 px on the shortest side.", [{ field: "file", rule: "graphic.min_size", value: Math.min(size.w, size.h) }]);
				if (type === "gif_sticker" && Math.max(size.w, size.h) > 1080) throw new ValidationError("Stickers can be at most 1080 px.", [{ field: "file", rule: "gif.max_size", value: Math.max(size.w, size.h) }]);
				pass("image.decodable", size);
			}
			if (ext === "gif") {
				Object.assign(meta, gifInfo(buf));
				if (meta.frame_count > 1000) throw new ValidationError("GIFs can have at most 1,000 frames.", [{ field: "file", rule: "gif.frames", value: meta.frame_count }]);
				pass("gif.frames", { value: meta.frame_count });
			}
		}
		meta.has_alpha = ["png", "webp", "gif", "svg", "mov", "webm"].includes(ext);
	} else if (type === "sfx") {
		if (ext === "wav") {
			Object.assign(meta, wavInfo(buf));
			if (![44100, 48000].includes(meta.sample_rate)) throw new ValidationError("Audio must be 44.1 or 48 kHz.", [{ field: "file", rule: "sfx.sample_rate", value: meta.sample_rate }]);
			if (meta.duration_ms > 10 * 60 * 1000) throw new ValidationError("Audio can be at most 10 minutes.", [{ field: "file", rule: "sfx.duration", value: meta.duration_ms }]);
			pass("sfx.decode", { sample_rate: meta.sample_rate });
		}
	} else if (type === "font") {
		const family = ext === "woff2" ? null : fontFamily(buf);
		if (family) meta.family = family;
		pass("font.parse", { family });
	} else if (type === "brand_kit" && ext === "json") {
		const j = JSON.parse(buf.toString("utf8"));
		const colors = Array.isArray(j.colors) ? j.colors : [];
		for (const c of colors) if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c.hex ?? "")) throw new ValidationError("Brand kit colours must be hex.", [{ field: "colors", rule: "brand.hex", value: c.hex }]);
		meta.colors = colors;
		pass("brand.colors", { count: colors.length });
	} else if (["text_template", "video_template", "transition", "filter"].includes(type)) {
		// FrameFlow applies these as JSON presets over its built-in renderers
		// (see worksuite-frameflow apps/web/src/asset-library/pack-items.ts).
		let j;
		try {
			j = JSON.parse(buf.toString("utf8"));
		} catch {
			throw new ValidationError(`Upload ${type.replace("_", " ")}s as a JSON preset in v1.`, [{ field: "file", rule: "preset.json", value: ext }]);
		}
		const bad = (rule, message) => {
			throw new ValidationError(message, [{ field: "file", rule, value: null }]);
		};
		if (type === "text_template") {
			if (typeof j?.params?.content !== "string") bad("text.params", "Text templates need params with a content string.");
			meta.placeholders = Array.isArray(j.placeholders) ? j.placeholders : [];
			meta.font_refs = Array.isArray(j.font_refs) ? j.font_refs : [];
		} else if (type === "video_template") {
			if (!Array.isArray(j?.layers) || !j.layers.length || typeof j?.aspect?.width !== "number" || typeof j?.aspect?.height !== "number") bad("template.layers", "Video templates need aspect (width, height) and layers.");
			meta.scenes = j.layers.filter((l) => l.kind === "media").length;
			meta.total_duration_ms = Math.round(Math.max(...j.layers.map((l) => (l.start ?? 0) + (l.duration ?? 0))) * 1000);
		} else if (type === "transition") {
			const v = j?.value ?? j;
			if (!TRANSITION_ENGINES.includes(v?.type)) bad("transition.type", `Transition type must be one of FrameFlow's: ${TRANSITION_ENGINES.join(", ")}.`);
			meta.render_engine = v.type;
			meta.default_duration_ms = Math.round((v.duration ?? 0.8) * 1000);
		} else {
			/* A filter is either a colour grade or one of FrameFlow's own clip
			   effects — blur, glow, VHS and the rest are filters too, and they
			   have no grade to carry. */
			const hasGrade = j?.grade && typeof j.grade === "object" && Object.keys(j.grade).length > 0;
			const hasEffect = j?.effect && typeof j.effect === "object" && FILTER_EFFECTS.includes(j.effect.type);
			if (!hasGrade && !hasEffect) bad("filter.grade", `Filters need a grade object (colour-grade params) or an effect whose type is one of FrameFlow's: ${FILTER_EFFECTS.join(", ")}.`);
			if (hasEffect) meta.render_engine = j.effect.type;
		}
		pass("preset.schema");
	}
	return { meta, checks };
}

/** Transition renderers FrameFlow ships (worksuite-frameflow apps/web/src/transitions/types.ts). */
/** Clip effects FrameFlow ships (worksuite-frameflow apps/web/src/effects/definitions). */
export const FILTER_EFFECTS = ["blur", "color-grade", "curves", "lut", "sharpen", "vignette", "posterize", "invert", "edge-detect", "pixelate", "mirror", "wave", "glow", "film-grain", "vhs", "rgb-split", "sepia"];

export const TRANSITION_ENGINES = ["cross-dissolve", "dip-to-black", "blur-dissolve", "slide", "push", "wipe", "split", "circle", "iris-diamond", "zoom-in", "zoom-out", "spin", "whip-pan"];

// ---------- publish gate (§4.3) ----------

/** Problems that block publishing `asset` (empty when it can go out). */
export function publishProblems(asset, { direct = false, dependencies = [] } = {}) {
	const p = [];
	const bad = (rule, message) => p.push({ field: rule.split(".")[0], rule, message });
	if (asset.status !== "approved" && !(direct && ["draft", "ready_for_review", "approved", "deprecated"].includes(asset.status))) bad("status.approved", "The asset must be approved first.");
	if (!asset.thumbnail_file) bad("thumbnail.required", "A thumbnail is required.");
	if (!asset.category_id) bad("category.required", "A category is required.");
	if (!SEMVER.test(asset.min_app_version ?? "")) bad("min_app_version.required", "Minimum FrameFlow version is required.");
	if (!TIERS.includes(asset.licence_tier) || !LICENCE_TERMS.includes(asset.licence_terms)) bad("licence.complete", "Licence tier and terms are required.");
	if (asset.licence_terms === "custom" && !str(asset.licence_text)) bad("licence.custom_text", "Custom licence terms need text.");
	if (asset.attribution_required && !str(asset.attribution_text)) bad("attribution.text", "Attribution text is required.");
	const version = asset.versions?.find((v) => v.version === asset.current_version) ?? asset.versions?.at(-1);
	if (!version) bad("version.required", "Upload a file first.");
	else if (version.checks?.some((c) => !c.passed)) bad("checks.passed", "A validation check failed.");
	for (const d of dependencies) if (d.status !== "published") bad("dependencies.published", `Dependency ${d.slug ?? d.id} isn't published.`);
	if (!["public", "unlisted"].includes(asset.visibility) && !(asset.audience_rules ?? []).some((r) => r.effect === "allow")) bad("audience.rule", "Non-public assets need at least one allow audience rule.");
	return p;
}

// ---------- FrameFlow mapping ----------

/** Splits search terms into the en/si/ta buckets FrameFlow's catalog uses. */
export function tagsByScript(terms) {
	const out = { en: [], si: [], ta: [] };
	for (const t of terms) {
		if (/[඀-෿]/.test(t)) out.si.push(t);
		else if (/[஀-௿]/.test(t)) out.ta.push(t);
		else out.en.push(t);
	}
	return out;
}

/** FrameFlow's pack plan for a licence tier (the app knows free and pro). */
export const planOf = (tier) => (tier === "free" ? "free" : "pro");
