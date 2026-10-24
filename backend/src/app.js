import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from '../config/env.js';
import { requestId } from './middleware/requestId.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { businessAccessDeferred } from './middleware/businessAccess.js';
import { setupSession } from './modules/auth/session.js';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import {
  accessRoutes,
  companyRoutes,
  membershipRoutes,
  roleRoutes,
  auditRoutes,
} from './modules/access/access.routes.js';
import branchManagementRoutes from './modules/branch/branch.management.routes.js';
import restaurantRoutes from './modules/branch/restaurant.routes.js';
import {
  inventoryOperationsRoutes,
  menuOperationsRoutes,
  orderOperationsRoutes,
  customerAuthOperationsRoutes,
  customerOperationsRoutes,
  paymentOperationsRoutes,
  paymentGatewayPublicRoutes,
  posOperationsRoutes,
  expenseOperationsRoutes,
  recipeOperationsRoutes,
  tableOperationsRoutes,
} from './modules/branch/business.routes.js';
import staffRoutes from './modules/staff/staff.routes.js';
import attendanceRoutes from './modules/staff/attendance.routes.js';
import accountingOperationsRoutes from './modules/accounting/operations.routes.js';

const BUSINESS_PREFIXES = [
  'branches',
  'employees',
  'menu',
  'inventory',
  'orders',
  'tables',
  'payments',
  'pos',
  'recipes',
  'expenses',
];

const mountApi = (app, prefix) => {
  app.use(`${prefix}/health`, healthRoutes);
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/access`, accessRoutes);
  app.use(`${prefix}/companies`, companyRoutes);
  app.use(`${prefix}/roles`, roleRoutes);
  app.use(`${prefix}/memberships`, membershipRoutes);
  app.use(`${prefix}/audit`, auditRoutes);
  app.use(`${prefix}/branches`, branchManagementRoutes);
  app.use(`${prefix}/restaurants`, restaurantRoutes);
  app.use(`${prefix}/menu`, menuOperationsRoutes);
  app.use(`${prefix}/inventory`, inventoryOperationsRoutes);
  app.use(`${prefix}/orders`, orderOperationsRoutes);
  app.use(`${prefix}/customers`, customerOperationsRoutes);
  app.use(`${prefix}/customer-auth`, customerAuthOperationsRoutes);
  app.use(`${prefix}/payments`, paymentGatewayPublicRoutes);
  app.use(`${prefix}/payments`, paymentOperationsRoutes);
  app.use(`${prefix}/pos`, posOperationsRoutes);
  app.use(`${prefix}/expenses`, expenseOperationsRoutes);
  app.use(`${prefix}/recipes`, recipeOperationsRoutes);
  app.use(`${prefix}/tables`, tableOperationsRoutes);
  app.use(`${prefix}/staff`, staffRoutes);
  app.use(`${prefix}/attendance`, attendanceRoutes);
  app.use(`${prefix}/accounting`, accountingOperationsRoutes);
  for (const name of BUSINESS_PREFIXES.filter((item) => !['branches', 'menu', 'inventory', 'orders', 'payments', 'pos', 'expenses', 'recipes', 'tables'].includes(item))) {
    app.use(`${prefix}/${name}`, businessAccessDeferred);
  }
};

export const createApp = ({ sessions = true } = {}) => {
  const app = express();
  const allowedOrigins = new Set(env.CORS_ORIGINS);

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-branch-id', 'X-Branch-Id', 'X-Request-Id', 'X-CSRF-Token', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
  }));
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  if (sessions) setupSession(app);

  mountApi(app, '/api/v1');
  // Compatibility prefix for clients that still call /api/*.
  mountApi(app, '/api');

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default createApp;
