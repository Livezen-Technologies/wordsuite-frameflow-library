// Message keys for values that arrive as data (asset types, statuses, tiers, roles…) and are translated with tx()/label().
// Listing them here with msg() puts them in en.json and in the completeness test.
import { msg } from '@/i18n';

export const DYNAMIC_KEYS = [
  // asset types: full name, short name, install target (core/schema.ts ASSET_TYPES)
  msg('Graphic Elements & Overlays'), msg('Graphics'), msg('Canvas / overlay track'),
  msg('Sound Effects & Audio'), msg('Sound'), msg('Audio track'),
  msg('Text Templates & Animations'), msg('Text'), msg('Text track / title editor'),
  msg('Video Templates'), msg('Video'), msg('New project / insert sequence'),
  msg('Motion Graphics & Animated Elements'), msg('Motion'), msg('Overlay track'),
  msg('Video Effects & Transitions'), msg('Transitions'), msg('Clip / between-clip'),
  msg('LUTs & Color Presets'), msg('LUTs'), msg('Clip color panel'),
  msg('Fonts & Font Packs'), msg('Fonts'), msg('Text engine'),
  msg('Video & Image Filters'), msg('Filters'), msg('Clip effects panel'),
  msg('Brand Kits'), msg('Brand kits'), msg('Brand panel / project defaults'),
  msg('GIFs & Animated Stickers'), msg('Stickers'),
  msg('Lottie Animations'), msg('Lottie'),
  // asset / version / job statuses (humanized)
  msg('draft'), msg('processing'), msg('ready for review'), msg('approved'), msg('published'), msg('deprecated'), msg('archived'), msg('failed'),
  msg('ready'), msg('retired'), msg('queued'), msg('running'), msg('done'), msg('cancelled'),
  // visibilities
  msg('private'), msg('internal'), msg('public'), msg('unlisted'),
  // tiers
  msg('free'), msg('pro'), msg('business'), msg('enterprise'),
  // licence terms
  msg('royalty free'), msg('editorial only'), msg('personal only'), msg('custom'),
  // roles
  msg('Super Admin'), msg('Library Manager'), msg('Content Editor'), msg('Reviewer'), msg('Analyst'),
  // device OS
  msg('windows'), msg('macos'), msg('linux'),
  // audience rule effects
  msg('allow'), msg('deny'),
  // download statuses
  msg('started'), msg('completed'),
];
