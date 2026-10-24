<?php

/** @var CodeIgniter\Router\RouteCollection $routes */
// Client (FrameFlow) endpoints, blueprint §7.2. Anonymous allowed; a bearer token adds plan and device.
$routes->group('api/v1', ['filter' => 'libauth'], static function ($routes) {
    $routes->get('catalog/types', 'ClientController::types');
    $routes->get('catalog/categories', 'ClientController::categories');
    $routes->get('assets', 'ClientController::search');
    $routes->get('assets/([^/]+)', 'ClientController::show/$1');
    $routes->get('assets/([^/]+)/preview', 'ClientController::preview/$1');
    $routes->get('search/suggest', 'ClientController::suggest');
    $routes->get('collections', 'ClientController::collections');
    $routes->get('collections/([^/]+)', 'ClientController::collection/$1');
    $routes->post('assets/([^/]+)/download', 'ClientController::download/$1');
    $routes->post('downloads/([^/]+)/complete', 'ClientController::complete/$1');
    $routes->post('me/usage', 'ClientController::usage');
    $routes->get('sync', 'ClientController::sync');
    $routes->get('sync/stream', 'ClientController::stream');
    // Signed-in user's devices and library (docs/api-v1-additions.md).
    $routes->post('devices/register', 'ClientController::registerDevice');
    $routes->get('me/devices', 'ClientController::devices');
    $routes->delete('me/devices/([^/]+)', 'ClientController::deleteDevice/$1');
    $routes->get('me/favorites', 'ClientController::favorites');
    $routes->put('me/favorites/([^/]+)', 'ClientController::addFavorite/$1');
    $routes->delete('me/favorites/([^/]+)', 'ClientController::removeFavorite/$1');
    $routes->get('me/downloads', 'ClientController::myDownloads');
    $routes->get('me/installs', 'ClientController::installs');
    $routes->post('me/installs', 'ClientController::addInstall');
    $routes->delete('me/installs/([^/]+)', 'ClientController::removeInstall/$1');
    $routes->get('entitlements', 'ClientController::entitlements');
});
