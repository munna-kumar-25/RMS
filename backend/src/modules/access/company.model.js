import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9_-]+$/, 'Company code must be alphanumeric with optional hyphens or underscores'],
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true,
    },
    accessRevision: {
      type: Number,
      default: 0,
    },
    activeSuperAdminCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    branchDefaults: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    attendancePolicy: {
      allowUnscheduled: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

const Company = mongoose.models.Company || mongoose.model('Company', companySchema);

export default Company;
