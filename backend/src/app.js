import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';
import assetRoutes from './routes/assets.js';
import repairRoutes from './routes/repairs.js';
import dashboardRoutes from './routes/dashboard.js';
import activityRoutes from './routes/activity.js';
import csvRoutes from './routes/csv.js';
import qrRoutes from './routes/qr.js';
import reportRoutes from './routes/reports.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind one proxy; needed for per-IP rate limits
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser clients (curl, health checks) that send no Origin header.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} is not allowed`));
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition', 'X-Total-Count'],
      maxAge: 86400,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // General API rate limit (generous); login has its own stricter limiter.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.isTest ? 10_000 : 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { message: 'Too many requests, please slow down.' } },
    }),
  );

  app.get('/', (_req, res) => res.json({ name: 'AssetTrack API', health: '/api/health' }));

  app.get('/api/health', async (_req, res) => {
    const started = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'ok', version: config.version, uptime: Math.round(process.uptime()), dbLatencyMs: Date.now() - started, time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable', version: config.version, time: new Date().toISOString() });
    }
  });

  // Public
  app.use('/api/auth', authRoutes);
  app.use('/api/qr', qrRoutes);

  // Authenticated (any role can read; mutating routes add requireAdmin)
  app.use('/api/users', requireAuth, userRoutes);
  app.use('/api/categories', requireAuth, categoryRoutes);
  app.use('/api/assets', requireAuth, assetRoutes);
  app.use('/api/repairs', requireAuth, repairRoutes);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);
  app.use('/api/activity', requireAuth, activityRoutes);
  app.use('/api/csv', requireAuth, csvRoutes);
  app.use('/api/reports', requireAuth, reportRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
