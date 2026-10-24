<?php

namespace App\Database\Migrations;

use App\Libraries\AssetSchema;
use App\Libraries\Uuid7;
use App\Services\LibraryService;
use CodeIgniter\Database\Migration;

/** The default categories per type (what the Node service created in a new library). */
class SeedDefaultCategories extends Migration
{
    public function up(): void
    {
        if ($this->db->table('categories')->countAllResults() > 0) {
            return;
        }
        foreach (LibraryService::DEFAULT_CATEGORIES as $type => $names) {
            foreach ($names as $i => $name) {
                $this->db->table('categories')->insert(['id' => Uuid7::generate(), 'type' => $type, 'name' => $name, 'slug' => AssetSchema::slugify($name), 'parent_id' => null, 'sort' => $i, 'icon' => null, 'visible' => 1]);
            }
        }
    }

    public function down(): void
    {
        $this->db->table('categories')->where('parent_id', null)->whereIn('slug', array_map([AssetSchema::class, 'slugify'], array_merge(...array_values(LibraryService::DEFAULT_CATEGORIES))))->delete();
    }
}
