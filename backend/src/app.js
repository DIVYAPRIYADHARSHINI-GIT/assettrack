import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

// Built frontend (frontend/dist). Served by this same service so the app has one URL.
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');

/** CSP hashes for inline <script> blocks in the built index.html (the pre-paint theme script). */
function inlineScriptHashes() {
  try {
    const html = fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
    return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`,
    );
  } catch {
    return [];
  }
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind one proxy; needed for per-IP rate limits
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // QR codes are rendered as data: images; the camera preview uses a blob: MediaStream.
          'img-src': ["'self'", 'data:', 'blob:'],
          'media-src': ["'self'", 'blob:'],
          'connect-src': ["'self'", ...config.corsOrigins],
          // The inline script in index.html applies the saved theme before first paint.
          'script-src': ["'self'", ...inlineScriptHashes()],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  // CORS: same-origin requests (the frontend served by this app) are always allowed;
  // other browser origins must be listed in CORS_ORIGIN.
  const corsMiddleware = (req, res, next) =>
    cors({
      origin(origin, cb) {
        // Non-browser clients (curl, health checks) send no Origin header.
        if (!origin) return cb(null, true);
        const self = `${req.protocol}://${req.get('host')}`;
        if (origin === self || config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} is not allowed`));
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition', 'X-Total-Count'],
      maxAge: 86400,
    })(req, res, next);
  app.use(corsMiddleware);
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

  // Unknown /api routes are JSON 404s, never the SPA page.
  app.use('/api', notFoundHandler);

  if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
    // Hashed assets can be cached forever; index.html must always be revalidated.
    // Note: /assets/* is also an app route (/assets/12), so misses must fall through to the SPA.
    app.use('/assets', express.static(path.join(STATIC_DIR, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(STATIC_DIR, { index: false, maxAge: '1h' }));
    // SPA fallback: client-side routes like /assets/12 or /scan/AT-0001 load index.html.
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (!req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(STATIC_DIR, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => res.json({ name: 'AssetTrack API', health: '/api/health', note: 'Frontend build not found; run `npm run build` at the repo root.' }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
