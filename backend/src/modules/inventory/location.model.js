import mongoose from 'mongoose';

const inventoryLocationSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    kind: { type: String, enum: ['WAREHOUSE', 'KITCHEN', 'BAR', 'OTHER'], default: 'WAREHOUSE' },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
inventoryLocationSchema.index({ branchId: 1, code: 1 }, { unique: true });
inventoryLocationSchema.index(
  { branchId: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true, isActive: true } }
);

const stockBalanceSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryLocation', required: true },
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    quantity: { type: Number, min: -1000000, default: 0 },
  },
  { timestamps: true }
);
stockBalanceSchema.index({ branchId: 1, locationId: 1, ingredientId: 1 }, { unique: true });

const openingStockLineSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryLocation', required: true },
    quantity: { type: Number, min: 0, required: true },
    unit: { type: String, required: true },
  },
  { _id: false }
);

const openingStockSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, unique: true, index: true },
    status: { type: String, enum: ['DRAFT', 'POSTING', 'POSTED'], default: 'DRAFT', required: true },
    lines: { type: [openingStockLineSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    postedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const InventoryLocation = mongoose.models.InventoryLocation || mongoose.model('InventoryLocation', inventoryLocationSchema);
export const StockBalance = mongoose.models.StockBalance || mongoose.model('StockBalance', stockBalanceSchema);
export const OpeningStock = mongoose.models.OpeningStock || mongoose.model('OpeningStock', openingStockSchema);
