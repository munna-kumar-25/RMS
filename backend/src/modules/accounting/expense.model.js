import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
	{
		expenseNumber: { type: String, required: true, unique: true },
		branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
		title: { type: String, required: true, trim: true },
		category: { type: String, required: true, trim: true },
		amount: { type: Number, required: true, min: 0 },
		taxAmount: { type: Number, default: 0, min: 0 },
		paymentMethod: { type: String, enum: ['CASH', 'CARD', 'UPI', 'SPLIT', 'OTHER'], required: true },
		status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
		paidTo: { type: String, required: true, trim: true },
		date: { type: Date, default: Date.now },
		receiptUrl: { type: String, default: '' },
		notes: { type: String, default: '' },
		approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	},
	{ timestamps: true }
);

expenseSchema.index({ branchId: 1, createdAt: -1 });
const Expense = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
export default Expense;
