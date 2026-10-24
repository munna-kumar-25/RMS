import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import Customer from './customer.model.js';
import { customerSearchFilter, CustomerProfileError, normalizeCustomerProfile } from './customer.service.js';

export const listCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({
      branchId: req.branch._id,
      ...customerSearchFilter(req.query.search || ''),
    })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(50)
      .select('name phone email')
      .lean();
    return sendSuccess(res, customers.map((customer) => ({
      id: String(customer._id),
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
    })), 'Customers retrieved.');
  } catch (error) {
    if (error instanceof CustomerProfileError) return sendError(res, error.message, error.statusCode);
    console.error(`[customers] ${error.message}`);
    return sendError(res, 'Customers could not be retrieved.', 500);
  }
};

export const saveCustomer = async (req, res) => {
  try {
    const profile = normalizeCustomerProfile(req.body || {});
    const filter = { branchId: req.branch._id, phone: profile.phone };
    let customer;
    try {
      customer = await Customer.findOneAndUpdate(
        filter,
        {
          $set: { name: profile.name, email: profile.email },
          $setOnInsert: { branchId: req.branch._id, phone: profile.phone, createdBy: req.user?._id || null },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      customer = await Customer.findOneAndUpdate(
        filter,
        { $set: { name: profile.name, email: profile.email } },
        { new: true, runValidators: true }
      );
      if (!customer) throw error;
    }
    return sendSuccess(res, {
      id: String(customer._id),
      phone: customer.phone,
      name: customer.name,
      email: customer.email,
    }, 'Customer saved.');
  } catch (error) {
    if (error instanceof CustomerProfileError) return sendError(res, error.message, error.statusCode);
    console.error(`[customers] ${error.message}`);
    return sendError(res, 'Customer could not be saved.', 500);
  }
};

export default { listCustomers, saveCustomer };
