export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'Quiz Service Backend',
    env: process.env.NODE_ENV ?? 'development',
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
  },
  database: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/quiz_service?schema=public',
  },
  frontend: {
    baseUrl: process.env.FRONTEND_BASE_URL ?? 'http://localhost:3001',
  },
  mail: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number.parseInt(process.env.SMTP_PORT ?? '1025', 10),
    username: process.env.SMTP_USERNAME ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    fromEmail: process.env.SMTP_FROM_EMAIL ?? 'no-reply@example.com',
  },
});
