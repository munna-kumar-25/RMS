import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9_]+$/, 'Role key must use lowercase letters, numbers, and underscores'],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 400,
      default: '',
    },
    scopeType: {
      type: String,
      enum: ['company', 'branch'],
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

roleSchema.index({ companyId: 1, key: 1 }, { unique: true });

const Role = mongoose.models.Role || mongoose.model('Role', roleSchema);

export default Role;
