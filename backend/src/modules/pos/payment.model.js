import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    posSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PosSession', default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['CASH', 'CARD', 'UPI', 'OTHER'], required: true },
    transactionReference: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['COMPLETED', 'REFUNDED'], default: 'COMPLETED', index: true },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
export default Payment;