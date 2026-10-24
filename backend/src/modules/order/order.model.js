import mongoose from 'mongoose';

export const ORDER_TYPES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'];
export const ORDER_STATUSES = ['OPEN', 'BILLED', 'PAID', 'CANCELLED'];
export const ORDER_ITEM_STATUSES = ['ORDERED', 'PREPARING', 'READY', 'SERVED'];
export const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'OTHER', 'SPLIT'];

const orderItemSchema = new mongoose.Schema(
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
    price: {
      type: Number,
      required: [true, 'Item unit price is required'],
      min: [0, 'Item price cannot be negative'],
    },
    taxRate: { type: Number, min: 0, max: 100, default: 0 },
    quantity: {
      type: Number,
      required: [true, 'Item quantity is required'],
      min: [1, 'Item quantity must be at least 1'],
      default: 1,
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
    status: {
      type: String,
      enum: {
        values: ORDER_ITEM_STATUSES,
        message: '{VALUE} is not a valid item status',
      },
      default: 'ORDERED',
    },
  },
  { _id: true }
);

const paymentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: {
        values: PAYMENT_METHODS,
        message: '{VALUE} is not a valid payment method',
      },
      default: 'CASH',
    },
    isPaid: {
      type: Boolean,
      default: false,
      index: true,
    },
    transactionRef: {
      type: String,
      trim: true,
      default: '',
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const deliveryAddressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, maxlength: 160, default: '' },
    line2: { type: String, trim: true, maxlength: 160, default: '' },
    city: { type: String, trim: true, maxlength: 100, default: '' },
    state: { type: String, trim: true, maxlength: 100, default: '' },
    postalCode: { type: String, trim: true, maxlength: 20, default: '' },
    instructions: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false }
);

const deliveryLocationSchema = new mongoose.Schema(
  {
    latitude: { type: Number, min: -90, max: 90, required: true },
    longitude: { type: Number, min: -180, max: 180, required: true },
    accuracyMeters: { type: Number, min: 0, default: null },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch ID is required for tenant isolation'],
      index: true,
    },
    orderNumber: {
      type: String,
      required: [true, 'Order sequence number is required'],
      trim: true,
    },
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Table',
      default: null,
      index: true,
    },
    customerName: { type: String, trim: true, maxlength: 120, default: '' },
    customerPhone: { type: String, trim: true, maxlength: 30, default: '' },
    deliveryAddress: { type: deliveryAddressSchema, default: undefined },
    deliveryLocation: { type: deliveryLocationSchema, default: undefined },
    tableNumber: { type: String, trim: true, maxlength: 30, default: '' },
    sectionName: { type: String, trim: true, maxlength: 80, default: '' },
    setupTest: { type: Boolean, default: false, index: true },
    orderType: {
      type: String,
      enum: {
        values: ORDER_TYPES,
        message: '{VALUE} is not an authorized order type',
      },
      default: 'DINE_IN',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ORDER_STATUSES,
        message: '{VALUE} is not a valid order status',
      },
      default: 'OPEN',
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: 'Order must contain at least one line item',
      },
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal cannot be negative'],
      default: 0,
    },
    taxAmount: {
      type: Number,
      required: true,
      min: [0, 'Tax amount cannot be negative'],
      default: 0,
    },
    serviceChargeAmount: { type: Number, min: 0, default: 0 },
    taxBreakdown: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    receiptSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    enabledPaymentMethods: { type: [String], default: ['CASH'] },
    discountAmount: {
      type: Number,
      min: [0, 'Discount amount cannot be negative'],
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: [0, 'Grand total cannot be negative'],
      default: 0,
    },
    payment: {
      type: paymentSchema,
      default: () => ({}),
    },
    cashierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    waiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// High throughput multi-tenant querying indexes
orderSchema.index({ branchId: 1, createdAt: -1 });
orderSchema.index({ branchId: 1, status: 1, createdAt: -1 });
orderSchema.index({ branchId: 1, orderNumber: 1 });
orderSchema.index({ branchId: 1, tableId: 1, status: 1 });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
