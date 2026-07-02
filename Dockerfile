FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV NODE_ENV=production
# Evita OOM al compilar Next en CI/runners con poca RAM.
ENV NODE_OPTIONS=--max-old-space-size=4096

# --- Variables públicas de Meta (Embedded Signup) ---
# Next.js (output: standalone) INCRUSTA las NEXT_PUBLIC_* en el bundle del cliente
# durante `npm run build`. Por eso deben existir AQUÍ (build time), no solo en runtime.
# Se pasan como build-args desde el workflow de CI. Son valores PÚBLICOS (viajan al
# navegador de todos modos); el secreto (META_APP_SECRET) va SOLO en runtime.
ARG NEXT_PUBLIC_META_APP_ID
ARG NEXT_PUBLIC_META_CONFIG_ID
ARG NEXT_PUBLIC_META_GRAPH_VERSION=v21.0
ARG NEXT_PUBLIC_META_FEATURE_TYPE=whatsapp_business_app_onboarding
ENV NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID
ENV NEXT_PUBLIC_META_CONFIG_ID=$NEXT_PUBLIC_META_CONFIG_ID
ENV NEXT_PUBLIC_META_GRAPH_VERSION=$NEXT_PUBLIC_META_GRAPH_VERSION
ENV NEXT_PUBLIC_META_FEATURE_TYPE=$NEXT_PUBLIC_META_FEATURE_TYPE

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN npm install prisma --no-save
RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node server.js"]
