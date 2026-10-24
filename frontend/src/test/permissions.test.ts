import { describe, expect, it } from 'vitest';
import { can, ROLES, typesForFile } from '@/core/schema';
import { ADMIN_NAV } from '@/layouts/adminNav';
import { availableActions, patchFrom } from '@/pages/admin/AssetEditor';
import { makeAsset } from './utils';

const canFor = (role: string) => (p: Parameters<typeof can>[1]) => can(role, p);

describe('permissions (ported from packages/asset-schema)', () => {
  it('matches the role table', () => {
    expect(can('super_admin', 'asset.publish.direct')).toBe(true);
    expect(can('library_manager', 'asset.publish.direct')).toBe(false);
    expect(can('content_editor', 'asset.edit.own')).toBe(true);
    expect(can('content_editor', 'asset.publish')).toBe(false);
    expect(can('reviewer', 'asset.review')).toBe(true);
    expect(can('analyst', 'asset.create')).toBe(false);
    expect(can('nobody', 'analytics.view')).toBe(false);
    expect(can(null, 'analytics.view')).toBe(false);
    expect(Object.keys(ROLES)).toEqual(['super_admin', 'library_manager', 'content_editor', 'reviewer', 'analyst']);
  });

  it('hides nav items the role lacks, like the old admin', () => {
    const visible = (role: string) => ADMIN_NAV.filter((i) => !i.perm || can(role, i.perm)).map((i) => i.name);
    expect(visible('analyst')).toEqual(['Dashboard', 'Asset Library', 'Categories & Tags', 'Audit log']);
    expect(visible('content_editor')).toEqual(['Dashboard', 'Asset Library', 'Upload Center', 'Processing', 'Categories & Tags']);
    expect(visible('reviewer')).toContain('Review Queue');
  });

  it('offers publishing actions by role and status', () => {
    expect(availableActions(makeAsset({ status: 'approved' }), canFor('library_manager'), true)).toEqual(['publish', 'archive']);
    expect(availableActions(makeAsset({ status: 'draft' }), canFor('library_manager'), true)).toEqual(['submit-review', 'archive']);
    expect(availableActions(makeAsset({ status: 'draft' }), canFor('super_admin'), true)).toEqual(['submit-review', 'publish', 'archive']);
    expect(availableActions(makeAsset({ status: 'ready_for_review' }), canFor('reviewer'), false)).toEqual(['approve', 'reject']);
    expect(availableActions(makeAsset({ status: 'published' }), canFor('library_manager'), true)).toEqual(['unpublish', 'deprecate', 'archive']);
    expect(availableActions(makeAsset({ status: 'published', pending_version: '1.1.0' }), canFor('library_manager'), true)).toContain('publish');
    expect(availableActions(makeAsset({ status: 'approved' }), canFor('analyst'), false)).toEqual([]);
  });

  it('PATCHes only changed fields, with lists split', () => {
    const a = makeAsset();
    expect(patchFrom(a, { ...toDraftLike(a), title: 'New', tags: 'a, b ,, c' })).toEqual({ title: 'New', tags: ['a', 'b', 'c'] });
    expect(patchFrom(a, toDraftLike(a))).toEqual({});
  });

  it('suggests types by extension', () => {
    expect(typesForFile('x.cube')).toEqual(['lut']);
    expect(typesForFile('x.json')).toEqual(['text_template', 'motion', 'brand_kit', 'lottie']);
    expect(typesForFile('x.exe')).toEqual([]);
  });
});

function toDraftLike(a: ReturnType<typeof makeAsset>) {
  return { title: a.title, slug: a.slug, category_id: a.category_id ?? '', description: a.description, tags: a.tags.join(', '), keywords: a.keywords.join(', '), min_app_version: a.min_app_version, author: a.author, featured: a.featured, licence_tier: a.licence_tier, licence_terms: a.licence_terms, licence_text: a.licence_text, attribution_required: a.attribution_required, attribution_text: a.attribution_text, visibility: a.visibility, unpublish_at: '' };
}
