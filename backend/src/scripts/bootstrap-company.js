import readline from 'readline';
import { connectDB, disconnectDB, sanitizeDatabaseMessage } from '../../config/database.js';
import User from '../modules/auth/user.model.js';
import { isValidEmail, normalizeEmail } from '../modules/auth/auth.service.js';
import Company from '../modules/access/company.model.js';
import Membership from '../modules/access/membership.model.js';
import { claimSuperAdminSlot, ensureSystemRoles } from '../modules/access/authorization.js';
import { SUPER_ADMIN_ROLE_KEY } from '../modules/access/roleTemplates.js';

const ask = (question) => new Promise((resolve) => {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  prompt.question(question, (answer) => {
    prompt.close();
    resolve(answer);
  });
});

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const main = async () => {
  if (process.argv.length > 2) {
    fail('This command does not accept arguments. It will prompt for the company and the existing administrator email.');
    return;
  }
  if (!process.stdin.isTTY) {
    fail('Run this command in an interactive terminal.');
    return;
  }

  const email = normalizeEmail(await ask('Existing administrator email: '));
  const name = (await ask('Company name: ')).trim();
  const code = (await ask('Company code: ')).trim().toUpperCase();

  if (!isValidEmail(email)) {
    fail('Enter a valid email address.');
    return;
  }
  if (!name || name.length > 120) {
    fail('Company name is required and must be 120 characters or fewer.');
    return;
  }
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    fail('Company code must use letters, numbers, hyphens, or underscores.');
    return;
  }

  try {
    await connectDB();
    const user = await User.findOne({ email });
    if (!user) {
      fail('No identity exists for that email. Create it with npm run bootstrap:admin first. Nothing was changed.');
      return;
    }

    let company = await Company.findOne({ code });
    if (!company) {
      company = await Company.create({ name, code, status: 'active', activeSuperAdminCount: 0, accessRevision: 0 });
      console.log(`Created company ${company.code}.`);
    } else if (company.name !== name) {
      console.log(`Using existing company ${company.code} (${company.name}). The name was not changed.`);
    } else {
      console.log(`Using existing company ${company.code}.`);
    }

    const roles = await ensureSystemRoles(company._id);
    const superRole = roles[SUPER_ADMIN_ROLE_KEY];
    const existing = await Membership.findOne({ userId: user._id, companyId: company._id });
    if (existing) {
      const already = existing.companyRoleIds.some((roleId) => String(roleId) === String(superRole._id));
      console.log(already
        ? 'Membership already includes company super admin. No assignment was changed.'
        : 'A membership already exists for this user and company. It was not reassigned.');
      return;
    }

    await Membership.create({
      userId: user._id,
      companyId: company._id,
      status: 'active',
      companyRoleIds: [superRole._id],
      branchAssignments: [],
      authorizationVersion: 1,
    });
    await claimSuperAdminSlot(company._id);
    console.log('Company super admin membership created.');
  } catch (error) {
    fail(sanitizeDatabaseMessage(error.message || 'Company bootstrap failed.'));
  } finally {
    await disconnectDB();
  }
};

main();
