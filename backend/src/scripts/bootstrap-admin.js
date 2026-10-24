import readline from 'readline';
import { connectDB, disconnectDB, sanitizeDatabaseMessage } from '../../config/database.js';
import User from '../modules/auth/user.model.js';
import { isValidEmail, normalizeEmail, validateNewPassword } from '../modules/auth/auth.service.js';

const ask = (question) => new Promise((resolve) => {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  prompt.question(question, (answer) => {
    prompt.close();
    resolve(answer);
  });
});

const askHidden = (question) => new Promise((resolve, reject) => {
  const stdin = process.stdin;
  const stdout = process.stdout;
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  let value = '';

  const onData = (char) => {
    if (char === '\u0003') {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      reject(new Error('cancelled'));
      return;
    }
    if (char === '\r' || char === '\n' || char === '\u0004') {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      resolve(value);
      return;
    }
    if (char === '\u007f' || char === '\b') {
      value = value.slice(0, -1);
      return;
    }
    value += char;
  };

  stdin.on('data', onData);
});

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const main = async () => {
  if (process.argv.length > 2) {
    fail('This command does not accept arguments. It will prompt for the administrator identity.');
    return;
  }
  if (!process.stdin.isTTY) {
    fail('Run this command in an interactive terminal so the password can be entered without displaying it.');
    return;
  }

  const name = (await ask('Name: ')).trim();
  const email = normalizeEmail(await ask('Email: '));
  const password = await askHidden('Password: ');
  const confirm = await askHidden('Confirm password: ');

  if (!name || name.length > 100) {
    fail('Name is required and must be 100 characters or fewer.');
    return;
  }
  if (!isValidEmail(email)) {
    fail('Enter a valid email address.');
    return;
  }
  if (!validateNewPassword(password)) {
    fail('Password must be between 8 and 256 characters.');
    return;
  }
  if (password !== confirm) {
    fail('Passwords do not match.');
    return;
  }

  try {
    await connectDB();
  } catch (error) {
    fail(`Database is unavailable. ${sanitizeDatabaseMessage(error)}`);
    return;
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      fail('An account with that email already exists. It was not changed.');
      return;
    }

    await User.create({
      name,
      email,
      passwordHash: password,
      status: 'active',
      role: 'SUPER_ADMIN',
      permissions: [],
      authVersion: 0,
    });
    console.log('Administrator identity created. Company and branch access is assigned in a later step.');
  } catch (error) {
    if (error?.code === 11000) {
      fail('An account with that email already exists. It was not changed.');
      return;
    }
    fail('Administrator identity was not created.');
  } finally {
    await disconnectDB();
  }
};

main().catch(() => {
  fail('Administrator identity was not created.');
  process.exit(1);
});
