import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  APP_NAME: Joi.string().default('Quiz Service Backend'),
  API_PREFIX: Joi.string().default('api'),
  FRONTEND_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
  VERIFICATION_RESEND_COOLDOWN_SECONDS: Joi.number().integer().min(10).max(3600).default(60),
  VERIFICATION_TOKEN_EXPIRES_HOURS: Joi.number().integer().min(1).max(72).default(24),
  DATABASE_URL: Joi.string()
    .pattern(/^postgres(ql)?:\/\//)
    .default('postgresql://postgres:postgres@localhost:5432/quiz_service?schema=public'),
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().port().default(1025),
  SMTP_USERNAME: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_FROM_EMAIL: Joi.string().email().default('no-reply@example.com'),
  JWT_SECRET: Joi.string().min(16).default('change-me-in-production'),
  JWT_ACCESS_TOKEN_EXPIRES_IN: Joi.string().default('1h'),
});
