import mongoose from 'mongoose';

const restaurantSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    image: { type: String, default: '' },
    legacyBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: undefined },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

restaurantSchema.index({ companyId: 1, name: 1 });
restaurantSchema.index(
  { legacyBranchId: 1 },
  { unique: true, partialFilterExpression: { legacyBranchId: { $type: 'objectId' } } }
);

const Restaurant = mongoose.models.Restaurant || mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;
