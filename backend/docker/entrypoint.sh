#!/bin/sh
# Migrate, then run php-fpm (background) and nginx (foreground); exit if either dies.
set -e
cd /var/www/library
php spark migrate --all
chown -R www-data:www-data writable
php-fpm -D
if [ "${LIBRARY_SCHEDULER:-1}" = "1" ]; then
	# Scheduled publish/unpublish every minute (requests also run due schedules).
	( while true; do php spark library:schedule >/dev/null 2>&1 || true; sleep 60; done ) &
fi
if [ "${LIBRARY_WEBHOOKS:-1}" = "1" ]; then
	# Webhook delivery queue (3 attempts with backoff); restarts if it ever exits.
	( while true; do php spark library:webhooks --loop >/dev/null 2>&1 || true; sleep 5; done ) &
fi
exec nginx -g 'daemon off;'
