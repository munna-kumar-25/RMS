import Branch from './branch.model.js';

export const PLACEHOLDER_BRANCHES = [
  ['BR-01', 'Branch 01', '1 Placeholder Road', 'Chennai'],
  ['BR-02', 'Branch 02', '2 Placeholder Road', 'Chennai'],
  ['BR-03', 'Branch 03', '3 Placeholder Road', 'Chennai'],
  ['BR-04', 'Branch 04', '4 Placeholder Road', 'Chennai'],
  ['BR-05', 'Branch 05', '5 Placeholder Road', 'Chennai'],
];

export const seedPlaceholderBranches = async (company) => {
  const results = [];
  for (const [code, name, addressLine1, city] of PLACEHOLDER_BRANCHES) {
    const existing = await Branch.findOne({ companyId: company._id, code });
    if (existing) {
      results.push({ code, action: 'skipped' });
      continue;
    }
    await Branch.create({
      companyId: company._id,
      name,
      code,
      description: 'Development placeholder. Not ready for service.',
      addressLine1,
      city,
      stateOrProvince: 'Tamil Nadu',
      postalCode: '600001',
      countryCode: 'IN',
      phone: '0000000000',
      email: `${code.toLowerCase()}@placeholder.local`,
      setupStatus: 'draft',
      overrides: {},
    });
    results.push({ code, action: 'created' });
  }
  return results;
};
