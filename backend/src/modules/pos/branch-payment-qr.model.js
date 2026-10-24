import mongoose from 'mongoose';

const branchPaymentQrSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, unique: true, index: true },
    imageData: { type: Buffer, required: true, select: false },
    mimeType: { type: String, enum: ['image/png', 'image/jpeg', 'image/webp'], required: true },
    fileName: { type: String, trim: true, maxlength: 120, default: 'payment-qr' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const BranchPaymentQr = mongoose.models.BranchPaymentQr
  || mongoose.model('BranchPaymentQr', branchPaymentQrSchema);

export default BranchPaymentQr;
