// Processing workers end to end: the API queues a job per new version, the
// worker (apps/workers) claims it, renders previews with FFmpeg / Chromium
// and reports checks. Needs ffmpeg, ffprobe, fc-scan and Chromium.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createServer, parseTokens } from "../apps/api/src/server.js";
import { createApiClient } from "../apps/workers/src/client.js";
import { closeBrowser } from "../apps/workers/src/lottie.js";
import { gradeFilter, xfadeFor } from "../apps/workers/src/processors.js";
import { processJob } from "../apps/workers/src/worker.js";
import { startTarget } from "./harness.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fflib-work-"));
const hasTools = (() => {
	try {
		execFileSync("ffmpeg", ["-version"]);
		execFileSync("fc-scan", ["--version"]);
		return true;
	} catch {
		return false;
	}
})();
const ff = (...args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

function fixtures(dir) {
	const f = (name) => path.join(dir, name);
	ff("-f", "lavfi", "-i", "sine=frequency=440:duration=3:sample_rate=48000", "-af", "volume=0.5", "-c:a", "pcm_s16le", f("tone.wav"));
	ff("-f", "lavfi", "-i", "testsrc2=s=1024x576:d=1", "-frames:v", "1", f("overlay.png"));
	ff("-f", "lavfi", "-i", "testsrc2=s=320x240:r=10:d=1.5", "-vf", "split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0", f("sticker.gif"));
	const rows = [];
	for (let b = 0; b < 17; b++) for (let g = 0; g < 17; g++) for (let r = 0; r < 17; r++) rows.push(`${Math.min(1, (r / 16) * 1.1).toFixed(4)} ${(g / 16).toFixed(4)} ${((b / 16) * 0.9).toFixed(4)}`);
	fs.writeFileSync(f("warm.cube"), `LUT_3D_SIZE 17\n${rows.join("\n")}\n`);
	const fontFile = execFileSync("fc-match", ["-f", "%{file}", "sans-serif"]).toString().trim();
	fs.copyFileSync(fontFile, f(`sans${path.extname(fontFile)}`));
	fs.writeFileSync(f("burst.json"), JSON.stringify({ v: "5.7.4", fr: 30, ip: 0, op: 30, w: 400, h: 400, layers: [{ ty: 4, nm: "dot", ip: 0, op: 30, st: 0, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [200, 200, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 1, k: [{ t: 0, s: [20, 20, 100], i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } }, { t: 29, s: [100, 100, 100] }] } }, shapes: [{ ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [200, 200] } }, { ty: "fl", c: { a: 0, k: [0.39, 0.4, 0.95, 1] }, o: { a: 0, k: 100 } }] }], assets: [] }));
	fs.writeFileSync(f("push.ffx"), JSON.stringify({ name: "Quick Push", value: { type: "push", duration: 0.6, direction: "left" } }));
	fs.writeFileSync(f("teal.ffx"), JSON.stringify({ name: "Teal Pop", grade: { contrast: 15, saturation: 20, temperature: -10 } }));
	fs.writeFileSync(f("title.json"), JSON.stringify({ name: "Bold Title", params: { content: "Hello Kandy", color: "#ffffff", "background.color": "#23349e" } }));
	fs.writeFileSync(f("promo.fftemplate"), JSON.stringify({ name: "Promo 15s", aspect: { width: 1080, height: 1920 }, palette: ["#f59e0b", "#0f1b3d"], layers: [{ kind: "media", slot: 0, start: 0, duration: 5, color: "#000" }, { kind: "media", slot: 1, start: 5, duration: 5, color: "#111" }] }));
	fs.writeFileSync(f("kit.json"), JSON.stringify({ name: "Livezen", colors: [{ hex: "#23349e" }, { hex: "#22d3ee" }, { hex: "#f59e0b" }] }));
	return f;
}

async function start({ requireProcessing = false } = {}) {
	const tokens = "su:super_admin:u1,wk:worker:w1,wk2:worker:w2,ed:content_editor:u2";
	const { server, lib, base } = await startTarget({ tokens, env: { LIBRARY_REQUIRE_PROCESSING: requireProcessing ? "1" : "" }, node: () => createServer({ dataDir: tmp(), tokens: parseTokens(tokens), requireProcessing }) });
	const call = async (method, p, { token = "su", body, raw, headers = {} } = {}) => {
		const res = await fetch(base + p, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
		const text = await res.text();
		let data = text;
		try {
			data = JSON.parse(text);
		} catch {}
		return { status: res.status, data };
	};
	const create = async (file, body = {}) => {
		const up = await call("POST", "/api/v1/admin/uploads", { raw: fs.readFileSync(file), headers: { "X-Filename": path.basename(file) } });
		const a = await call("POST", "/api/v1/admin/assets", { body: { upload_id: up.data.id, title: path.basename(file).replace(/\..*$/, "").replace(/-/g, " ") + " asset", ...body } });
		assert.equal(a.status, 201, JSON.stringify(a.data));
		return a.data;
	};
	return { server, lib, base, call, create };
}

const drain = async (api, log = []) => {
	for (;;) {
		const claim = await api.claim();
		if (!claim) return log;
		await processJob(api, claim, { log: (m) => log.push(m) });
	}
};

test("ffmpeg mappings for transition and filter previews", () => {
	assert.equal(xfadeFor("cross-dissolve"), "fade");
	assert.equal(xfadeFor("push", "up"), "smoothup");
	assert.equal(xfadeFor("unknown"), "fade");
	assert.equal(gradeFilter({ contrast: 20, saturation: -50 }), "eq=contrast=1.200:saturation=0.500");
	assert.equal(gradeFilter({}), "null");
});

test("job contract: only workers claim, leases are exclusive, retries stop after 3 attempts", async (t) => {
	const s = await start();
	t.after(() => s.server.close());
	const dir = tmp();
	const f = fixtures(dir);
	await s.create(f("warm.cube"));
	assert.equal((await s.call("POST", "/api/v1/worker/jobs/claim", { token: "ed" })).status, 403);
	const claim = await s.call("POST", "/api/v1/worker/jobs/claim", { token: "wk" });
	assert.equal(claim.status, 200);
	assert.equal(claim.data.asset.type, "lut");
	assert.equal((await s.call("POST", "/api/v1/worker/jobs/claim", { token: "wk2" })).status, 204);
	const id = claim.data.job.id;
	assert.equal((await s.call("PUT", `/api/v1/worker/jobs/${id}/previews/thumbnail?ext=webp`, { token: "wk2", raw: Buffer.from("x") })).status, 409);
	assert.equal((await s.call("PUT", `/api/v1/worker/jobs/${id}/previews/thumbnail?ext=exe`, { token: "wk", raw: Buffer.from("x") })).status, 422);
	assert.equal((await s.call("GET", `/api/v1/worker/jobs/${id}/files/${"0".repeat(64)}`, { token: "wk" })).status, 404);
	// Two failures requeue, the third fails the job.
	for (let i = 1; i <= 3; i++) {
		const c = i === 1 ? claim : await s.call("POST", "/api/v1/worker/jobs/claim", { token: "wk" });
		const r = await s.call("POST", `/api/v1/worker/jobs/${c.data.job.id}/complete`, { token: "wk", body: { ok: false, error: `boom ${i}` } });
		assert.equal(r.data.status, i < 3 ? "queued" : "failed");
	}
	const jobs = await s.call("GET", "/api/v1/admin/jobs");
	assert.equal(jobs.data.data[0].status, "failed");
	assert.equal(jobs.data.data[0].error, "boom 3");
	// Reprocess queues a fresh job.
	const asset = (await s.call("GET", "/api/v1/admin/assets")).data.data[0];
	assert.equal((await s.call("POST", `/api/v1/admin/assets/${asset.id}/reprocess`, { body: {} })).data.status, "queued");
});

test("workers render previews and checks for every asset type", { skip: !hasTools && "needs ffmpeg and fontconfig", timeout: 240_000 }, async (t) => {
	const s = await start();
	t.after(async () => {
		s.server.close();
		await closeBrowser();
	});
	const f = fixtures(tmp());
	const font = fs.readdirSync(path.dirname(f("x"))).find((n) => n.startsWith("sans."));
	const made = {
		sfx: await s.create(f("tone.wav")),
		graphic: await s.create(f("overlay.png")),
		gif_sticker: await s.create(f("sticker.gif")),
		lut: await s.create(f("warm.cube")),
		font: await s.create(f(font)),
		lottie: await s.create(f("burst.json")),
		transition: await s.create(f("push.ffx"), { type: "transition" }),
		filter: await s.create(f("teal.ffx"), { type: "filter" }),
		text_template: await s.create(f("title.json")),
		video_template: await s.create(f("promo.fftemplate"), { type: "video_template" }),
		brand_kit: await s.create(f("kit.json"), { type: "brand_kit" }),
	};
	const log = await drain(createApiClient({ baseUrl: s.base, token: "wk" }));
	assert.ok(!log.some((l) => l.includes("failed:")), log.join("\n"));

	const expect = {
		sfx: ["audio_preview", "waveform", "thumbnail"],
		graphic: ["thumbnail"],
		gif_sticker: ["thumbnail", "hover"],
		lut: ["before_after_1", "before_after_2", "before_after_3", "thumbnail"],
		font: ["specimen", "thumbnail"],
		lottie: ["poster", "thumbnail", "hover"],
		transition: ["hover", "thumbnail"],
		filter: ["before_after_1", "thumbnail"],
		text_template: ["thumbnail"],
		video_template: ["thumbnail"],
		brand_kit: ["swatches", "thumbnail"],
	};
	for (const [type, kinds] of Object.entries(expect)) {
		const a = (await s.call("GET", `/api/v1/admin/assets/${made[type].id}`)).data;
		const v = a.versions.at(-1);
		assert.equal(v.processing.status, "done", `${type}: ${JSON.stringify(v.processing)}`);
		for (const k of kinds) assert.ok(v.previews?.[k], `${type} has ${k} (got ${Object.keys(v.previews ?? {})})`);
		assert.ok(v.checks.every((c) => c.passed), `${type} checks: ${JSON.stringify(v.checks.filter((c) => !c.passed))}`);
		// Generated thumbnails satisfy the publish gate's thumbnail rule.
		assert.ok(a.thumbnail_file, `${type} thumbnail_file`);
	}

	const sfx = (await s.call("GET", `/api/v1/admin/assets/${made.sfx.id}`)).data.versions[0];
	assert.equal(sfx.meta.sample_rate, 48000);
	assert.ok(sfx.meta.loudness_lufs < -5 && sfx.meta.loudness_lufs > -30, `LUFS ${sfx.meta.loudness_lufs}`);
	const fontV = (await s.call("GET", `/api/v1/admin/assets/${made.font.id}`)).data.versions[0];
	assert.ok(fontV.meta.family, "font family detected");
	assert.equal(fontV.meta.script_coverage.latin, 100);

	// Publish the sticker and fetch its public previews.
	assert.equal((await s.call("POST", `/api/v1/admin/assets/${made.gif_sticker.id}/publish`)).status, 200);
	const pub = (await s.call("GET", `/api/v1/assets/${made.gif_sticker.slug}`)).data;
	assert.match(pub.thumbnail_url, /^\/previews\/.+\/thumbnail\.webp$/);
	const thumb = await fetch(s.base + pub.thumbnail_url);
	assert.equal(thumb.status, 200);
	assert.equal(thumb.headers.get("content-type"), "image/webp");
	const hover = await fetch(s.base + pub.preview.hover, { headers: { Range: "bytes=0-11" } });
	assert.equal(hover.status, 206);
	assert.equal(Buffer.from(await hover.arrayBuffer()).toString("latin1", 4, 8), "ftyp");
	// Drafts' previews aren't public.
	assert.equal((await fetch(`${s.base}/previews/${made.lut.id}/1.0.0/thumbnail.webp`)).status, 404);
	// The generated thumbnail goes into the pack too.
	const cat = (await (await fetch(`${s.base}/feed/stable/catalog.json`)).json()).packs[0];
	assert.ok(cat.thumbnailUrl);
});

test("with processing required, publishing waits for the worker; a failed check blocks it", { skip: !hasTools && "needs ffmpeg", timeout: 120_000 }, async (t) => {
	const s = await start({ requireProcessing: true });
	t.after(() => s.server.close());
	const f = fixtures(tmp());
	const a = await s.create(f("overlay.png"));
	const blocked = await s.call("POST", `/api/v1/admin/assets/${a.id}/publish`);
	assert.equal(blocked.status, 422);
	assert.equal(blocked.data.error.details[0].rule, "processing.done");
	await drain(createApiClient({ baseUrl: s.base, token: "wk" }));
	assert.equal((await s.call("POST", `/api/v1/admin/assets/${a.id}/publish`)).status, 200);

	// A 22.05 kHz sound fails the worker's sample-rate check → asset failed.
	ff("-f", "lavfi", "-i", "sine=frequency=300:duration=1:sample_rate=22050", "-c:a", "libmp3lame", f("low.mp3"));
	const low = await s.create(f("low.mp3"));
	await drain(createApiClient({ baseUrl: s.base, token: "wk" }));
	const after = (await s.call("GET", `/api/v1/admin/assets/${low.id}`)).data;
	assert.equal(after.status, "failed");
	assert.equal(after.versions[0].checks.find((c) => c.check === "sfx.sample_rate").passed, false);
	const res = await s.call("POST", `/api/v1/admin/assets/${low.id}/publish`);
	assert.ok(res.data.error.details.some((d) => d.rule === "checks.passed"));
});
