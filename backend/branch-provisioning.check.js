import assert from 'node:assert/strict';
import { connectDB, disconnectDB } from './config/db.js';
import { createBranchWithAdmin } from './src/modules/branch/branch.service.js';
import Branch from './src/modules/branch/branch.model.js';
import User from './src/modules/auth/user.model.js';
import Table from './src/modules/table/table.model.js';
import Ledger from './src/modules/accounting/ledger.model.js';

const code = `CHECK-${Date.now()}`;
const branch = { name: 'Provisioning check', code, contact: { phone: '1234567890', email: 'check@example.com' } };
const admin = { name: 'Check Admin', email: `${code.toLowerCase()}@example.com`, password: 'Check-password-123' };
let id;
await connectDB();
try {
  const result = await createBranchWithAdmin(branch, admin, { sections: ['Ground Floor', 'First Floor'], tableCount: 4, seedLedgers: false });
  id = result.branch._id;
  assert.equal(result.seededRecords.tablesCount, 4);
  assert.equal(result.seededRecords.ledgersCount, 0);
  assert.equal(result.admin.password, undefined);
  assert.equal(result.admin.role, 'BRANCH_ADMIN');
  const user = await User.findById(result.admin._id).select('+password');
  assert.ok(await user.comparePassword(admin.password));
  await assert.rejects(createBranchWithAdmin(branch, admin), /already exists/);
  const failBranch = { ...branch, code: `${code}-FAIL` };
  const insert = Table.insertMany;
  Table.insertMany = async () => { throw new Error('Simulated table write failure'); };
  try {
    await assert.rejects(createBranchWithAdmin(failBranch, { ...admin, email: `fail-${admin.email}` }), /Simulated/);
  } finally { Table.insertMany = insert; }
  assert.equal(await Branch.countDocuments({ code: failBranch.code }), 0);
  assert.equal(await User.countDocuments({ email: `fail-${admin.email}` }), 0);
  console.log('PASS: branch creation, floor tables, optional ledgers, admin password, duplicate rejection, and standalone failure cleanup');
} finally {
  if (id) {
    await Table.deleteMany({ branchId: id });
    await Ledger.deleteMany({ branchId: id });
    await User.deleteMany({ branchId: id });
    await Branch.deleteOne({ _id: id });
  }
  await disconnectDB();
}
