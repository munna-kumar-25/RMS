import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, trim: true, default: '' },
        image: { type: String, trim: true, default: '' },
        foodType: { type: String, enum: ['VEG', 'NON_VEG', 'VEGAN', 'BEVERAGE', 'MIXED'], default: 'MIXED' },
        sortOrder: { type: Number, default: 0 },
        status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    },
    { timestamps: true }
);

categorySchema.index({ branchId: 1, name: 1 }, { unique: true });
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

export const isLegacyGlobalNameIndex = (index) => (
    index.unique
    && Object.keys(index.key || {}).length === 1
    && index.key.name === 1
);

export const reconcileCategoryIndexes = async () => {
    let indexes;
    try {
        indexes = await Category.collection.indexes();
    } catch (error) {
        if (error.code === 26 || error.codeName === 'NamespaceNotFound') {
            await Category.createIndexes();
            return [];
        }
        throw error;
    }

    const obsoleteIndexes = indexes.filter(isLegacyGlobalNameIndex);
    for (const index of obsoleteIndexes) {
        await Category.collection.dropIndex(index.name);
    }
    await Category.createIndexes();
    return obsoleteIndexes.map((index) => index.name);
};

export default Category;
