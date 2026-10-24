import mongoose from 'mongoose';

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

const ledgerSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch ID is required for ledger accounts'],
      index: true,
    },
    accountCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    accountName: {
      type: String,
      required: [true, 'Ledger account name is required'],
      trim: true,
    },
    accountType: {
      type: String,
      required: [true, 'Account type is required'],
      enum: {
        values: ACCOUNT_TYPES,
        message: '{VALUE} is not a valid ledger account type',
      },
      uppercase: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    isSystemAccount: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Multi-tenant indexes
ledgerSchema.index({ branchId: 1, accountName: 1 }, { unique: true });
ledgerSchema.index({ branchId: 1, accountType: 1 });
ledgerSchema.index({ branchId: 1, createdAt: -1 });

const Ledger = mongoose.models.Ledger || mongoose.model('Ledger', ledgerSchema);

export default Ledger;
