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
RUN npx tsc -b packages/contracts packages/domain packages/artifact-store packages/runtime-gateway apps/runtime-adapter apps/api apps/web apps/admin

FROM build AS web-build
ARG NEXT_PUBLIC_DUDESIGN_API_URL=
ENV NEXT_PUBLIC_DUDESIGN_API_URL=$NEXT_PUBLIC_DUDESIGN_API_URL
RUN npm --workspace @dudesign/web run build

FROM build AS admin-build
ARG NEXT_PUBLIC_DUDESIGN_API_URL=
ARG NEXT_PUBLIC_DUDESIGN_ADMIN_BASE_PATH=
ENV NEXT_PUBLIC_DUDESIGN_API_URL=$NEXT_PUBLIC_DUDESIGN_API_URL
ENV NEXT_PUBLIC_DUDESIGN_ADMIN_BASE_PATH=$NEXT_PUBLIC_DUDESIGN_ADMIN_BASE_PATH
RUN npm --workspace @dudesign/admin run build

FROM node:22-bookworm-slim AS runtime-base
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /app/.dudesign/artifacts

FROM runtime-base AS runtime
COPY --from=build /app ./

FROM runtime-base AS web-runtime
COPY --from=web-build /app ./

FROM runtime-base AS admin-runtime
COPY --from=admin-build /app ./

FROM runtime-base AS chromium-base
ARG APT_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s#http://deb.debian.org/debian#$APT_MIRROR#g; s#http://security.debian.org/debian-security#$APT_MIRROR-security#g" /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

FROM chromium-base AS runtime-chromium
COPY --from=build /app ./

FROM mcr.microsoft.com/playwright:v1.61.1-noble AS runtime-playwright
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
RUN mkdir -p /app/.dudesign/artifacts

FROM runtime AS api
ARG INSTALL_PLAYWRIGHT_DEPS=false
RUN if [ "$INSTALL_PLAYWRIGHT_DEPS" = "true" ]; then npx playwright install --with-deps chromium; fi
EXPOSE 4000
CMD ["npm", "--workspace", "@dudesign/api", "run", "start"]

FROM runtime-playwright AS api-playwright
EXPOSE 4000
CMD ["npm", "--workspace", "@dudesign/api", "run", "start"]

FROM runtime-chromium AS api-system-chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
EXPOSE 4000
CMD ["npm", "--workspace", "@dudesign/api", "run", "start"]

FROM runtime AS runtime-adapter
EXPOSE 4100
CMD ["npm", "--workspace", "@dudesign/runtime-adapter", "run", "start"]

FROM web-runtime AS web
EXPOSE 3001
CMD ["npm", "--workspace", "@dudesign/web", "run", "start"]

FROM admin-runtime AS admin
EXPOSE 3002
CMD ["npm", "--workspace", "@dudesign/admin", "run", "start"]
