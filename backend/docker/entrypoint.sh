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
exec nginx -g 'daemon off;'
