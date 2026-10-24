import mongoose from 'mongoose';

const posSessionSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    terminalId: { type: mongoose.Schema.Types.ObjectId, ref: 'PosTerminal', required: true },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', required: true },
    openingCash: { type: Number, min: 0, required: true },
    closingCash: { type: Number, min: 0, default: null },
    expectedCash: { type: Number, min: 0, default: null },
    variance: { type: Number, default: null },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    closingNote: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

posSessionSchema.index(
  { terminalId: 1 },
  { unique: true, partialFilterExpression: { status: 'OPEN' } }
);
posSessionSchema.index({ branchId: 1, openedAt: -1 });

const PosSession = mongoose.models.PosSession || mongoose.model('PosSession', posSessionSchema);
export default PosSession;
