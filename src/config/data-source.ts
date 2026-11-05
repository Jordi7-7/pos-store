process.env.TZ = 'UTC';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { databaseConnectionOptions } from './database.options';

dotenv.config();

export const AppDataSource = new DataSource({
  ...databaseConnectionOptions(),
  logging: process.env.DB_LOGGING === 'true',
  migrations: [path.join(__dirname, '../database/migrations/*.{ts,js}')],
  subscribers: [path.join(__dirname, '../**/*.subscriber.{ts,js}')],
});
