<?php

/** @var CodeIgniter\Router\RouteCollection $routes */
// Processing workers (apps/workers): token role "worker"; LibraryService checks jobs.process and the lease.
$routes->group('api/v1/worker', ['filter' => 'libauth'], static function ($routes) {
    $routes->post('jobs/claim', 'WorkerController::claim');
    $routes->get('jobs/([^/]+)/files/([^/]+)', 'WorkerController::file/$1/$2');
    $routes->put('jobs/([^/]+)/previews/([^/]+)', 'WorkerController::preview/$1/$2');
    $routes->post('jobs/([^/]+)/complete', 'WorkerController::complete/$1');
});
