<?php

/** @var CodeIgniter\Router\RouteCollection $routes */
// Admin endpoints, blueprint §7.3: any library role passes the filter; LibraryService checks permissions.
$routes->group('api/v1/admin', ['namespace' => 'App\Controllers\Admin', 'filter' => 'libauth:admin'], static function ($routes) {
    $routes->get('me', 'AssetsController::me');
    $routes->post('uploads', 'UploadsController::create', ['filter' => 'perm:asset.create']);
    $routes->get('uploads/([^/]+)', 'UploadsController::show/$1');
    $routes->get('assets', 'AssetsController::index');
    $routes->post('assets', 'AssetsController::create');
    $routes->post('assets/bulk', 'AssetsController::bulk');
    $routes->get('assets/([^/]+)', 'AssetsController::show/$1');
    $routes->patch('assets/([^/]+)', 'AssetsController::update/$1');
    $routes->post('assets/([^/]+)/versions', 'AssetsController::addVersion/$1');
    $routes->post('assets/([^/]+)/versions/([^/]+)/publish', 'AssetsController::publishVersion/$1/$2');
    $routes->post('assets/([^/]+)/versions/([^/]+)/rollback', 'AssetsController::rollback/$1/$2');
    $routes->post('assets/([^/]+)/submit-review', 'AssetsController::submitReview/$1');
    $routes->post('assets/([^/]+)/approve', 'AssetsController::approve/$1');
    $routes->post('assets/([^/]+)/reject', 'AssetsController::reject/$1');
    $routes->post('assets/([^/]+)/publish', 'AssetsController::publish/$1');
    $routes->post('assets/([^/]+)/unpublish', 'AssetsController::unpublish/$1');
    $routes->post('assets/([^/]+)/deprecate', 'AssetsController::deprecate/$1');
    $routes->post('assets/([^/]+)/archive', 'AssetsController::archive/$1');
    $routes->post('assets/([^/]+)/reprocess', 'AssetsController::reprocess/$1');
    $routes->match(['GET', 'HEAD'], 'assets/([^/]+)/versions/([^/]+)/previews/([a-z0-9_-]{1,32}\.[a-z0-9]{2,5})', 'AssetsController::preview/$1/$2/$3');
    $routes->get('categories', 'CategoriesController::index');
    $routes->post('categories', 'CategoriesController::create', ['filter' => 'perm:taxonomy.manage']);
    $routes->post('categories/reorder', 'CategoriesController::reorder', ['filter' => 'perm:taxonomy.manage']);
    $routes->patch('categories/([^/]+)', 'CategoriesController::update/$1', ['filter' => 'perm:taxonomy.manage']);
    $routes->delete('categories/([^/]+)', 'CategoriesController::delete/$1', ['filter' => 'perm:taxonomy.manage']);
    $routes->post('tags/merge', 'CategoriesController::mergeTags', ['filter' => 'perm:taxonomy.manage']);
    $routes->get('collections', 'CollectionsController::index', ['filter' => 'perm:taxonomy.manage']);
    $routes->post('collections', 'CollectionsController::create', ['filter' => 'perm:taxonomy.manage']);
    $routes->get('collections/([^/]+)', 'CollectionsController::show/$1', ['filter' => 'perm:taxonomy.manage']);
    $routes->patch('collections/([^/]+)', 'CollectionsController::update/$1', ['filter' => 'perm:taxonomy.manage']);
    $routes->delete('collections/([^/]+)', 'CollectionsController::delete/$1', ['filter' => 'perm:taxonomy.manage']);
    $routes->get('settings', 'SettingsController::show', ['filter' => 'perm:settings.manage']);
    $routes->put('settings', 'SettingsController::update', ['filter' => 'perm:settings.manage']);
    $routes->get('webhooks', 'WebhooksController::index', ['filter' => 'perm:settings.manage']);
    $routes->post('webhooks', 'WebhooksController::create', ['filter' => 'perm:settings.manage']);
    $routes->patch('webhooks/([^/]+)', 'WebhooksController::update/$1', ['filter' => 'perm:settings.manage']);
    $routes->delete('webhooks/([^/]+)', 'WebhooksController::delete/$1', ['filter' => 'perm:settings.manage']);
    $routes->get('webhooks/([^/]+)/deliveries', 'WebhooksController::deliveries/$1', ['filter' => 'perm:settings.manage']);
    $routes->post('webhooks/([^/]+)/test', 'WebhooksController::test/$1', ['filter' => 'perm:settings.manage']);
    $routes->get('analytics/overview', 'AnalyticsController::overview');
    $routes->get('analytics/assets/([^/]+)', 'AnalyticsController::asset/$1', ['filter' => 'perm:analytics.view,analytics.view.own']);
    $routes->get('analytics/search', 'AnalyticsController::search', ['filter' => 'perm:analytics.view']);
    $routes->get('audit-log', 'AnalyticsController::auditLog');
    $routes->get('jobs', 'AnalyticsController::jobs');
});
