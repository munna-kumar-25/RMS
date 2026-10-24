import mongoose from 'mongoose';

const gatewayCredentialSchema = (metadata) => new mongoose.Schema({
    ciphertext: { type: String, required: true, select: false },
    iv: { type: String, required: true, select: false },
    authTag: { type: String, required: true, select: false },
    configuredAt: { type: Date, required: true },
    ...metadata,
  }, { _id: false });

const paymentGatewayConfigurationSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, unique: true, index: true },
    paytm: { type: gatewayCredentialSchema({
      accountLabel: { type: String, trim: true, default: '' },
      websiteName: { type: String, trim: true, default: 'WEBSTAGING' },
    }), default: undefined },
    phonepe: { type: gatewayCredentialSchema({
      accountLabel: { type: String, trim: true, default: '' },
      clientVersion: { type: Number, min: 1, default: 1 },
    }), default: undefined },
  },
  { timestamps: true }
);

const PaymentGatewayConfiguration = mongoose.models.PaymentGatewayConfiguration
  || mongoose.model('PaymentGatewayConfiguration', paymentGatewayConfigurationSchema);

export default PaymentGatewayConfiguration;
