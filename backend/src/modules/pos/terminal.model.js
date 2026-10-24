import mongoose from 'mongoose';

const posTerminalSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    deviceType: { type: String, enum: ['COUNTER', 'TABLET', 'KIOSK'], default: 'COUNTER' },
    receiptPrinterName: { type: String, trim: true, maxlength: 100, default: '' },
    paperWidth: { type: String, enum: ['58mm', '80mm'], default: '80mm' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

posTerminalSchema.index({ branchId: 1, code: 1 }, { unique: true });

const PosTerminal = mongoose.models.PosTerminal || mongoose.model('PosTerminal', posTerminalSchema);
export default PosTerminal;
