# homelab-hub — the notifications receiver. Multi-stage: compile TS, then run
# a lean image. node:22-slim (glibc) has better-sqlite3 prebuilds, so no
# compiler is needed at install time.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
