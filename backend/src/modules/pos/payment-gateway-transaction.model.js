import mongoose from 'mongoose';

const paymentGatewayTransactionSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    provider: { type: String, enum: ['PAYTM', 'PHONEPE'], required: true },
    method: { type: String, enum: ['UPI', 'CARD', 'OTHER'], required: true },
    merchantOrderId: { type: String, required: true, unique: true },
    providerTransactionId: { type: String, trim: true, default: '' },
    checkoutUrl: { type: String, required: true },
    checkoutToken: { type: String, select: false, default: '' },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'], default: 'PENDING', index: true },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    posSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PosSession', default: null },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

paymentGatewayTransactionSchema.index({ branchId: 1, orderId: 1, createdAt: -1 });

const PaymentGatewayTransaction = mongoose.models.PaymentGatewayTransaction
  || mongoose.model('PaymentGatewayTransaction', paymentGatewayTransactionSchema);

export default PaymentGatewayTransaction;
