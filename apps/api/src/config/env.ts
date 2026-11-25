import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:3001'),
    API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
    APP_PUBLIC_URL: z.string().url().default('http://localhost:8081'),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage'),
    STORAGE_SIGNING_SECRET: z.string().min(16),
    R2_ACCOUNT_ID: z.string().optional().default(''),
    R2_ACCESS_KEY_ID: z.string().optional().default(''),
    R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
    R2_BUCKET: z.string().default('vicinity-media'),
    R2_PUBLIC_BASE_URL: z.string().optional().default(''),
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASSWORD: z.string().optional().default(''),
    MAIL_FROM: z.string().default('Vicinity <no-reply@vicinity.co.zm>'),
    EXPO_ACCESS_TOKEN: z.string().optional().default(''),
    PUSH_ENABLED: bool.default(true),
    THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
    // ── Payments (plan purchases). none: payments unavailable, the app keeps working. ──
    PAYMENT_PROVIDER: z.enum(['none', 'lenco', 'simulator']).default('none'),
    LENCO_API_URL: z.string().url().default('https://api.lenco.co/access/v2'),
    LENCO_SEC_KEY: z.string().optional().default(''),
    LENCO_WEBHOOK_SIGNATURE_KEY: z.string().optional().default(''),
    SIMULATOR_WEBHOOK_SECRET: z.string().optional().default(''),
    PAYMENT_TTL_MINUTES: z.coerce.number().int().min(2).max(120).default(15),
    // ── Phone sign-in with SMS codes (ported from TUMA). Off by default: real SMS costs money. ──
    PHONE_OTP_AUTH: bool.default(false),
    /** Server secret mixed into OTP hashes (HMAC). 32+ chars; required when PHONE_OTP_AUTH is on. */
    OTP_PEPPER: z.string().optional().default(''),
    /** zamtel: Zamtel Bulk SMS. dev: the code is written to the API log (development only). none: no SMS. */
    SMS_DRIVER: z.enum(['zamtel', 'dev', 'none']).default('dev'),
    ZAMTEL_SMS_API_KEY: z.string().optional().default(''),
    ZAMTEL_SMS_BASE_URL: z.string().url().default('https://bulksms.zamtel.co.zm/api/v2.1/action/send'),
    /** Alphanumeric sender id registered with Zamtel (max 11 characters). */
    SMS_SENDER_ID: z.string().min(1).max(11).default('Vicinity'),
    /** Android SMS Retriever app hash (11 chars), appended so the app can read its own code. Optional. */
    SMS_APP_HASH: z.string().length(11).optional().or(z.literal('')).default(''),
  })
  .superRefine((v, ctx) => {
    if (v.STORAGE_DRIVER === 'r2') {
      for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const) {
        if (!v[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} is required when STORAGE_DRIVER=r2` });
      }
    }
    if (v.NODE_ENV === 'production' && v.STORAGE_DRIVER === 'local') {
      ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'Local storage is for development only' });
    }
    if (v.PAYMENT_PROVIDER === 'lenco' && !v.LENCO_SEC_KEY) ctx.addIssue({ code: 'custom', path: ['LENCO_SEC_KEY'], message: 'LENCO_SEC_KEY is required when PAYMENT_PROVIDER=lenco' });
    if (v.PAYMENT_PROVIDER === 'simulator' && v.SIMULATOR_WEBHOOK_SECRET.length < 16) {
      ctx.addIssue({ code: 'custom', path: ['SIMULATOR_WEBHOOK_SECRET'], message: 'SIMULATOR_WEBHOOK_SECRET (16+ chars) is required for the payment simulator' });
    }
    if (v.PHONE_OTP_AUTH && v.OTP_PEPPER.length < 32) ctx.addIssue({ code: 'custom', path: ['OTP_PEPPER'], message: 'OTP_PEPPER (32+ chars) is required when PHONE_OTP_AUTH=true' });
    if (v.SMS_DRIVER === 'zamtel' && !v.ZAMTEL_SMS_API_KEY) ctx.addIssue({ code: 'custom', path: ['ZAMTEL_SMS_API_KEY'], message: 'ZAMTEL_SMS_API_KEY is required when SMS_DRIVER=zamtel' });
    if (v.NODE_ENV === 'production' && v.PHONE_OTP_AUTH && v.SMS_DRIVER !== 'zamtel') {
      ctx.addIssue({ code: 'custom', path: ['SMS_DRIVER'], message: 'Phone sign-in in production needs SMS_DRIVER=zamtel' });
    }
    if (v.NODE_ENV === 'production') {
      if (v.PAYMENT_PROVIDER === 'simulator') ctx.addIssue({ code: 'custom', path: ['PAYMENT_PROVIDER'], message: 'The payment simulator cannot run in production' });
      if (v.PAYMENT_PROVIDER === 'lenco' && !v.LENCO_WEBHOOK_SIGNATURE_KEY) {
        ctx.addIssue({ code: 'custom', path: ['LENCO_WEBHOOK_SIGNATURE_KEY'], message: 'LENCO_WEBHOOK_SIGNATURE_KEY is required in production (webhooks cannot be verified without it)' });
      }
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  cached = parsed.data;
  return cached;
}

export function env(): Env {
  return cached ?? loadEnv();
}

export const ENV = Symbol('ENV');
