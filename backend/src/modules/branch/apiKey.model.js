import mongoose from 'mongoose';

const branchApiKeySchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      unique: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    secretHash: { type: String, select: false, default: null },
    keyPrefix: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

branchApiKeySchema.index({ secretHash: 1 }, { sparse: true });

const BranchApiKey = mongoose.models.BranchApiKey || mongoose.model('BranchApiKey', branchApiKeySchema);

export default BranchApiKey;
