import mongoose from 'mongoose';

const branchAssignmentSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    roleIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
    }],
  },
  { _id: false }
);

const membershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active',
      index: true,
    },
    companyRoleIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
    }],
    branchAssignments: {
      type: [branchAssignmentSchema],
      default: [],
    },
    authorizationVersion: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

membershipSchema.index({ userId: 1, companyId: 1 }, { unique: true });

const Membership = mongoose.models.Membership || mongoose.model('Membership', membershipSchema);

export default Membership;
