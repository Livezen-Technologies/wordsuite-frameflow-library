// Cloudflare front for the Library API: every request goes to one
// container instance running the Docker image at the repo root. One
// instance on purpose: it holds PostgreSQL's writer lock (storage.js).
import { Container, getContainer } from "@cloudflare/containers";

const PASS = [
	"DATABASE_URL",
	"LIBRARY_SIGNING_KEY",
	"LIBRARY_ADMIN_TOKENS",
	"LIBRARY_OIDC_ISSUER",
	"LIBRARY_OIDC_AUDIENCE",
	"LIBRARY_OIDC_ROLE_CLAIM",
	"LIBRARY_S3_ENDPOINT",
	"LIBRARY_S3_BUCKET",
	"LIBRARY_S3_ACCESS_KEY_ID",
	"LIBRARY_S3_SECRET_ACCESS_KEY",
	"LIBRARY_S3_REGION",
	"LIBRARY_S3_PREFIX",
];

export class LibraryContainer extends Container {
	defaultPort = 8080;
	// Stays up between requests for a while; FrameFlow clients poll every 15 minutes.
	sleepAfter = "30m";
	enableInternet = true;

	constructor(ctx, env) {
		super(ctx, env);
		this.envVars = Object.fromEntries(PASS.filter((k) => env[k]).map((k) => [k, String(env[k])]));
	}
}

// Served at https://frameflow.worksuitecloud.com/library next to the web
// editor: the prefix comes off before the container sees the request and
// goes back on redirects.
const PREFIX = "/library";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === PREFIX) return Response.redirect(`${url.origin}${PREFIX}/`, 301);
		if (url.pathname.startsWith(`${PREFIX}/`)) url.pathname = url.pathname.slice(PREFIX.length);
		const response = await getContainer(env.LIBRARY).fetch(new Request(url, request));
		const location = response.headers.get("Location");
		if (!location?.startsWith("/") || location.startsWith("//")) return response;
		const headers = new Headers(response.headers);
		headers.set("Location", PREFIX + location);
		return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
	},
};
