import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    companyName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, default: '', maxlength: 254 },
    city: { type: String, trim: true, default: '', maxlength: 100 },
    address: { type: String, trim: true, default: '', maxlength: 300 },
    gstNumber: { type: String, trim: true, uppercase: true, default: '', maxlength: 20 },
    paymentTerms: { type: String, enum: ['IMMEDIATE', 'NET_15', 'NET_30', 'NET_60'], default: 'NET_30' },
    categoriesSupplied: { type: [String], default: [] },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  },
  { timestamps: true }
);

supplierSchema.index({ branchId: 1, companyName: 1 }, { unique: true });

const Supplier = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);

export default Supplier;
