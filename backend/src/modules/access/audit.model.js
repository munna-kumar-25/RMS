import mongoose from 'mongoose';

const accessAuditSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    action: { type: String, required: true, index: true },
    targetId: { type: String, default: '' },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    requestId: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const AccessAudit = mongoose.models.AccessAudit || mongoose.model('AccessAudit', accessAuditSchema);

export default AccessAudit;
