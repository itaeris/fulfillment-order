FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN npm run build:api

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache nginx \
  && mkdir -p /var/log/nginx /var/lib/nginx/tmp
ENV NODE_ENV=production
ENV API_PORT=4000
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY docker/backend/nginx.conf /etc/nginx/nginx.conf
COPY docker/backend/start.sh /start.sh
RUN chmod +x /start.sh
WORKDIR /app/apps/api
EXPOSE 80
CMD ["/start.sh"]
