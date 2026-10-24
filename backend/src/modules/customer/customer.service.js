export class CustomerProfileError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'CustomerProfileError';
    this.statusCode = statusCode;
  }
}

export const normalizeCustomerProfile = ({ phone, name, email = '' } = {}) => {
  if (typeof phone !== 'string') throw new CustomerProfileError('Enter a valid 10-digit mobile number.');
  const digits = phone.trim().replace(/\D/g, '');
  const localNumber = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(localNumber)) {
    throw new CustomerProfileError('Enter a valid 10-digit Indian mobile number.');
  }

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    throw new CustomerProfileError('Enter a customer name (up to 120 characters).');
  }

  if (typeof email !== 'string' || email.trim().length > 254) {
    throw new CustomerProfileError('Enter a valid email address.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new CustomerProfileError('Enter a valid email address.');
  }

  return {
    phone: `+91${localNumber}`,
    name: name.trim(),
    email: normalizedEmail,
  };
};

export const customerSearchFilter = (search = '') => {
  if (typeof search !== 'string' || search.trim().length > 80) {
    throw new CustomerProfileError('Customer search must be 80 characters or fewer.');
  }
  const term = search.trim();
  if (!term) return {};

  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(escapedTerm, 'i');
  return { $or: [{ name: expression }, { phone: expression }, { email: expression }] };
};
