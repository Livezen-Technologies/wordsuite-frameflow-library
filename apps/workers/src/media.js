// FFmpeg / ffprobe / fc-scan helpers. Every call has a timeout and runs on
// files in a per-job temp folder; inputs are never interpolated into a shell.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export function run(cmd, args, { timeout = 120_000, maxBuffer = 64 * 1024 ** 2, encoding = "utf8" } = {}) {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { timeout, maxBuffer, encoding }, (err, stdout, stderr) => {
			if (err) reject(Object.assign(new Error(`${path.basename(cmd)} failed: ${String(stderr || err.message).trim().split("\n").slice(-3).join(" | ")}`), { stderr }));
			else resolve({ stdout, stderr });
		});
	});
}

export const ffmpeg = (args, opts) => run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], opts);

export async function probe(file) {
	const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
	const j = JSON.parse(stdout);
	const v = j.streams.find((s) => s.codec_type === "video");
	const a = j.streams.find((s) => s.codec_type === "audio");
	const rate = (r) => {
		const [n, d] = String(r ?? "0/1").split("/").map(Number);
		return d ? Math.round((n / d) * 100) / 100 : 0;
	};
	const duration = Number(j.format?.duration ?? v?.duration ?? a?.duration ?? 0);
	return {
		duration_ms: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : null,
		video: v ? { codec: v.codec_name, w: v.width, h: v.height, fps: rate(v.avg_frame_rate || v.r_frame_rate), pix_fmt: v.pix_fmt, frames: Number(v.nb_frames) || null } : null,
		audio: a ? { codec: a.codec_name, sample_rate: Number(a.sample_rate), channels: a.channels, bit_depth: a.bits_per_raw_sample ? Number(a.bits_per_raw_sample) : null } : null,
	};
}

/** True when the pixel format carries alpha. */
export const hasAlpha = (pixFmt) => /^(rgba|bgra|argb|abgr|ya|yuva|gbrap|pal8)/.test(pixFmt ?? "");

/** 640×360 WebP, letterboxed; `at` seconds into timed media. */
export async function thumbnail(input, out, { at = null, alpha = false } = {}) {
	const pad = alpha ? "pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black@0" : "pad=640:360:(ow-iw)/2:(oh-ih)/2:color=0x0b0d12";
	await ffmpeg([...(at !== null ? ["-ss", String(at)] : []), "-i", input, "-frames:v", "1", "-vf", `scale=640:360:force_original_aspect_ratio=decrease,${pad}${alpha ? ",format=yuva420p" : ""}`, "-c:v", "libwebp", "-quality", "82", out]);
	return out;
}

/** Hover preview: H.264 MP4, 480p, ≤ 15 s, no audio, small. Loops short clips up to 6 s. */
export async function hoverMp4(input, out, { durationMs = null, loop = true } = {}) {
	const secs = Math.min(15, (durationMs ?? 6000) / 1000);
	const loops = loop && secs < 6 ? Math.ceil(6 / Math.max(secs, 0.1)) - 1 : 0;
	await ffmpeg([...(loops ? ["-stream_loop", String(loops)] : []), "-i", input, "-t", String(Math.max(secs, Math.min(6, secs * (loops + 1)))), "-an", "-vf", "scale=-2:480:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-maxrate", "1.5M", "-bufsize", "3M", "-movflags", "+faststart", out]);
	return out;
}

export async function audioInfo(input) {
	const { stderr } = await run(FFMPEG, ["-hide_banner", "-nostats", "-i", input, "-af", "ebur128=peak=true,astats=metadata=0:reset=0", "-f", "null", "-"], { timeout: 300_000 });
	const lufs = /I:\s+(-?[\d.]+) LUFS/.exec(stderr.split("Summary:").pop() ?? "");
	const peak = /Peak:\s+(-?[\d.inf]+) dBFS/.exec(stderr.split("Summary:").pop() ?? "");
	const clipped = [...stderr.matchAll(/Number of (?:samples clipped|clipped samples)?:?\s*(\d+)/gi)];
	const peakLevel = [...stderr.matchAll(/Peak level dB:\s*(-?[\d.inf]+)/g)].map((m) => Number(m[1]));
	return {
		loudness_lufs: lufs ? Number(lufs[1]) : null,
		true_peak_dbfs: peak && Number.isFinite(Number(peak[1])) ? Number(peak[1]) : null,
		peak_db: peakLevel.length ? Math.max(...peakLevel) : null,
		clipped: clipped.length ? clipped.reduce((n, m) => n + Number(m[1]), 0) : null,
	};
}

/** Peaks (0–1) of mono audio, `count` buckets. */
export async function waveformPeaks(input, count = 800) {
	const { stdout } = await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", input, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { encoding: "buffer", timeout: 300_000, maxBuffer: 512 * 1024 ** 2 });
	const samples = stdout.length >> 1;
	const per = Math.max(1, Math.floor(samples / count));
	const peaks = [];
	for (let b = 0; b < count && b * per < samples; b++) {
		let max = 0;
		for (let i = b * per; i < Math.min(samples, (b + 1) * per); i++) max = Math.max(max, Math.abs(stdout.readInt16LE(i * 2)));
		peaks.push(Math.round((max / 32768) * 1000) / 1000);
	}
	return peaks;
}

/** fc-scan: family, styles and Unicode coverage of a font file. */
export async function fontInfo(file) {
	const { stdout } = await run("fc-scan", ["--format", "%{family[0]}\\t%{style[0]}\\t%{weight}\\t%{slant}\\t%{charset}\\n", file]);
	const [first] = stdout.trim().split("\n");
	const [family, style, weight, slant, charset] = (first ?? "").split("\t");
	const ranges = (charset ?? "").split(/\s+/).filter(Boolean).map((r) => r.split("-").map((h) => Number.parseInt(h, 16)));
	const covers = (cp) => ranges.some(([a, b = a]) => cp >= a && cp <= b);
	const coverage = (from, to, assigned) => {
		const cps = assigned ?? Array.from({ length: to - from + 1 }, (_, i) => from + i);
		return Math.round((cps.filter(covers).length / cps.length) * 1000) / 10;
	};
	// Assigned Sinhala and Tamil code points (Unicode 15).
	const SINHALA = [...range(0x0d81, 0x0d83), ...range(0x0d85, 0x0d96), ...range(0x0d9a, 0x0db1), ...range(0x0db3, 0x0dbb), 0x0dbd, ...range(0x0dc0, 0x0dc6), 0x0dca, ...range(0x0dcf, 0x0dd4), 0x0dd6, ...range(0x0dd8, 0x0ddf), ...range(0x0de6, 0x0def), ...range(0x0df2, 0x0df4)];
	const TAMIL = [0x0b82, 0x0b83, ...range(0x0b85, 0x0b8a), ...range(0x0b8e, 0x0b90), ...range(0x0b92, 0x0b95), 0x0b99, 0x0b9a, 0x0b9c, 0x0b9e, 0x0b9f, 0x0ba3, 0x0ba4, ...range(0x0ba8, 0x0baa), ...range(0x0bae, 0x0bb9), ...range(0x0bbe, 0x0bc2), ...range(0x0bc6, 0x0bc8), ...range(0x0bca, 0x0bcd), 0x0bd0, 0x0bd7, ...range(0x0be6, 0x0bfa)];
	return {
		family: family || null,
		style: style || null,
		weight: weight ? Number(weight) : null,
		italic: slant ? Number(slant) > 0 : false,
		coverage: { latin: coverage(0x20, 0x7e), sinhala: coverage(0, 0, SINHALA), tamil: coverage(0, 0, TAMIL) },
	};
}

function range(a, b) {
	return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export const readIf = (file) => (fs.existsSync(file) ? fs.readFileSync(file) : null);
