FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache nginx \
  && mkdir -p /var/log/nginx /var/lib/nginx/tmp
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/mysql2 /app/node_modules/mysql2
COPY --from=builder /app/node_modules/aws-ssl-profiles /app/node_modules/aws-ssl-profiles
COPY --from=builder /app/node_modules/generate-function /app/node_modules/generate-function
COPY --from=builder /app/node_modules/iconv-lite /app/node_modules/iconv-lite
COPY --from=builder /app/node_modules/long /app/node_modules/long
COPY --from=builder /app/node_modules/lru.min /app/node_modules/lru.min
COPY --from=builder /app/node_modules/named-placeholders /app/node_modules/named-placeholders
COPY --from=builder /app/node_modules/sql-escaper /app/node_modules/sql-escaper
COPY --from=builder /app/node_modules/bcryptjs /app/node_modules/bcryptjs
COPY scripts/migrate.mjs /app/scripts/migrate.mjs
COPY docker/mysql/init.sql /app/docker/mysql/init.sql
COPY docker/frontend/nginx.conf /etc/nginx/nginx.conf
COPY docker/frontend/start.sh /start.sh
RUN chmod +x /start.sh
EXPOSE 80
CMD ["/start.sh"]
