FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run prisma:generate && npm run build

# Strip Windows CRLF if present; chmod is a backup — ENTRYPOINT invokes /bin/sh explicitly.
RUN sed -i 's/\r$//' docker/entrypoint.sh && chmod +x docker/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

ENTRYPOINT ["/bin/sh", "docker/entrypoint.sh"]
