import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 150 },
        sku: { type: String, required: true, trim: true, uppercase: true },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null, index: true },
        description: { type: String, trim: true, default: '' },
        image: { type: String, trim: true, default: '' },
        stockTracked: { type: Boolean, default: false },
        stockQuantity: { type: Number, default: 0, min: 0 },
        minimumStockQuantity: { type: Number, default: 0, min: 0 },
        foodType: { type: String, enum: ['VEG', 'NON_VEG', 'EGG', 'VEGAN', 'BEVERAGE'], default: 'VEG' },
        price: { type: Number, required: true, min: 0 },
        costPrice: { type: Number, default: 0, min: 0 },
        taxRate: { type: Number, default: 0, min: 0, max: 100 },
        preparationTime: { type: Number, default: 0, min: 0 },
        recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', default: null },
        variants: { type: [{ name: String, price: { type: Number, min: 0 } }], default: [] },
        addOns: { type: [{ name: String, price: { type: Number, min: 0 } }], default: [] },
        availability: { type: Boolean, default: true, index: true },
        onlineAvailability: { type: Boolean, default: true },
        posAvailability: { type: Boolean, default: true },
        status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    },
    { timestamps: true }
);

itemSchema.index({ branchId: 1, sku: 1 }, { unique: true });
itemSchema.index({ branchId: 1, name: 1 });
itemSchema.index({ branchId: 1, restaurantId: 1, status: 1 });
const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', itemSchema);

const menuItemStockTransactionSchema = new mongoose.Schema(
    {
        menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true, index: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        type: { type: String, enum: ['OPENING', 'PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN'], required: true },
        quantity: { type: Number, required: true },
        previousStock: { type: Number, required: true },
        newStock: { type: Number, required: true },
        referenceType: { type: String, default: '' },
        referenceId: { type: String, default: '' },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        reason: { type: String, default: '' },
    },
    { timestamps: true }
);

menuItemStockTransactionSchema.index({ branchId: 1, referenceType: 1, referenceId: 1 });
export const MenuItemStockTransaction = mongoose.models.MenuItemStockTransaction
    || mongoose.model('MenuItemStockTransaction', menuItemStockTransactionSchema);
export default MenuItem;
