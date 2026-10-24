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

export default {
	async fetch(request, env) {
		return getContainer(env.LIBRARY).fetch(request);
	},
};
