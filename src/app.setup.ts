import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { corsOptionsDelegate } from './config/cors.options';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

/**
 * Configuración HTTP común a la aplicación real y a los tests de extremo a extremo, para que
 * lo que se prueba (validación, cabeceras de seguridad, formato de errores) sea lo que se despliega.
 */
export function configureApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });
  // whitelist elimina propiedades no declaradas en los DTO. Se activará `forbidNonWhitelisted`
  // cuando los logs confirmen que ningún cliente envía campos extra.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Número de proxies de confianza delante de la API (Caddy = 1). Necesario para que
  // `req.ip` sea la IP real del cliente y el límite de intentos de login funcione por IP.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet());
  app.enableCors(corsOptionsDelegate(process.env.CORS_ORIGINS));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
}
