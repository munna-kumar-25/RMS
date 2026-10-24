import mongoose from 'mongoose';

export const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'ORDERED', 'BILLED', 'NEEDS_CLEANING', 'RESERVED'];

const tableSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch ID is required for table management'],
      index: true,
    },
    sectionName: {
      type: String,
      required: [true, 'Section name is required'],
      trim: true,
      default: 'Main Dining Hall',
    },
    tableNumber: {
      type: String,
      required: [true, 'Table number/label is required'],
      trim: true,
      uppercase: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: [1, 'Table capacity must be at least 1'],
      default: 4,
    },
    status: {
      type: String,
      enum: {
        values: TABLE_STATUSES,
        message: '{VALUE} is not a valid table status',
      },
      default: 'VACANT',
      index: true,
    },
    activeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound multi-tenant unique table identifier
tableSchema.index({ branchId: 1, tableNumber: 1 }, { unique: true });
tableSchema.index({ branchId: 1, status: 1 });
tableSchema.index({ branchId: 1, sectionName: 1 });

const Table = mongoose.models.Table || mongoose.model('Table', tableSchema);

export default Table;
