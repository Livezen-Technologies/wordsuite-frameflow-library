<?php

use CodeIgniter\Router\RouteCollection;

/**
 * @var RouteCollection $routes
 *
 * Route groups live in app/Config/Routes/*.php. The admin web is a separate
 * app; this serves the API (/api/v1) and the FrameFlow feed only.
 */
$routes->setAutoRoute(false);
$routes->setDefaultNamespace('App\Controllers');

foreach (['feed', 'client', 'admin', 'worker'] as $group) {
    require __DIR__ . '/Routes/' . $group . '.php';
}

// CORS preflight for any path (the cors filter answers it).
$routes->options('(:any)', static fn () => service('response')->setStatusCode(204));

// Anything else: 404 in the API's error format.
$routes->set404Override('App\Controllers\ClientController::missing');
