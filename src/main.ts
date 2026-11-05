process.env.TZ = 'UTC';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './config/env.validation';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });
  // whitelist elimina propiedades no declaradas en los DTO. Se activará `forbidNonWhitelisted`
  // cuando los logs confirmen que ningún cliente envía campos extra.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Número de proxies de confianza delante de la API (Caddy = 1). Necesario para que
  // `req.ip` sea la IP real del cliente y el límite de intentos de PIN funcione por IP.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet());
  app.enableCors({ origin: parseCorsOrigins(process.env.CORS_ORIGINS) });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
