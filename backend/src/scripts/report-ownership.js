import mongoose from 'mongoose';
import { connectDB, disconnectDB, sanitizeDatabaseMessage } from '../../config/database.js';
import Branch from '../modules/branch/branch.model.js';

const main = async () => {
  if (process.argv.includes('--apply')) {
    console.error('This report does not change data. Remove --apply. Ambiguous records are listed, not assigned.');
    process.exitCode = 1;
    return;
  }
  try {
    await connectDB();
    const missingCompany = await Branch.countDocuments({ companyId: { $exists: false } });
    const nullCompany = await Branch.countDocuments({ companyId: null });
    const withCompany = await Branch.countDocuments({ companyId: { $type: 'objectId' } });
    const total = await Branch.countDocuments();
    console.log(`Branches: ${total}`);
    console.log(`Branches with companyId: ${withCompany}`);
    console.log(`Branches missing companyId: ${missingCompany + nullCompany}`);
    if (missingCompany + nullCompany > 0) {
      const samples = await Branch.find({
        $or: [{ companyId: { $exists: false } }, { companyId: null }],
      }).select('name code').limit(20);
      console.log('These branches were not assigned to a company:');
      for (const branch of samples) console.log(`- ${branch.code} ${branch.name}`);
      console.log('Map them only after ownership is verified. Do not attach them to a default branch.');
    }
    const indexes = await mongoose.connection.collection('branches').indexes();
    const globalCode = indexes.find((index) => index.unique && index.key && index.key.code === 1 && !index.key.companyId);
    if (globalCode) {
      console.log(`A global unique index still exists on branches.code (${globalCode.name}). Drop it before using company-scoped codes.`);
    }
  } catch (error) {
    console.error(sanitizeDatabaseMessage(error.message || 'Ownership report failed.'));
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
};

main();
