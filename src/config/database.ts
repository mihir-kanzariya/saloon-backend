import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'saloon_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    // C.1: Add slow query logging in production (>2000ms)
    logging: process.env.NODE_ENV === 'development'
      ? console.log
      : (sql: string, timing?: number) => {
          if (timing && timing > 2000) {
            console.warn(`[SLOW QUERY ${timing}ms] ${sql}`);
          }
        },
    benchmark: process.env.NODE_ENV !== 'development',
    dialectOptions: process.env.DB_HOST !== 'localhost' ? {
      ssl: { require: true, rejectUnauthorized: false },
    } : {},
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '30', 10),
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000', 10),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10),
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true,
    },
  }
);

export const connectDB = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL connected successfully.');
  } catch (error: any) {
    console.error('Unable to connect to PostgreSQL:', error.message);
    process.exit(1);
  }
};

export { sequelize };
