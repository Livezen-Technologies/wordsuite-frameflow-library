// What each asset type gets from a worker (blueprint §4.2 deep checks and
// §5 stages 3–4):
//   graphic, gif_sticker   thumbnail; animated → hover MP4; SVG rendered in Chromium
//   sfx                    decode + sample rate + duration checks, loudness (LUFS),
//                          clipping, 30 s MP3 preview, waveform peaks + image
//   lut                    before/after on 3 reference stills (ffmpeg lut3d)
//   font                   specimen (Latin, Sinhala, Tamil), glyph coverage check
//   lottie, motion (json)  render first/mid/last frame (check), poster, hover MP4
//   motion (video)         thumbnail + hover MP4
//   transition             A/B demo of the transition on reference clips
//   filter                 before/after of the grade on reference stills
//   text_template          title card in the template's style
//   video_template         storyboard card from its palette and title
//   brand_kit              colour swatch card
// Every type: malware scan via clamd when CLAMAV_HOST is set.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { audioInfo, ffmpeg, fontInfo, hasAlpha, hoverMp4, probe, run, thumbnail, waveformPeaks } from "./media.js";
import { renderFontSpecimen, renderLottieFrames, renderSvg } from "./lottie.js";

const ext = (f) => path.extname(f).slice(1).toLowerCase();

/** Three reference stills (generated, so no stock images ship with the worker). */
async function referenceStills(dir) {
	const sources = [
		"gradients=s=640x360:c0=0xe9b07a:c1=0x2f6f8f:c2=0x7a3b2e:n=3:speed=0.00001:seed=7",
		"mandelbrot=s=640x360:maxiter=200:end_pts=1:outer=normalized_iteration_count",
		"gradients=s=640x360:c0=0x1d3557:c1=0xf1faee:c2=0xe63946:c3=0x457b9d:n=4:speed=0.00001:seed=3",
	];
	const out = [];
	for (const [i, src] of sources.entries()) {
		const file = path.join(dir, `ref-${i + 1}.png`);
		await ffmpeg(["-f", "lavfi", "-i", src, "-frames:v", "1", file]);
		out.push(file);
	}
	return out;
}

/** before | after side by side, 1280×360 WebP. */
async function beforeAfter(before, filter, out) {
	await ffmpeg(["-i", before, "-filter_complex", `[0:v]split[a][b];[b]${filter}[b2];[a][b2]hstack=inputs=2`, "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", out]);
	return out;
}

/** A default font file for cards (fontconfig). */
async function defaultFont() {
	const { stdout } = await run("fc-match", ["-f", "%{file}", "sans-serif:bold"]);
	return stdout.trim();
}

/** Writes `text` to a file for drawtext (avoids escaping user text into the filter graph). */
function textFile(dir, name, text) {
	const f = path.join(dir, `${name}.txt`);
	fs.writeFileSync(f, String(text).slice(0, 200));
	return f;
}

const drawText = (fontfile, textfile, { size = 48, color = "white", x = "(w-text_w)/2", y = "(h-text_h)/2", box = false } = {}) =>
	`drawtext=fontfile='${fontfile.replace(/'/g, "")}':textfile='${textfile.replace(/'/g, "")}':fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}${box ? ":box=1:boxcolor=black@0.45:boxborderw=18" : ""}`;

const hex = (c, fallback) => (/^#[0-9a-f]{6}$/i.test(c ?? "") ? `0x${c.slice(1)}` : fallback);

// ---------- per type ----------

async function visual(ctx, { animatedOk = true } = {}) {
	const e = ext(ctx.main);
	if (e === "svg") {
		const png = path.join(ctx.dir, "svg.png");
		fs.writeFileSync(png, await renderSvg(fs.readFileSync(ctx.main, "utf8")));
		ctx.check("worker.svg_render", true);
		await ctx.put("thumbnail", "webp", await thumbnail(png, path.join(ctx.dir, "thumb.webp"), { alpha: true }));
		return;
	}
	const info = await probe(ctx.main);
	if (!info.video) throw Object.assign(new Error("No picture in this file"), { check: "worker.decode" });
	ctx.check("worker.decode", true, { codec: info.video.codec, w: info.video.w, h: info.video.h });
	const alpha = hasAlpha(info.video.pix_fmt);
	const animated = animatedOk && ((info.duration_ms ?? 0) > 100 || (info.video.frames ?? 1) > 1) && !["png", "jpg", "jpeg", "psd"].includes(e);
	ctx.meta({ resolution: { w: info.video.w, h: info.video.h }, has_alpha: alpha, ...(animated ? { duration_ms: info.duration_ms, fps: info.video.fps } : {}) });
	await ctx.put("thumbnail", "webp", await thumbnail(ctx.main, path.join(ctx.dir, "thumb.webp"), { alpha, at: animated ? (info.duration_ms ?? 0) / 2000 : null }));
	if (animated) await ctx.put("hover", "mp4", await hoverMp4(ctx.main, path.join(ctx.dir, "hover.mp4"), { durationMs: info.duration_ms }));
}

async function sfx(ctx) {
	const info = await probe(ctx.main);
	if (!info.audio) throw Object.assign(new Error("No audio in this file"), { check: "worker.decode" });
	ctx.check("worker.decode", true, { codec: info.audio.codec });
	ctx.check("sfx.sample_rate", [44100, 48000].includes(info.audio.sample_rate), { rule: "sfx.sample_rate", value: info.audio.sample_rate, message: [44100, 48000].includes(info.audio.sample_rate) ? null : "Audio must be 44.1 or 48 kHz." });
	ctx.check("sfx.duration", (info.duration_ms ?? 0) <= 10 * 60 * 1000, { rule: "sfx.duration", value: info.duration_ms });
	const a = await audioInfo(ctx.main);
	const inRange = a.loudness_lufs === null || (a.loudness_lufs >= -23 && a.loudness_lufs <= -9);
	// Loudness and clipping are reported (warnings), not blocking (§4.2).
	ctx.check("sfx.loudness", true, { value: a.loudness_lufs, warning: inRange ? null : "Outside −23…−9 LUFS" });
	ctx.check("sfx.clipping", true, { peak_db: a.peak_db, true_peak_dbfs: a.true_peak_dbfs, warning: (a.peak_db ?? -1) >= 0 ? "Peaks reach 0 dBFS (likely clipped)" : null });
	ctx.meta({ sample_rate: info.audio.sample_rate, channels: info.audio.channels, bit_depth: info.audio.bit_depth, duration_ms: info.duration_ms, loudness_lufs: a.loudness_lufs });
	const mp3 = path.join(ctx.dir, "preview.mp3");
	await ffmpeg(["-i", ctx.main, "-t", "30", "-vn", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", mp3]);
	await ctx.put("audio_preview", "mp3", mp3);
	const peaks = await waveformPeaks(ctx.main);
	await ctx.put("waveform", "json", Buffer.from(JSON.stringify({ peaks, duration_ms: info.duration_ms })));
	const png = path.join(ctx.dir, "wave.png");
	await ffmpeg(["-i", ctx.main, "-filter_complex", "showwavespic=s=640x360:split_channels=0:colors=0x6366f1", "-frames:v", "1", png]);
	await ctx.put("thumbnail", "webp", await thumbnail(png, path.join(ctx.dir, "thumb.webp")));
}

async function lut(ctx) {
	if (ext(ctx.main) !== "cube") return;
	const stills = await referenceStills(ctx.dir);
	const cube = path.join(ctx.dir, "lut.cube");
	fs.copyFileSync(ctx.main, cube);
	for (const [i, still] of stills.entries()) await ctx.put(`before_after_${i + 1}`, "webp", await beforeAfter(still, `lut3d=file='${cube}'`, path.join(ctx.dir, `ba-${i + 1}.webp`)));
	ctx.check("worker.lut_apply", true);
	const after = path.join(ctx.dir, "after.png");
	await ffmpeg(["-i", stills[0], "-vf", `lut3d=file='${cube}'`, "-frames:v", "1", after]);
	await ctx.put("thumbnail", "webp", await thumbnail(after, path.join(ctx.dir, "thumb.webp")));
}

async function font(ctx) {
	if (!["ttf", "otf", "woff2"].includes(ext(ctx.main))) return;
	const info = await fontInfo(ctx.main);
	ctx.meta({ family: info.family, style: info.style, weight: info.weight, italic: info.italic, script_coverage: info.coverage });
	ctx.check("font.parse", !!info.family, { family: info.family });
	const scripts = ctx.asset.meta?.scripts ?? [];
	// Declared scripts need ≥ 95% coverage (§4.2: Sinhala U+0D80–U+0DFF).
	for (const script of ["sinhala", "tamil"]) if (scripts.includes(script)) ctx.check(`font.coverage.${script}`, info.coverage[script] >= 95, { rule: `font.coverage.${script}`, value: info.coverage[script], message: info.coverage[script] >= 95 ? null : `${script} coverage ${info.coverage[script]}% (needs 95%)` });
	const lines = [
		{ text: [info.family ?? ctx.asset.title, info.style].filter(Boolean).join(" · "), size: 30, label: true },
		...(info.coverage.latin > 90 ? [{ text: "The quick brown fox jumps over the lazy dog 0123456789", size: 44 }] : []),
		...(info.coverage.sinhala > 50 ? [{ text: "සිංහල අකුරු — ශ්‍රී ලංකාව, ක්‍රීඩා, ද්‍රව්‍ය", size: 52 }] : []),
		...(info.coverage.tamil > 50 ? [{ text: "தமிழ் எழுத்துகள் — இலங்கை, க்ஷேத்திரம்", size: 48 }] : []),
	];
	const specimen = path.join(ctx.dir, "specimen.png");
	fs.writeFileSync(specimen, await renderFontSpecimen(fs.readFileSync(ctx.main), ext(ctx.main), lines));
	ctx.check("font.render", true);
	await ctx.put("specimen", "png", specimen);
	await ctx.put("thumbnail", "webp", await thumbnail(specimen, path.join(ctx.dir, "thumb.webp")));
}

async function lottie(ctx) {
	const json = JSON.parse(fs.readFileSync(ctx.main, "utf8"));
	const ip = json.ip ?? 0;
	const op = Math.max(ip + 1, json.op ?? ip + 1);
	const last = op - 1;
	const mid = Math.floor((ip + last) / 2);
	const [first, poster, end] = await renderLottieFrames(json, [ip, mid, last]);
	ctx.check("lottie.render", !!(first && poster && end), { frames: [ip, mid, last] });
	const posterFile = path.join(ctx.dir, "poster.png");
	fs.writeFileSync(posterFile, poster);
	await ctx.put("poster", "png", posterFile);
	await ctx.put("thumbnail", "webp", await thumbnail(posterFile, path.join(ctx.dir, "thumb.webp"), { alpha: true }));
	// Hover: up to 6 s sampled at ≤ 15 fps.
	const fr = json.fr || 30;
	const step = Math.max(1, Math.round(fr / 15));
	const frames = [];
	for (let f = ip; f < op && frames.length < 90; f += step) frames.push(f);
	const shots = await renderLottieFrames(json, frames, { maxSide: 480, background: "#0b0d12" });
	const seqDir = path.join(ctx.dir, "seq");
	fs.mkdirSync(seqDir);
	shots.forEach((buf, i) => fs.writeFileSync(path.join(seqDir, `${String(i).padStart(4, "0")}.png`), buf));
	const mp4 = path.join(ctx.dir, "hover.mp4");
	await ffmpeg(["-framerate", String(fr / step), "-i", path.join(seqDir, "%04d.png"), "-an", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-movflags", "+faststart", mp4]);
	await ctx.put("hover", "mp4", mp4);
}

/** FrameFlow transition type → ffmpeg xfade transition (closest look). */
export function xfadeFor(type, direction = "left") {
	const dir = { left: "left", right: "right", up: "up", down: "down" }[direction] ?? "left";
	return (
		{
			"cross-dissolve": "fade",
			"dip-to-black": "fadeblack",
			"blur-dissolve": "hblur",
			slide: `slide${dir}`,
			push: `smooth${dir}`,
			wipe: `wipe${dir}`,
			split: "vertopen",
			circle: "circleopen",
			"iris-diamond": "diagtl",
			"zoom-in": "zoomin",
			"zoom-out": "fadefast",
			spin: "radial",
			"whip-pan": `smooth${dir}`,
		}[type] ?? "fade"
	);
}

async function transition(ctx) {
	const preset = JSON.parse(fs.readFileSync(ctx.main, "utf8"));
	const v = preset.value ?? preset;
	const d = Math.min(1.5, Math.max(0.2, Number(v.duration) || 0.8));
	const mp4 = path.join(ctx.dir, "demo.mp4");
	await ffmpeg([
		"-f", "lavfi", "-i", "gradients=s=854x480:c0=0x23349e:c1=0x22d3ee:speed=0.01:d=3",
		"-f", "lavfi", "-i", "gradients=s=854x480:c0=0xf59e0b:c1=0xec4899:speed=0.01:d=3",
		"-filter_complex", `[0:v][1:v]xfade=transition=${xfadeFor(v.type, v.direction)}:duration=${d}:offset=${(3 - d) / 2},format=yuv420p`,
		"-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-movflags", "+faststart", mp4,
	]);
	ctx.check("worker.transition_render", true, { xfade: xfadeFor(v.type, v.direction), approximate: true });
	await ctx.put("hover", "mp4", mp4);
	await ctx.put("thumbnail", "webp", await thumbnail(mp4, path.join(ctx.dir, "thumb.webp"), { at: 1.5 }));
}

/** A FrameFlow colour grade as an ffmpeg filter chain (approximate, for previews). */
export function gradeFilter(grade = {}) {
	const n = (k) => Number(grade[k]) || 0;
	const parts = [];
	if (n("exposure")) parts.push(`exposure=exposure=${Math.max(-3, Math.min(3, n("exposure")))}`);
	const contrast = 1 + n("contrast") / 100;
	const saturation = 1 + n("saturation") / 100;
	if (contrast !== 1 || saturation !== 1) parts.push(`eq=contrast=${contrast.toFixed(3)}:saturation=${saturation.toFixed(3)}`);
	if (n("temperature")) parts.push(`colortemperature=temperature=${Math.round(6500 - n("temperature") * 35)}`);
	return parts.length ? parts.join(",") : "null";
}

async function filter(ctx) {
	const preset = JSON.parse(fs.readFileSync(ctx.main, "utf8"));
	const chain = gradeFilter(preset.grade);
	const stills = await referenceStills(ctx.dir);
	for (const [i, still] of stills.entries()) await ctx.put(`before_after_${i + 1}`, "webp", await beforeAfter(still, chain, path.join(ctx.dir, `ba-${i + 1}.webp`)));
	ctx.check("worker.filter_render", true, { approximate: true });
	const after = path.join(ctx.dir, "after.png");
	await ffmpeg(["-i", stills[0], "-vf", chain, "-frames:v", "1", after]);
	await ctx.put("thumbnail", "webp", await thumbnail(after, path.join(ctx.dir, "thumb.webp")));
}

async function card(ctx, { colors, title, subtitle = null }) {
	const fontfile = await defaultFont();
	const [c0, c1] = [hex(colors[0], "0x23349e"), hex(colors[1], "0x0f1b3d")];
	const filters = [drawText(fontfile, textFile(ctx.dir, "title", title), { size: 56, box: true }), ...(subtitle ? [drawText(fontfile, textFile(ctx.dir, "sub", subtitle), { size: 26, y: "h-80" })] : [])];
	const png = path.join(ctx.dir, "card.png");
	await ffmpeg(["-f", "lavfi", "-i", `gradients=s=1280x720:c0=${c0}:c1=${c1}:speed=0.00001:seed=1`, "-frames:v", "1", "-vf", filters.join(","), png]);
	await ctx.put("thumbnail", "webp", await thumbnail(png, path.join(ctx.dir, "thumb.webp")));
}

async function textTemplate(ctx) {
	const j = JSON.parse(fs.readFileSync(ctx.main, "utf8"));
	const p = j.params ?? {};
	await card(ctx, { colors: [p["background.color"] ?? p.color, "#0f1b3d"], title: p.content ?? ctx.asset.title, subtitle: p.fontFamily ? `Font: ${p.fontFamily}` : null });
}

async function videoTemplate(ctx) {
	let j;
	try {
		j = JSON.parse(fs.readFileSync(ctx.main, "utf8"));
	} catch {
		return; // zipped .fftemplate packages: no card yet
	}
	const scenes = (j.layers ?? []).filter((l) => l.kind === "media").length;
	await card(ctx, { colors: j.palette ?? [], title: j.name ?? ctx.asset.title, subtitle: `${scenes} scene${scenes === 1 ? "" : "s"} · ${j.aspect?.width ?? "?"}×${j.aspect?.height ?? "?"}` });
}

async function brandKit(ctx) {
	const j = JSON.parse(fs.readFileSync(ctx.main, "utf8"));
	const colors = (j.colors ?? []).map((c) => (typeof c === "string" ? c : c.hex)).filter((c) => /^#[0-9a-f]{6}$/i.test(c ?? "")).slice(0, 8);
	if (!colors.length) return;
	const inputs = colors.flatMap((c) => ["-f", "lavfi", "-i", `color=c=0x${c.slice(1)}:s=${Math.floor(1280 / colors.length)}x720`]);
	const png = path.join(ctx.dir, "swatches.png");
	await ffmpeg([...inputs, "-filter_complex", colors.length > 1 ? `${colors.map((_, i) => `[${i}:v]`).join("")}hstack=inputs=${colors.length}` : "[0:v]null", "-frames:v", "1", png]);
	await ctx.put("swatches", "png", png);
	await ctx.put("thumbnail", "webp", await thumbnail(png, path.join(ctx.dir, "thumb.webp")));
}

export const PROCESSORS = {
	graphic: (ctx) => visual(ctx),
	gif_sticker: (ctx) => visual(ctx),
	sfx,
	lut,
	font,
	lottie,
	motion: (ctx) => (ext(ctx.main) === "json" ? lottie(ctx) : ["mov", "webm"].includes(ext(ctx.main)) ? visual(ctx) : undefined),
	transition: (ctx) => (ext(ctx.main) === "ffx" || ext(ctx.main) === "json" ? transition(ctx) : undefined),
	filter: (ctx) => (ext(ctx.main) === "ffx" || ext(ctx.main) === "json" ? filter(ctx) : undefined),
	text_template: textTemplate,
	video_template: videoTemplate,
	brand_kit: brandKit,
};

// ---------- malware (clamd INSTREAM, like worksite-download's ClamAvScanner) ----------

export function clamScan(buf, { host, port = 3310, timeout = 60_000 }) {
	return new Promise((resolve, reject) => {
		const sock = net.createConnection({ host, port });
		let reply = "";
		sock.setTimeout(timeout, () => sock.destroy(new Error("clamd timed out")));
		sock.on("error", reject);
		sock.on("data", (d) => (reply += d.toString()));
		sock.on("end", () => {
			const text = reply.replace(/\0/g, "").trim();
			if (/OK$/.test(text)) resolve({ clean: true, result: text });
			else if (/FOUND$/.test(text)) resolve({ clean: false, result: text.replace(/^stream:\s*/, "") });
			else reject(new Error(`clamd: ${text || "no reply"}`));
		});
		sock.on("connect", () => {
			sock.write("zINSTREAM\0");
			for (let i = 0; i < buf.length; i += 64 * 1024) {
				const chunk = buf.subarray(i, i + 64 * 1024);
				const len = Buffer.alloc(4);
				len.writeUInt32BE(chunk.length);
				sock.write(len);
				sock.write(chunk);
			}
			sock.end(Buffer.alloc(4));
		});
	});
}
