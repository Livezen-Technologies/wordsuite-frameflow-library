# Static build served by nginx on 8080.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
ARG VITE_API_BASE=
ARG VITE_FRAMEFLOW_DOWNLOAD_URL=
ARG VITE_OIDC_ISSUER=
RUN npm run build

FROM nginx:1.27-alpine
# nginx's image runs envsubst over /etc/nginx/templates/*.template at start.
ENV LIBRARY_API_UPSTREAM=http://api:8787
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
