import mongoose from 'mongoose';

const ingredientLineSchema = new mongoose.Schema(
	{
		ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
		quantity: { type: Number, required: true, min: 0 },
		unit: { type: String, required: true },
		costPerUnit: { type: Number, required: true, min: 0 },
		totalCost: { type: Number, required: true, min: 0 },
	},
	{ _id: false }
);

const recipeSchema = new mongoose.Schema(
	{
		menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true, index: true },
		branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
		ingredients: { type: [ingredientLineSchema], default: [] },
		totalCost: { type: Number, default: 0, min: 0 },
		sellingPrice: { type: Number, default: 0, min: 0 },
		foodCostPercentage: { type: Number, default: 0, min: 0 },
		grossMargin: { type: Number, default: 0 },
		version: { type: Number, default: 1 },
		status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
	},
	{ timestamps: true }
);

recipeSchema.index({ branchId: 1, menuItemId: 1 }, { unique: true });
const Recipe = mongoose.models.Recipe || mongoose.model('Recipe', recipeSchema);
export default Recipe;
