FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages/web/package.json packages/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci
COPY packages/web packages/web
COPY packages/core packages/core
RUN npm run build --workspace=@astra/web

FROM nginx:1.27-alpine
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
