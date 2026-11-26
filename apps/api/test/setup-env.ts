import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://vicinity:vicinity_dev_password@localhost:5433/vicinity_test';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = resolve(__dirname, '../storage-test');
process.env.SMTP_HOST = '';
process.env.THROTTLE_LIMIT = '100000';
process.env.API_PUBLIC_URL = 'http://localhost:4000';
process.env.PAYMENT_PROVIDER = 'simulator';
process.env.SIMULATOR_WEBHOOK_SECRET = 'test-simulator-webhook-secret';
process.env.PHONE_OTP_AUTH = 'true';
process.env.OTP_PEPPER = 'test-otp-pepper-0123456789abcdef0123456789';
process.env.SMS_DRIVER = 'dev';
process.env.GOOGLE_CLIENT_IDS = 'test-web-client.apps.googleusercontent.com';
process.env.APPLE_CLIENT_IDS = 'zm.vicinity.app';
