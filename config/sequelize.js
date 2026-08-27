import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// DB_SSL previously had no effect - SSL was always forced on. Honor it now so it can
// actually be turned off for a local/non-SSL postgres instance.
const sslEnabled = process.env.DB_SSL !== 'false';
// rejectUnauthorized defaults to false to match the certificate presented by the
// current managed Postgres provider. Flipping this to true without first confirming
// the deployed provider's cert chain will validate would risk breaking the production
// database connection - set DB_SSL_REJECT_UNAUTHORIZED=true only after verifying that.
const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false,
    dialectOptions: sslEnabled
      ? { ssl: { require: true, rejectUnauthorized: sslRejectUnauthorized } }
      : {},
  }
);
