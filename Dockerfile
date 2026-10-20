FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN npm ci
COPY . .
RUN npm run build --workspaces

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/packages ./packages
EXPOSE 8787
CMD ["node", "packages/api/dist/index.js"]
