import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  {
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: addressSchema, default: () => ({}) },
  },
  { _id: false }
);

const taxDetailsSchema = new mongoose.Schema(
  {
    taxRegNumber: { type: String, trim: true, default: '' },
    defaultTaxRate: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    currency: { type: String, trim: true, uppercase: true, default: 'INR' },
    allowOfflineBilling: { type: Boolean, default: false },
    enableKDS: { type: Boolean, default: true },
  },
  { _id: false }
);

const branchSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null, index: true },
    restaurantIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }], default: [] },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9_-]+$/, 'Branch code must be alphanumeric with optional hyphens or underscores'],
    },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    addressLine1: { type: String, trim: true, default: '' },
    addressLine2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    stateOrProvince: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    countryCode: { type: String, trim: true, uppercase: true, default: '' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    serviceProfile: { type: String, enum: ['preparation', 'packaged'], default: 'preparation' },
    setupStatus: {
      type: String,
      enum: ['draft', 'ready_for_testing', 'active', 'suspended'],
      index: true,
    },
    archivedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, trim: true, maxlength: 300, default: '' },
    archiveReason: { type: String, trim: true, maxlength: 300, default: '' },
    overrides: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    moduleSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    configurationRevision: { type: Number, default: 0 },
    revision: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Visibility mirror for Part 3 queries. Archived branches are inactive.
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    contact: { type: contactSchema, default: () => ({}) },
    taxDetails: { type: taxDetailsSchema, default: () => ({}) },
    settings: { type: settingsSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

branchSchema.pre('save', function syncBranchLifecycle(next) {
  if (!this.setupStatus) {
    this.setupStatus = this.status === 'inactive' ? 'suspended' : 'active';
  }
  this.contact = this.contact || {};
  this.contact.phone = this.phone || this.contact.phone || '';
  this.contact.email = this.email || this.contact.email || '';
  this.contact.address = {
    street: this.addressLine1 || this.contact.address?.street || '',
    city: this.city || this.contact.address?.city || '',
    state: this.stateOrProvince || this.contact.address?.state || '',
    postalCode: this.postalCode || this.contact.address?.postalCode || '',
    country: this.countryCode || this.contact.address?.country || '',
  };
  if (!this.addressLine1 && this.contact.address.street) this.addressLine1 = this.contact.address.street;
  if (!this.city && this.contact.address.city) this.city = this.contact.address.city;
  if (!this.phone && this.contact.phone) this.phone = this.contact.phone;
  if (!this.email && this.contact.email) this.email = this.contact.email;
  const archived = Boolean(this.archivedAt);
  this.status = archived ? 'inactive' : 'active';
  this.isActive = !archived;
  next();
});

branchSchema.index({ isActive: 1, createdAt: -1 });
branchSchema.index({ companyId: 1, setupStatus: 1 });
branchSchema.index(
  { companyId: 1, code: 1 },
  { unique: true, partialFilterExpression: { companyId: { $type: 'objectId' } } }
);

const Branch = mongoose.models.Branch || mongoose.model('Branch', branchSchema);

export default Branch;
