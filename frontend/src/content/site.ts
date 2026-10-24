/**
 * Editable public-site content that the Library API has no source for (from the user's design mockup).
 * Text goes through the i18n files: wrap new copy in msg() and run `npm run i18n`, then add si/ta translations.
 * Everything marked `// placeholder: confirm with Livezen` was taken from the mockup and is not verified.
 */
import { config } from '@/core/config';
import { msg, type MessageKey } from '@/i18n';
import type { AssetType } from '@/core/schema';

// ---------------------------------------------------------------- app release (placeholder: confirm with Livezen)
export const APP_RELEASE = { version: '3.6', date: '2026-10-20' }; // placeholder: confirm with Livezen

const dl = (os: string) => `${config.frameflowDownloadUrl.replace(/\/+$/, '')}?os=${os}`;
export const DOWNLOADS: { os: 'macos' | 'windows' | 'linux'; name: string; detail: MessageKey; href: string }[] = [
  { os: 'macos', name: 'macOS', detail: msg('Universal · .dmg · 412 MB'), href: dl('macos') }, // placeholder: confirm with Livezen (sizes, URL scheme)
  { os: 'windows', name: 'Windows', detail: msg('64-bit · .exe · 388 MB'), href: dl('windows') }, // placeholder: confirm with Livezen
  { os: 'linux', name: 'Linux', detail: msg('AppImage / .deb · 401 MB'), href: dl('linux') }, // placeholder: confirm with Livezen
];

// placeholder: confirm with Livezen
export const SYSTEM_REQUIREMENTS: { name: string; text: MessageKey }[] = [
  { name: 'Windows', text: msg('Windows 10 (22H2) or 11, 64-bit · 8 GB RAM (16 GB for 4K) · DirectX 12 GPU with 2 GB VRAM') },
  { name: 'macOS', text: msg('macOS 13 Ventura or later · Apple silicon or Intel · 8 GB RAM (16 GB for 4K)') },
  { name: 'Linux', text: msg('Ubuntu 22.04+, Fedora 39+ · Vulkan 1.2 GPU · AppImage and .deb packages') },
];

// ---------------------------------------------------------------- asset types: mockup display names, gradients, blurbs
export const TYPE_DISPLAY: Record<AssetType, { label: MessageKey; a: string; b: string; blurb: MessageKey }> = {
  graphic: { label: msg('Graphics & overlays'), a: '#0ea5e9', b: '#1e3a8a', blurb: msg('Frames, light leaks, dust and overlays that sit on the canvas above your clips.') },
  sfx: { label: msg('Sound effects & audio'), a: '#10b981', b: '#064e3b', blurb: msg('Whooshes, hits, ambiences and foley, loudness-checked and ready for the audio track.') },
  text_template: { label: msg('Text animations'), a: '#f59e0b', b: '#7c2d12', blurb: msg('Titles, lower thirds and quote cards, tested with Sinhala and Tamil as well as Latin type.') },
  video_template: { label: msg('Video templates'), a: '#8b5cf6', b: '#1e1b4b', blurb: msg('Complete edits to start a project from: drop in your footage and change the text.') },
  motion: { label: msg('Motion graphics'), a: '#ec4899', b: '#4c0519', blurb: msg('Animated shapes, bursts and elements for the overlay track.') },
  transition: { label: msg('Effects & transitions'), a: '#a855f7', b: '#111827', blurb: msg('Glitches, wipes, zooms and blurs that go on a cut or a clip, adjustable once applied.') },
  lut: { label: msg('LUTs & colour presets'), a: '#f97316', b: '#7c2d12', blurb: msg('Cinematic, film and log-to-Rec.709 looks in 17, 33 and 65-point cubes. Drop one on a clip and set the strength in the Colour panel.') },
  font: { label: msg('Fonts'), a: '#64748b', b: '#0f172a', blurb: msg('Display and text faces with Sinhala and Tamil coverage, installed straight into the text tools.') },
  filter: { label: msg('Filters'), a: '#14b8a6', b: '#134e4a', blurb: msg('Grain, VHS, blur and stylise filters for clips and images.') },
  brand_kit: { label: msg('Brand kits'), a: '#c084fc', b: '#3b0764', blurb: msg('Colours, fonts and logos packaged so a whole team edits on brand.') },
  gif_sticker: { label: msg('GIFs & stickers'), a: '#eab308', b: '#713f12', blurb: msg('Animated stickers and GIFs for social edits.') },
  lottie: { label: msg('Lottie animations'), a: '#22c55e', b: '#14532d', blurb: msg('Lightweight vector animations: likes, bells, confetti and icons that stay sharp at any size.') },
};

// ---------------------------------------------------------------- home
// placeholder: confirm with Livezen — sample quotes from the mockup, not real customers until confirmed.
export const QUOTES: { quote: MessageKey; name: string; role: MessageKey }[] = [
  { quote: msg('I used to spend an hour finding and installing a pack. Now I drag it straight onto the cut.'), name: 'Dilan Fernando', role: msg('Wedding filmmaker, Negombo') }, // placeholder: confirm with Livezen
  { quote: msg('The Sinhala title templates actually render properly. That alone sold our team.'), name: 'Tharushi Jayasinghe', role: msg('Producer, Colombo') }, // placeholder: confirm with Livezen
  { quote: msg('Updates come through without breaking old projects. That’s what I care about on client work.'), name: 'Ravi Menon', role: msg('YouTube editor, Dubai') }, // placeholder: confirm with Livezen
];

// ---------------------------------------------------------------- pricing (placeholder: confirm with Livezen — prices)
export interface Plan {
  slug: 'free' | 'pro' | 'business' | 'enterprise';
  name: string;
  monthly: number | null; // LKR; null = custom
  tagline: MessageKey;
  features: MessageKey[];
  popular?: boolean;
}
export const PLANS: Plan[] = [
  { slug: 'free', name: 'Free', monthly: 0, tagline: msg('Try the library'), features: [msg('200 free assets'), msg('1 device'), msg('Standard previews'), msg('Community support')] },
  { slug: 'pro', name: 'Pro', monthly: 2490, tagline: msg('For solo editors and creators'), features: [msg('All library assets'), msg('3 devices'), msg('Auto-updates & offline cache'), msg('Commercial licence')], popular: true }, // placeholder: confirm with Livezen
  { slug: 'business', name: 'Business', monthly: 6900, tagline: msg('Per seat, for studios and teams'), features: [msg('Everything in Pro'), msg('Shared brand kits'), msg('Team favorites & collections'), msg('Priority support')] }, // placeholder: confirm with Livezen
  { slug: 'enterprise', name: 'Enterprise', monthly: null, tagline: msg('For broadcasters and agencies'), features: [msg('Private asset library'), msg('SSO with WorkSuite OneAuth'), msg('Custom licence terms'), msg('Dedicated manager')] },
];
/** Yearly = 10 × monthly ("2 months free"). placeholder: confirm with Livezen */
export const YEARLY_MONTHS = 10;

// placeholder: confirm with Livezen
export const COMPARE: { row: MessageKey; values: string[] }[] = [
  { row: msg('Library assets'), values: ['200', msg('All'), msg('All'), msg('All + private')] },
  { row: msg('Devices'), values: ['1', '3', msg('3 per seat'), msg('Unlimited')] },
  { row: msg('Offline cache'), values: ['—', '20 GB', '50 GB', msg('Custom')] },
  { row: msg('Auto-updates'), values: ['—', '✓', '✓', '✓'] },
  { row: msg('Brand kits'), values: ['—', '1', msg('Shared, unlimited'), msg('Unlimited')] },
  { row: msg('Commercial licence'), values: [msg('Personal'), '✓', '✓', msg('Custom terms')] },
  { row: msg('SSO / OneAuth'), values: ['—', '—', '—', '✓'] },
  { row: msg('Support'), values: [msg('Community'), msg('Email'), msg('Priority'), msg('Dedicated')] },
];

// placeholder: confirm with Livezen
export const PRICING_FAQ: [MessageKey, MessageKey][] = [
  [msg('Can I keep using assets after I cancel?'), msg('Yes. Assets used in projects you made while subscribed stay licensed for those projects.')],
  [msg('Do you accept local cards?'), msg('Yes. Sri Lankan Visa and Mastercard, plus bank transfer for yearly Business plans.')],
  [msg('Can I switch plans?'), msg('Any time. Upgrades apply immediately; downgrades apply at renewal.')],
];

// ---------------------------------------------------------------- what's new (placeholder: confirm with Livezen)
export const CHANGELOG: { date: string; kind: MessageKey; title: MessageKey; text: MessageKey }[] = [
  { date: '2026-10-24', kind: msg('Library'), title: msg('38 new assets'), text: msg('Sri Lanka light LUT collection, Neon Glitch 1.2, and 12 Diwali stickers.') },
  { date: '2026-10-20', kind: msg('App'), title: msg('FrameFlow 3.6'), text: msg('Drag un-installed assets onto the timeline; they install in place. Faster library search offline.') },
  { date: '2026-10-10', kind: msg('Library'), title: msg('Sinhala & Tamil titles'), text: msg('32 text templates tested with Noto Sans Sinhala and Mukta Malar.') },
  { date: '2026-09-28', kind: msg('App'), title: msg('FrameFlow 3.5'), text: msg('Automatic asset updates with per-project version pinning.') },
];

// ---------------------------------------------------------------- help (placeholder: confirm with Livezen)
export const HELP_CATEGORIES: [MessageKey, MessageKey][] = [
  [msg('Getting started'), msg('Install FrameFlow, sign in, first project')],
  [msg('Library & downloads'), msg('Browsing, installing, offline cache')],
  [msg('Using assets'), msg('Timeline, effects, LUTs, text templates')],
  [msg('Account & billing'), msg('Plans, invoices, devices')],
  [msg('Licensing'), msg('What you can do with assets')],
  [msg('Teams'), msg('Shared brand kits, seats, SSO')],
];
export const HELP_FAQ: [MessageKey, MessageKey][] = [
  [msg('Where are downloaded assets stored?'), msg('In FrameFlow’s library folder for your system. You can change the location in Settings → Library.')],
  [msg('A download failed. What now?'), msg('FrameFlow retries automatically. If the file fails its integrity check it is removed; press Retry in Downloads.')],
  [msg('Why is an asset greyed out?'), msg('It needs a newer FrameFlow version, a higher plan, or it was withdrawn from the library.')],
  [msg('Do I need to restart after installing a font?'), msg('No. Fonts installed from the library appear in the text tools straight away.')],
];

// ---------------------------------------------------------------- creators (placeholder: confirm with Livezen — stats)
export const CREATOR_STATS: { value: string; label: MessageKey }[] = [
  { value: '31k', label: msg('active editors') }, // placeholder: confirm with Livezen
  { value: '218k', label: msg('downloads last month') }, // placeholder: confirm with Livezen
  { value: '12', label: msg('asset types accepted') },
  { value: msg('5 days'), label: msg('average review time') }, // placeholder: confirm with Livezen
];
export const CREATOR_STEPS: [MessageKey, MessageKey][] = [
  [msg('Apply'), msg('Send your portfolio and the asset types you make.')],
  [msg('Upload'), msg('Use the creator portal; files are checked automatically.')],
  [msg('Review'), msg('Our team reviews quality, licence and metadata.')],
  [msg('Publish & earn'), msg('Your asset reaches every FrameFlow editor.')],
];

// ---------------------------------------------------------------- contact (placeholder: confirm with Livezen)
export const CONTACT = {
  support: 'support@frameflow.lk', // placeholder: confirm with Livezen
  sales: 'sales@frameflow.lk', // placeholder: confirm with Livezen
  office: msg('Livezen Technologies, Kaduwela, Sri Lanka'), // placeholder: confirm with Livezen
};
export const CONTACT_TOPICS: MessageKey[] = [msg('Team or enterprise plan'), msg('Creator application'), msg('Licensing'), msg('Technical support')];

// ---------------------------------------------------------------- licence summary (placeholder: confirm with Livezen)
export const LICENCE_UPDATED = '2026-10-01';
export const LICENCE_CAN: MessageKey[] = [msg('Use assets in commercial and client videos'), msg('Publish to YouTube, social, TV and cinema'), msg('Keep using assets in projects made while subscribed')];
export const LICENCE_CANT: MessageKey[] = [msg('Resell or share asset files on their own'), msg('Use fonts outside FrameFlow unless marked installable'), msg('Use editorial-only assets in advertising')];

export const MAKE_CHIPS: MessageKey[] = [msg('YouTube'), msg('Reels & TikTok'), msg('Weddings'), msg('Corporate')];
