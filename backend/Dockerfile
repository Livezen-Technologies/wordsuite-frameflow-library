# FrameFlow Library API (CodeIgniter 4) for production: nginx + php-fpm in one
# image, listening on 8080. State in PostgreSQL (DATABASE_URL), files in
# R2/S3 (LIBRARY_S3_*); see README.md. Migrations run at start.
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --prefer-dist --no-scripts --optimize-autoloader

FROM php:8.3-fpm-alpine
RUN apk add --no-cache nginx icu-libs libpq sqlite-libs \
 && apk add --no-cache --virtual .build icu-dev postgresql-dev sqlite-dev $PHPIZE_DEPS \
 && docker-php-ext-install -j"$(nproc)" intl pgsql opcache \
 && apk del .build \
 && mkdir -p /run/nginx /var/lib/nginx/tmp
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/library.ini
COPY docker/fpm.conf /usr/local/etc/php-fpm.d/zz-library.conf
COPY docker/entrypoint.sh /usr/local/bin/library-entrypoint
WORKDIR /var/www/library
COPY --from=vendor /app/vendor ./vendor
COPY app ./app
COPY public ./public
COPY spark composer.json ./
COPY writable ./writable
RUN chmod +x /usr/local/bin/library-entrypoint \
 && rm -f writable/logs/*.log writable/*.sqlite \
 && chown -R www-data:www-data writable /var/lib/nginx /run/nginx
ENV CI_ENVIRONMENT=production \
    LIBRARY_DATA_DIR=/var/www/library/writable/library
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["library-entrypoint"]
