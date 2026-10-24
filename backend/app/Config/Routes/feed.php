<?php

/** @var CodeIgniter\Router\RouteCollection $routes */
$any = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];
$routes->match(['GET', 'HEAD'], 'feed/(stable|beta)/catalog\.json', 'FeedController::catalog/$1');
$routes->match(['GET', 'HEAD'], 'feed/(stable|beta)/catalog\.json\.sig', 'FeedController::signature/$1');
$routes->match(['GET', 'HEAD'], 'feed/(stable|beta)/packs/([^/]+)', 'FeedController::pack/$1/$2', ['filter' => 'libauth']);
$routes->match($any, 'feed/public-key\.pem', 'FeedController::publicKey');
$routes->match(['GET', 'HEAD'], 'previews/([0-9a-f-]{36})/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/([a-z0-9_-]{1,32}\.[a-z0-9]{2,5})', 'FeedController::preview/$1/$2/$3');
$routes->match($any, 'healthz', 'FeedController::healthz');
