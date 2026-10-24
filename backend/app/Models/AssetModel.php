<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `assets` (see the CreateLibraryTables migration). Mapped to API shapes by App\Services\LibraryStore. */
class AssetModel extends Model
{
    protected $table          = 'assets';
    protected $primaryKey     = 'row_id';
    protected $returnType     = 'array';
    protected $useTimestamps  = false;
    protected $protectFields  = true;
    protected $allowedFields  = ['id', 'type', 'slug', 'title', 'description', 'tags', 'keywords', 'min_app_version', 'licence_tier', 'licence_terms', 'visibility', 'category_id', 'subcategory_id', 'licence_text', 'attribution_required', 'attribution_text', 'author', 'aspect_ratios', 'platforms', 'audience_rules', 'dependencies', 'featured', 'featured_rank', 'publish_at', 'unpublish_at', 'meta', 'thumbnail_file', 'status', 'current_version', 'published_version', 'pending_version', 'review', 'stats_downloads', 'stats_installs', 'stats_favorites', 'stats_applies', 'created_by', 'created_at', 'updated_by', 'updated_at', 'published_by', 'published_at'];
}
