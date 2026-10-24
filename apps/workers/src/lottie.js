// Renders Lottie frames in headless Chromium with lottie-web (the runtime
// FrameFlow's editor uses). One browser per worker process, reused.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let browserPromise = null;

async function browser() {
	browserPromise ??= import("playwright").then(({ chromium }) => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}));
	return browserPromise;
}

export async function closeBrowser() {
	if (browserPromise) await (await browserPromise).close();
	browserPromise = null;
}

/**
 * PNG screenshots of `frames` (frame numbers) of the animation, at its own
 * size scaled to fit `maxSide`. Throws if lottie-web reports an error.
 */
export async function renderLottieFrames(json, frames, { maxSide = 640, background = "transparent" } = {}) {
	const page = await (await browser()).newPage();
	try {
		const scale = Math.min(1, maxSide / Math.max(json.w, json.h));
		const w = Math.max(2, Math.round(json.w * scale));
		const h = Math.max(2, Math.round(json.h * scale));
		await page.setViewportSize({ width: w, height: h });
		// No network: the page is built from local strings only.
		await page.route("**/*", (r) => r.abort());
		await page.setContent(`<!doctype html><html><body style="margin:0;background:${background}"><div id="a" style="width:${w}px;height:${h}px"></div></body></html>`);
		await page.addScriptTag({ content: fs.readFileSync(require.resolve("lottie-web/build/player/lottie_svg.min.js"), "utf8") });
		const errors = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await page.evaluate((data) => {
			window.anim = window.lottie.loadAnimation({ container: document.getElementById("a"), renderer: "svg", loop: false, autoplay: false, animationData: data });
		}, json);
		const out = [];
		for (const f of frames) {
			await page.evaluate((frame) => window.anim.goToAndStop(frame, true), f);
			out.push(await page.locator("#a").screenshot({ omitBackground: background === "transparent", type: "png" }));
		}
		if (errors.length) throw new Error(`Lottie render error: ${errors[0]}`);
		return out;
	} finally {
		await page.close();
	}
}

/** A screenshot of an SVG document (graphics), fitted to maxSide. */
export async function renderSvg(svgText, { maxSide = 1280 } = {}) {
	const page = await (await browser()).newPage();
	try {
		await page.route("**/*", (r) => r.abort());
		await page.setViewportSize({ width: maxSide, height: maxSide });
		await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent;display:grid;place-items:center;width:${maxSide}px;height:${maxSide}px"><img id="s" style="max-width:${maxSide}px;max-height:${maxSide}px" src="data:image/svg+xml;base64,${Buffer.from(svgText).toString("base64")}"></body></html>`);
		await page.waitForFunction(() => document.getElementById("s").complete);
		return await page.locator("#s").screenshot({ omitBackground: true, type: "png" });
	} finally {
		await page.close();
	}
}

/**
 * Font specimen rendered by Chromium (HarfBuzz shaping, so Sinhala
 * rakaransaya/yansaya with ZWJ and Tamil conjuncts come out right; FFmpeg's
 * drawtext drops ZWJ). `lines`: [{ text, size, label? }]; label lines use a
 * UI font (the name of a font that may not cover Latin). Returns a PNG.
 */
export async function renderFontSpecimen(fontBuf, format, lines, { width = 1280, height = 720 } = {}) {
	const page = await (await browser()).newPage();
	try {
		await page.route("**/*", (r) => r.abort());
		await page.setViewportSize({ width, height });
		const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
		await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
			@font-face { font-family: "Specimen"; src: url(data:font/${format};base64,${fontBuf.toString("base64")}) format("${format === "otf" ? "opentype" : format === "ttf" ? "truetype" : format}"); }
			body { margin: 0; width: ${width}px; height: ${height}px; background: #f8fafc; color: #141a33; font-family: "Specimen"; padding: 56px 60px; box-sizing: border-box; overflow: hidden; }
			p { margin: 0 0 28px; line-height: 1.25; white-space: nowrap; }
			p.label { font-family: system-ui, sans-serif; color: #5b6480; }
		</style></head><body>${lines.map((l) => `<p${l.label ? ' class="label"' : ""} style="font-size:${l.size}px">${esc(l.text)}</p>`).join("")}</body></html>`);
		await page.evaluate(() => document.fonts.ready);
		const loaded = await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Specimen" && f.status === "loaded"));
		if (!loaded) throw Object.assign(new Error("The browser couldn't load this font"), { check: "font.render" });
		return await page.screenshot({ type: "png" });
	} finally {
		await page.close();
	}
}
