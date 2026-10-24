import mongoose from 'mongoose';

const ingredientSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        sku: { type: String, required: true, trim: true, uppercase: true },
        category: { type: String, enum: ['DAIRY', 'MEAT', 'PRODUCE', 'GROCERY', 'BEVERAGES', 'SPICES', 'PACKAGING'], required: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        unit: { type: String, enum: ['KG', 'GRAM', 'GRAMS', 'LITRE', 'LITRES', 'ML', 'PIECE', 'PIECES', 'PACK', 'BOX'], required: true },
        currentStock: { type: Number, default: 0, min: -1000000 },
        minimumStock: { type: Number, default: 0, min: 0 },
        maximumStock: { type: Number, default: 0, min: 0 },
        reorderLevel: { type: Number, default: 0, min: 0 },
        costPerUnit: { type: Number, default: 0, min: 0 },
        supplierId: { type: mongoose.Schema.Types.ObjectId, default: null },
        expiryTracking: { type: Boolean, default: false },
        lifecycleStatus: { type: String, enum: ['DRAFT', 'ACTIVE'], default: 'ACTIVE', index: true },
        draftOpeningStock: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'], default: 'OUT_OF_STOCK', index: true },
    },
    { timestamps: true }
);

ingredientSchema.index({ branchId: 1, sku: 1 }, { unique: true });
ingredientSchema.pre('save', function () {
    this.status = this.currentStock <= 0 ? 'OUT_OF_STOCK' : this.currentStock <= this.minimumStock ? 'LOW_STOCK' : 'IN_STOCK';
});

const stockTransactionSchema = new mongoose.Schema(
    {
        ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true, index: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        type: { type: String, enum: ['OPENING', 'PURCHASE', 'SALE_CONSUMPTION', 'TRANSFER_IN', 'TRANSFER_OUT', 'WASTE', 'ADJUSTMENT', 'RETURN'], required: true },
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryLocation', default: null, index: true },
        quantity: { type: Number, required: true },
        unit: { type: String, required: true },
        previousStock: { type: Number, required: true },
        newStock: { type: Number, required: true },
        referenceType: { type: String, default: '' },
        referenceId: { type: String, default: '' },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        reason: { type: String, default: '' },
    },
    { timestamps: true }
);

const Ingredient = mongoose.models.Ingredient || mongoose.model('Ingredient', ingredientSchema);
export const StockTransaction = mongoose.models.StockTransaction || mongoose.model('StockTransaction', stockTransactionSchema);
export default Ingredient;
