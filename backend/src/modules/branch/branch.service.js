import mongoose from 'mongoose';
import Branch from './branch.model.js';
import User, { PERMISSION_MODULES, PERMISSION_ACTIONS } from '../auth/user.model.js';
import Ledger from '../accounting/ledger.model.js';
import Table from '../table/table.model.js';

/**
 * Custom application error with HTTP status code
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Atomic Branch & Admin Provisioning Service
 *
 * Atomically provisions:
 * 1. Branch profile
 * 2. Initial Branch Admin user with full module permissions
 * 3. Default accounting ledgers (Cash on Hand, Sales, Tax, Expense)
 * 4. Default dining tables
 *
 * @param {Object} branchData Data for the new branch
 * @param {Object} adminUserData Data for the initial branch admin user
 * @returns {Promise<{ branch: Object, admin: Object, seededRecords: Object }>}
 */
export const createBranchWithAdmin = async (branchData, adminUserData, floorConfig = {}) => {
  const normalizedCode = typeof branchData.code === 'string' ? branchData.code.trim().toUpperCase() : '';
  const normalizedEmail = typeof adminUserData.email === 'string' ? adminUserData.email.trim().toLowerCase() : '';
  floorConfig = floorConfig || {};

  // 1. Pre-validation checks before starting transaction
  if (!normalizedCode) {
    throw new AppError('Branch code is required', 400);
  }
  if (!normalizedEmail) {
    throw new AppError('Admin email address is required', 400);
  }

  const existingBranch = await Branch.findOne({ code: normalizedCode });
  if (existingBranch) {
    throw new AppError(`A branch with code '${normalizedCode}' already exists.`, 400);
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new AppError(`A user with email '${normalizedEmail}' already exists.`, 400);
  }

  // 2. Start MongoDB Transaction Session
  const session = await mongoose.startSession();
  const topologyType = mongoose.connection.getClient()?.topology?.description?.type;
  let transactionActive = !['Single', 'Unknown'].includes(topologyType);
  let createdBranchId = null;

  try {
    if (transactionActive) {
      session.startTransaction();
    } else {
      console.warn('[BranchService] MongoDB standalone detected. Branch provisioning is running without a transaction.');
    }

    const sessionOpts = transactionActive ? { session } : {};

    // 3. Create and insert Branch document
    const branchToCreate = new Branch({
      ...branchData,
      code: normalizedCode,
    });

    // 4. Construct full CRUD permissions for initial Branch Admin
    const fullPermissions = PERMISSION_MODULES.map((module) => ({
      module,
      actions: [...PERMISSION_ACTIONS],
    }));

    // 5. Create and insert initial Branch Admin User
    const adminUserToCreate = new User({
      name: adminUserData.name,
      email: normalizedEmail,
      password: adminUserData.password,
      phone: adminUserData.phone || '',
      role: 'BRANCH_ADMIN',
      branchId: branchToCreate._id,
      permissions: fullPermissions,
      isActive: true,
    });
    // Validate both documents before writing anything on standalone MongoDB.
    await branchToCreate.validate();
    await adminUserToCreate.validate();
    const createdBranch = await branchToCreate.save(sessionOpts);
    createdBranchId = createdBranch._id;
    const createdAdmin = await adminUserToCreate.save(sessionOpts);

    // 6. Seed Default Accounting Ledgers for the Branch
    const defaultLedgers = [
      {
        branchId: createdBranch._id,
        accountCode: '1010-CASH',
        accountName: 'Cash on Hand',
        accountType: 'ASSET',
        isSystemAccount: true,
        description: 'Primary cash register drawer balance',
      },
      {
        branchId: createdBranch._id,
        accountCode: '4010-SALES',
        accountName: 'Food & Beverage Sales',
        accountType: 'REVENUE',
        isSystemAccount: true,
        description: 'Gross restaurant sales revenue',
      },
      {
        branchId: createdBranch._id,
        accountCode: '2010-TAX',
        accountName: 'Sales Tax / GST Output',
        accountType: 'LIABILITY',
        isSystemAccount: true,
        description: 'Tax collected on restaurant sales',
      },
      {
        branchId: createdBranch._id,
        accountCode: '5010-EXPENSE',
        accountName: 'General Operating Expenses',
        accountType: 'EXPENSE',
        isSystemAccount: true,
        description: 'Petty cash and branch daily expenditures',
      },
    ];

    const seededLedgers = floorConfig.seedLedgers === false ? [] : await Ledger.insertMany(defaultLedgers, sessionOpts);

    // 7. Seed the requested floor layout and table count
    const configuredSections = Array.isArray(floorConfig.sections)
      ? floorConfig.sections
        .filter((section) => typeof section === 'string' && section.trim())
        .map((section) => section.trim())
      : [];
    const sections = configuredSections.length > 0 ? [...new Set(configuredSections)] : ['Ground Floor'];
    const requestedTableCount = Math.min(200, Math.max(1, Number(floorConfig.tableCount) || 1));
    const defaultTables = Array.from({ length: requestedTableCount }, (_, index) => ({
      branchId: createdBranch._id,
      sectionName: sections[index % sections.length],
      tableNumber: `T-${String(index + 1).padStart(2, '0')}`,
      capacity: Math.max(1, Number(floorConfig.defaultCapacity) || 4),
      status: 'AVAILABLE',
    }));

    const seededTables = await Table.insertMany(defaultTables, sessionOpts);

    // 8. Commit Transaction
    if (transactionActive) {
      await session.commitTransaction();
    }

    // Return sanitized outputs
    const sanitizedAdmin = createdAdmin.toJSON();

    return {
      branch: createdBranch.toJSON(),
      admin: sanitizedAdmin,
      seededRecords: {
        ledgersCount: seededLedgers.length,
        tablesCount: seededTables.length,
        sections,
        tables: seededTables.map((table) => table.toJSON()),
      },
    };
  } catch (error) {
    if (transactionActive) {
      await session.abortTransaction();
    } else if (createdBranchId) {
      // Only remove records belonging to this failed provisioning attempt.
      await Table.deleteMany({ branchId: createdBranchId });
      await Ledger.deleteMany({ branchId: createdBranchId });
      await User.deleteMany({ branchId: createdBranchId });
      await Branch.deleteOne({ _id: createdBranchId });
    }

    // Handle Mongo duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'Field';
      throw new AppError(`Duplicate entry detected for ${field}.`, 400);
    }

    // Pass through AppErrors or wrap in 500 AppError
    if (error instanceof AppError) {
      throw error;
    }
    if (error.name === 'ValidationError') {
      throw new AppError(error.message, 400);
    }
    throw new AppError(error.message || 'Failed to provision branch and admin', 500);
  } finally {
    session.endSession();
  }
};

/**
 * List branches with optional filters and pagination
 */
export const getAllBranches = async ({ isActive, search, page = 1, limit = 20, user } = {}) => {
  const query = {};

  if (user?.role === 'BRANCH_ADMIN') {
    query._id = user.branchId;
  }

  if (isActive !== undefined) {
    query.isActive = isActive === true || isActive === 'true';
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);

  const [branches, total] = await Promise.all([
    Branch.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Branch.countDocuments(query),
  ]);

  return {
    branches,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  };
};

/**
 * Retrieve single branch details by ID
 */
export const getBranchById = async (branchId) => {
  if (!mongoose.Types.ObjectId.isValid(branchId)) {
    throw new AppError('Invalid branch ID format.', 400);
  }

  const branch = await Branch.findById(branchId);
  if (!branch) {
    throw new AppError('Branch not found.', 404);
  }

  return branch;
};

export default {
  createBranchWithAdmin,
  getAllBranches,
  getBranchById,
};
