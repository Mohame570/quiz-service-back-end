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
    baseUrl: process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000',
    allowedOrigins: (process.env.FRONTEND_ALLOWED_ORIGINS ?? 'http://localhost:3001,http://localhost:3000').split(',').map((s) => s.trim()),
  },
  verification: {
    resendCooldownSeconds: Number.parseInt(process.env.VERIFICATION_RESEND_COOLDOWN_SECONDS ?? '60', 10),
    tokenExpiresHours: Number.parseInt(process.env.VERIFICATION_TOKEN_EXPIRES_HOURS ?? '24', 10),
  },
  mail: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number.parseInt(process.env.SMTP_PORT ?? '1025', 10),
    username: process.env.SMTP_USERNAME ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    fromEmail: process.env.SMTP_FROM_EMAIL ?? 'no-reply@example.com',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ?? '1h',
  },
});
