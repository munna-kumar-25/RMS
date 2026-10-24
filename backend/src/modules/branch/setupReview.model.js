import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    itemKey: { type: String, required: true },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String, trim: true, maxlength: 500, default: '' },
    evidenceRef: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { timestamps: true }
);

const SetupReview = mongoose.models.SetupReview || mongoose.model('SetupReview', reviewSchema);

export default SetupReview;
