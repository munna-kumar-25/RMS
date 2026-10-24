import readline from 'readline';
import { connectDB, disconnectDB, sanitizeDatabaseMessage } from '../../config/database.js';
import Company from '../modules/access/company.model.js';
import { seedPlaceholderBranches } from '../modules/branch/branch.seed.js';

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
  if (process.env.NODE_ENV === 'production') {
    fail('Refusing to seed placeholder branches when NODE_ENV is production.');
    return;
  }
  if (process.argv.length > 2) {
    fail('This command does not accept arguments.');
    return;
  }
  if (!process.stdin.isTTY) {
    fail('Run this command in an interactive terminal.');
    return;
  }

  const code = (await ask('Company code: ')).trim().toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    fail('Company code must use letters, numbers, hyphens, or underscores.');
    return;
  }

  try {
    await connectDB();
    const company = await Company.findOne({ code });
    if (!company) {
      fail('Company not found. Run npm run bootstrap:company first. Nothing was created.');
      return;
    }
    const results = await seedPlaceholderBranches(company);
    results.forEach((result) => {
      console.log(result.action === 'created' ? `Created ${result.code} as draft.` : `${result.code} already exists and was left unchanged.`);
    });
  } catch (error) {
    fail(sanitizeDatabaseMessage(error.message || 'Branch seed failed.'));
  } finally {
    await disconnectDB();
  }
};

main();
