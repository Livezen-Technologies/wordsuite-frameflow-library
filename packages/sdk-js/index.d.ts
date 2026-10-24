export type AssetType = "graphic" | "sfx" | "text_template" | "video_template" | "motion" | "transition" | "lut" | "font" | "filter" | "brand_kit" | "gif_sticker" | "lottie";
export type Tier = "free" | "pro" | "business" | "enterprise";

export interface LibraryAsset {
	id: string;
	slug: string;
	type: AssetType;
	title: string;
	description: string;
	category: { id: string; name: string; slug: string } | null;
	tags: string[];
	keywords: string[];
	aspect_ratios: string[];
	licence_tier: Tier;
	licence_terms: string;
	attribution_required: boolean;
	attribution_text: string;
	author: string;
	min_app_version: string;
	current_version: string;
	file_size_bytes: number | null;
	checksum_sha256: string | null;
	featured: boolean;
	meta: Record<string, unknown>;
	/** The FrameFlow download-center pack this asset installs as. */
	pack_id: string;
	pack_type: string;
	thumbnail_url: string | null;
	published_at: string | null;
	stats: { downloads: number; installs: number; favorites: number; applies: number };
}

export interface AssetDetail extends LibraryAsset {
	versions: Array<{ version: string; changelog: string; is_breaking: boolean; status: string; size: number; sha256: string }>;
	dependencies: Array<{ asset_id: string; min_version?: string; asset: LibraryAsset | null }>;
	entitlement: { can_download: boolean; reason: string | null };
}

export interface Page<T> {
	data: T[];
	next_cursor: string | null;
	total: number;
}

export interface DownloadGrant {
	download_id: string;
	url: string;
	expires_at: string;
	sha256: string;
	size: number;
	signature: string;
	manifest: { id: string; slug: string; type: AssetType; version: string };
}

export interface SyncEvent {
	seq: number;
	op: "upsert" | "unpublish" | "deprecate" | "delete" | "category_change" | "entitlement";
	asset_id: string | null;
	type?: AssetType;
	version?: string;
	changed?: string[];
	update_available?: boolean;
	breaking?: boolean;
	reason?: string;
	created_at: string;
}

export interface SyncPage {
	events: SyncEvent[];
	next_cursor: string;
	has_more: boolean;
	full_resync_required: boolean;
}

export declare class LibraryError extends Error {
	status: number;
	code: string;
	details: Array<{ field: string; rule: string; value: unknown }>;
	requestId: string | null;
}

export interface LibraryClient {
	types(): Promise<Array<{ key: AssetType; name: string; pack_type: string; editor_target: string; count: number }>>;
	categories(type?: AssetType): Promise<Array<{ id: string; type: AssetType; name: string; slug: string }>>;
	search(params?: { q?: string; type?: AssetType; category?: string; tags?: string; tier?: Tier; has_alpha?: boolean; sort?: "popular" | "new" | "trending" | "az"; cursor?: string; limit?: number }): Promise<Page<LibraryAsset>>;
	asset(id: string): Promise<AssetDetail>;
	suggest(q: string): Promise<Array<{ id: string; title: string; type: AssetType }>>;
	collections(): Promise<Array<{ slug: string; title: string; assets: LibraryAsset[] }>>;
	collection(slug: string): Promise<{ slug: string; title: string; assets: LibraryAsset[] }>;
	requestDownload(id: string, options?: { version?: string }): Promise<DownloadGrant>;
	completeDownload(downloadId: string, report: { status: "installed" | "failed"; bytes?: number; duration_ms?: number }): Promise<unknown>;
	reportUsage(events: Array<{ asset_id: string; event: "apply" | "insert" | "preview" }>): Promise<{ accepted: boolean }>;
	sync(since?: string | number): Promise<SyncPage>;
	entitlements(): Promise<{ plan: Tier }>;
	feedBase: string;
}

export declare function createLibraryClient(options: {
	baseUrl: string;
	getToken?: () => string | null | Promise<string | null>;
	appVersion?: string;
	deviceId?: string;
	plan?: Tier;
	fetch?: typeof fetch;
}): LibraryClient;
