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
    $routes->get('entitlements', 'ClientController::entitlements');
});
