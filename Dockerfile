FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run prisma:generate && npm run build

RUN chmod +x docker/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

ENTRYPOINT ["docker/entrypoint.sh"]
