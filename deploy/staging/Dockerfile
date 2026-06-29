FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/runtime-adapter/package.json apps/runtime-adapter/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/artifact-store/package.json packages/artifact-store/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/runtime-gateway/package.json packages/runtime-gateway/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ARG NEXT_PUBLIC_DUDESIGN_API_URL=
ARG NEXT_PUBLIC_DUDESIGN_ADMIN_BASE_PATH=
ENV NEXT_PUBLIC_DUDESIGN_API_URL=$NEXT_PUBLIC_DUDESIGN_API_URL
ENV NEXT_PUBLIC_DUDESIGN_ADMIN_BASE_PATH=$NEXT_PUBLIC_DUDESIGN_ADMIN_BASE_PATH
RUN npx tsc -b packages/contracts packages/domain packages/artifact-store packages/runtime-gateway apps/runtime-adapter apps/api apps/web apps/admin
RUN npm --workspace @dudesign/web run build
RUN npm --workspace @dudesign/admin run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
RUN mkdir -p /app/.dudesign/artifacts

FROM runtime AS api
ARG INSTALL_PLAYWRIGHT_DEPS=false
RUN if [ "$INSTALL_PLAYWRIGHT_DEPS" = "true" ]; then npx playwright install --with-deps chromium; fi
EXPOSE 4000
CMD ["npm", "--workspace", "@dudesign/api", "run", "start"]

FROM runtime AS runtime-adapter
EXPOSE 4100
CMD ["npm", "--workspace", "@dudesign/runtime-adapter", "run", "start"]

FROM runtime AS web
EXPOSE 3001
CMD ["npm", "--workspace", "@dudesign/web", "run", "start"]

FROM runtime AS admin
EXPOSE 3002
CMD ["npm", "--workspace", "@dudesign/admin", "run", "start"]
