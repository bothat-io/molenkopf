FROM node:24-bookworm AS dashboard-build
WORKDIR /app

COPY packages/dashboard/package.json packages/dashboard/package-lock.json packages/dashboard/
RUN CYPRESS_INSTALL_BINARY=0 npm --prefix packages/dashboard ci

COPY packages/dashboard packages/dashboard
RUN npm --prefix packages/dashboard run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
LABEL org.opencontainers.image.title="Molenkopf" \
      org.opencontainers.image.description="Local gateway for coding agents" \
      org.opencontainers.image.source="https://github.com/bothat-io/molenkopf" \
      org.opencontainers.image.licenses="MIT"

COPY package.json package-lock.json ./
COPY LICENSE LICENSE
COPY packages/core/src packages/core/src
COPY packages/proxy/src packages/proxy/src
COPY packages/plugins packages/plugins
COPY --from=dashboard-build /app/packages/dashboard/dist packages/dashboard/dist

RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/__molenkopf/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node","--experimental-strip-types","--experimental-sqlite","--disable-warning=ExperimentalWarning","packages/proxy/src/cli/main.ts","proxy","--host","0.0.0.0","--allow-public-bind","--port","8787","--data-dir","/data"]
