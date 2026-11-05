import { Logger } from '@nestjs/common';

// Silencia los logs de Nest durante los tests para que la salida sea legible.
Logger.overrideLogger(false);
