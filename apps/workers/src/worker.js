// Processing worker: claims jobs from the Library API, processes the
// version's main file in a temp folder, uploads previews and reports checks.
//
//   LIBRARY_API_URL       e.g. https://frameflow.worksuitecloud.com/library
//   LIBRARY_WORKER_TOKEN  a token with the `worker` role (LIBRARY_ADMIN_TOKENS "tok:worker:id")
//   WORKER_CONCURRENCY    jobs at once (default 2)
//   WORKER_POLL_MS        idle poll interval (default 5000)
//   CLAMAV_HOST / CLAMAV_PORT   clamd for malware scans (optional)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "./client.js";
import { closeBrowser } from "./lottie.js";
import { PROCESSORS, clamScan } from "./processors.js";

/** Runs one claimed job; resolves to the result sent to the API. */
export async function processJob(api, claim, { clamav = null, log = () => {} } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `fflib-job-${claim.job.id}-`));
	const checks = [];
	const meta = {};
	const uploaded = [];
	const ctx = {
		dir,
		asset: claim.asset,
		main: null,
		check: (check, passed, detail = null) => checks.push({ check, passed: !!passed, detail }),
		meta: (m) => Object.assign(meta, m),
		put: async (kind, ext, fileOrBuf) => {
			const buf = Buffer.isBuffer(fileOrBuf) ? fileOrBuf : fs.readFileSync(fileOrBuf);
			await api.putPreview(claim.job.id, kind, ext, buf);
			uploaded.push(kind);
		},
	};
	try {
		const main = claim.files.find((f) => f.role === "main");
		const buf = await api.file(claim.job.id, main.sha256);
		// Only the extension of the stored name is used; the rest is ours.
		ctx.main = path.join(dir, `main${path.extname(main.filename).toLowerCase().replace(/[^.a-z0-9]/g, "")}`);
		fs.writeFileSync(ctx.main, buf);
		if (clamav) {
			const scan = await clamScan(buf, clamav);
			ctx.check("malware_scan", scan.clean, { engine: "clamav", result: scan.result });
			if (!scan.clean) return await api.complete(claim.job.id, { ok: true, checks, meta });
		}
		const processor = PROCESSORS[claim.asset.type];
		if (processor) {
			try {
				await processor(ctx);
			} catch (e) {
				// A file the tools can't read is a failed check, not a retry.
				if (e.check) ctx.check(e.check, false, { message: e.message });
				else throw e;
			}
		}
		log(`job ${claim.job.id} ${claim.asset.type} ${claim.asset.slug}@${claim.version}: ${uploaded.join(", ") || "no previews"}; ${checks.filter((c) => !c.passed).length} failed checks`);
		return await api.complete(claim.job.id, { ok: true, checks, meta });
	} catch (e) {
		log(`job ${claim.job.id} failed: ${e.message}`);
		await api.complete(claim.job.id, { ok: false, error: e.message }).catch(() => {});
		return { status: "error", error: e.message };
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/** Claims and runs jobs until `signal` aborts. */
export async function runWorker({ api, concurrency = 2, pollMs = 5000, clamav = null, signal, log = console.log }) {
	const slots = Array.from({ length: concurrency }, async () => {
		while (!signal?.aborted) {
			let claim = null;
			try {
				claim = await api.claim();
			} catch (e) {
				log(`claim failed: ${e.message}`);
			}
			if (claim) await processJob(api, claim, { clamav, log });
			else await new Promise((r) => setTimeout(r, pollMs));
		}
	});
	await Promise.all(slots);
	await closeBrowser();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const { LIBRARY_API_URL, LIBRARY_WORKER_TOKEN } = process.env;
	if (!LIBRARY_API_URL || !LIBRARY_WORKER_TOKEN) {
		console.error("Set LIBRARY_API_URL and LIBRARY_WORKER_TOKEN.");
		process.exit(1);
	}
	const controller = new AbortController();
	for (const s of ["SIGTERM", "SIGINT"]) process.once(s, () => controller.abort());
	const clamav = process.env.CLAMAV_HOST ? { host: process.env.CLAMAV_HOST, port: Number(process.env.CLAMAV_PORT) || 3310 } : null;
	console.log(`FrameFlow Library worker → ${LIBRARY_API_URL} (concurrency ${Number(process.env.WORKER_CONCURRENCY) || 2}${clamav ? ", ClamAV on" : ""})`);
	await runWorker({ api: createApiClient({ baseUrl: LIBRARY_API_URL, token: LIBRARY_WORKER_TOKEN }), concurrency: Number(process.env.WORKER_CONCURRENCY) || 2, pollMs: Number(process.env.WORKER_POLL_MS) || 5000, clamav, signal: controller.signal });
}
