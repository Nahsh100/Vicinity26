import 'reflect-metadata';
import 'dotenv/config';
import { loadEnv } from './config/env';
loadEnv();

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { raw } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './config/env';

export async function configureApp(app: NestExpressApplication): Promise<void> {
  const e = env();
  app.setGlobalPrefix('api/v1');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  // Raw bodies only for the local-storage upload endpoint; JSON everywhere else (100 kB limit).
  app.use('/api/v1/media/:id/upload', raw({ type: '*/*', limit: '70mb' }));
  // Payment webhooks are verified over the exact bytes received, so they must not be JSON-parsed.
  app.use('/api/v1/webhooks/payments', raw({ type: '*/*', limit: '256kb' }));
  app.useBodyParser('json', { limit: '100kb' });
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('Vicinity Zambia API')
    .setDescription('Find. Connect. Support Local. Responses are wrapped as { data, meta? }; errors as { error: { code, message, details? } }.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: 'api/docs.json' });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(Logger));
  await configureApp(app);
  await app.listen(env().PORT, '0.0.0.0');
  app.get(Logger).log(`Vicinity API on ${env().API_PUBLIC_URL}/api/v1 — docs at ${env().API_PUBLIC_URL}/api/docs`);
}

if (require.main === module) {
  void bootstrap();
}
