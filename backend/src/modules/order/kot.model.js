import mongoose from 'mongoose';

export const KOT_STATUSES = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'];

const kotItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: [true, 'Item reference is required'],
    },
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Item quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    variant: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    station: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const kotSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference (orderId) is required'],
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch reference (branchId) is required for tenant isolation'],
      index: true,
    },
    kotNumber: {
      type: String,
      required: [true, 'KOT number is required'],
      trim: true,
    },
    items: {
      type: [kotItemSchema],
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: 'KOT must contain at least one item ticket',
      },
      required: true,
    },
    status: {
      type: String,
      enum: {
        values: KOT_STATUSES,
        message: '{VALUE} is not a valid KOT status',
      },
      default: 'PENDING',
      index: true,
    },
    printedAt: {
      type: Date,
      default: null,
    },
    stockDeductedAt: { type: Date, default: null },
    priority: { type: String, enum: ['NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// High-speed KDS and multi-tenant indexes
kotSchema.index({ branchId: 1, createdAt: -1 });
kotSchema.index({ branchId: 1, status: 1 });
kotSchema.index({ orderId: 1, createdAt: -1 });

const KOT = mongoose.models.KOT || mongoose.model('KOT', kotSchema);

export default KOT;
