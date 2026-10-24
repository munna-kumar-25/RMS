import mongoose from 'mongoose';

const idempotencySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    key: { type: String, required: true, maxlength: 200 },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  },
  { timestamps: true }
);

idempotencySchema.index({ companyId: 1, key: 1 }, { unique: true });

const BranchIdempotency = mongoose.models.BranchIdempotency
  || mongoose.model('BranchIdempotency', idempotencySchema);

export default BranchIdempotency;
