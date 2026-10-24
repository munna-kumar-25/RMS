import mongoose from 'mongoose';
import { hashPassword, isPasswordHash, verifyPassword } from './password.js';

export const USER_ROLES = [
  'SUPER_ADMIN',
  'BRANCH_ADMIN',
  'CASHIER',
  'WAITER',
  'KITCHEN_STAFF',
  'ACCOUNTANT',
];

export const PERMISSION_MODULES = [
  'POS',
  'KITCHEN',
  'MENU',
  'INVENTORY',
  'ACCOUNTING',
  'STAFF',
  'SETTINGS',
];

export const PERMISSION_ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE'];

const permissionSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: [true, 'Permission module name is required'],
      enum: {
        values: PERMISSION_MODULES,
        message: '{VALUE} is not a valid permission module',
      },
      uppercase: true,
      trim: true,
    },
    actions: {
      type: [
        {
          type: String,
          enum: {
            values: PERMISSION_ACTIONS,
            message: '{VALUE} is not a valid permission action',
          },
          uppercase: true,
        },
      ],
      validate: {
        validator: function (actions) {
          return Array.isArray(actions) && actions.length > 0;
        },
        message: 'At least one action is required per permission module',
      },
      default: ['READ'],
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User full name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
      index: true,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    // Legacy bcrypt field. New passwords are stored only in passwordHash.
    password: {
      type: String,
      select: false,
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active',
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    authVersion: {
      type: Number,
      default: 0,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      required: [true, 'User role is required'],
      enum: {
        values: USER_ROLES,
        message: '{VALUE} is not an authorized user role',
      },
      uppercase: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    permissions: {
      type: [permissionSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.passwordHash;
        delete ret.authVersion;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.passwordHash;
        delete ret.authVersion;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        return ret;
      },
    },
  }
);

// Compound Indexes for high-performance multi-tenant querying
userSchema.index({ branchId: 1, role: 1, isActive: 1 });
userSchema.index({ branchId: 1, createdAt: -1 });

userSchema.pre('save', async function () {
  if (this.isModified('email') && typeof this.email === 'string') {
    this.email = this.email.trim().toLowerCase();
  }

  if (this.isModified('status')) {
    this.isActive = this.status === 'active';
  } else if (this.isModified('isActive')) {
    this.status = this.isActive ? 'active' : 'disabled';
  }

  const incoming = this.isModified('passwordHash') && this.passwordHash
    ? this.passwordHash
    : (this.isModified('password') && this.password ? this.password : null);

  if (incoming && !isPasswordHash(incoming)) {
    this.passwordHash = await hashPassword(incoming);
    this.password = undefined;
    if (!this.isNew || this.isModified('password') || this.isModified('passwordHash')) {
      this.passwordChangedAt = this.passwordChangedAt || new Date();
    }
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  const stored = this.passwordHash || this.password;
  if (!stored) return false;
  return verifyPassword(candidatePassword, stored);
};

userSchema.methods.accountStatus = function () {
  if (this.status === 'active' || this.status === 'disabled') return this.status;
  return this.isActive === false ? 'disabled' : 'active';
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
