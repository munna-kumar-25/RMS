import User from './user.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import { AccessError, guardIdentityDisable } from '../access/authorization.js';

const roles = new Set(['SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'WAITER', 'KITCHEN_STAFF', 'ACCOUNTANT']);
const publicEmployee = (user) => user.toJSON();
const permissionModuleMap = { Dashboard: 'SETTINGS', Branches: 'SETTINGS', Employees: 'STAFF', Menu: 'MENU', Inventory: 'INVENTORY', POS: 'POS', Orders: 'POS', Kitchen: 'KITCHEN', Accounting: 'ACCOUNTING', Reports: 'ACCOUNTING', Settings: 'SETTINGS' };
const normalizePermissions = (permissions = []) => permissions.map((permission) => ({ module: permissionModuleMap[permission.module] || permission.module, actions: permission.actions.map((action) => ({ View: 'READ', Create: 'CREATE', Edit: 'UPDATE', Delete: 'DELETE' }[action] || action)) }));

const canAccess = (requestUser, employee) => requestUser.role === 'SUPER_ADMIN' || String(requestUser.branchId) === String(employee.branchId);

export const listEmployees = async (req, res) => {
    try {
        const { search = '', role, status, branchId, page = 1, limit = 20, sort = '-createdAt' } = req.query;
        const query = {};
        const scopedBranchId = req.user.role === 'SUPER_ADMIN' ? branchId : req.user.branchId;
        if (scopedBranchId) query.branchId = scopedBranchId;
        if (role && roles.has(role)) query.role = role;
        if (status) query.isActive = status === 'ACTIVE';
        if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }];

        const pageNumber = Math.max(1, Number(page));
        const pageSize = Math.min(100, Math.max(1, Number(limit)));
        const [users, total] = await Promise.all([
            User.find(query).sort(sort).skip((pageNumber - 1) * pageSize).limit(pageSize),
            User.countDocuments(query),
        ]);
        return sendSuccess(res, { employees: users.map(publicEmployee), pagination: { page: pageNumber, limit: pageSize, total, pages: Math.ceil(total / pageSize) } }, 'Employees retrieved.');
    } catch (error) {
        return sendError(res, 'Unable to retrieve employees.', 500);
    }
};

export const getEmployee = async (req, res) => {
    const employee = await User.findById(req.params.id);
    if (!employee) return sendError(res, 'Employee not found.', 404);
    if (!canAccess(req.user, employee)) return sendError(res, 'You cannot access this branch employee.', 403);
    return sendSuccess(res, publicEmployee(employee), 'Employee retrieved.');
};

export const createEmployee = async (req, res) => {
    try {
        const { name, email, phone = '', password, role, branchId, permissions = [] } = req.body;
        if (!name?.trim() || !email?.trim() || !password || !roles.has(role)) return sendError(res, 'Name, email, password, and valid role are required.', 400);
        if (role !== 'SUPER_ADMIN' && !branchId) return sendError(res, 'Branch assignment is required for this role.', 400);
        if (req.user.role !== 'SUPER_ADMIN' && String(req.user.branchId) !== String(branchId)) return sendError(res, 'You cannot create staff for another branch.', 403);
        const employee = await User.create({ name: name.trim(), email: email.trim().toLowerCase(), phone, password, role, branchId: role === 'SUPER_ADMIN' ? null : branchId, permissions: normalizePermissions(permissions), isActive: true });
        return sendSuccess(res, publicEmployee(employee), 'Employee created.', 201);
    } catch (error) {
        return sendError(res, error.code === 11000 ? 'An employee with this email already exists.' : error.message, error.code === 11000 ? 409 : 400);
    }
};

export const updateEmployee = async (req, res) => {
    const employee = await User.findById(req.params.id);
    if (!employee) return sendError(res, 'Employee not found.', 404);
    if (!canAccess(req.user, employee)) return sendError(res, 'You cannot update this branch employee.', 403);
    const allowed = ['name', 'email', 'phone', 'role', 'branchId', 'permissions'];
    allowed.forEach((field) => {
        if (req.body[field] !== undefined) employee[field] = field === 'email' ? req.body[field].trim().toLowerCase() : field === 'permissions' ? normalizePermissions(req.body[field]) : req.body[field];
    });
    if (req.user.role !== 'SUPER_ADMIN' && String(employee.branchId) !== String(req.user.branchId)) return sendError(res, 'You cannot move staff outside your branch.', 403);
    await employee.save();
    return sendSuccess(res, publicEmployee(employee), 'Employee updated.');
};

export const updateEmployeeStatus = async (req, res) => {
    const employee = await User.findById(req.params.id);
    if (!employee) return sendError(res, 'Employee not found.', 404);
    if (!canAccess(req.user, employee)) return sendError(res, 'You cannot update this branch employee.', 403);
    const enabling = req.body.status === 'ACTIVE' || req.body.isActive === true;
    if (!enabling) {
      try {
        await guardIdentityDisable(employee._id);
      } catch (error) {
        if (error instanceof AccessError) return sendError(res, error.message, error.statusCode);
        return sendError(res, 'Unable to update employee status.', 500);
      }
    }
    employee.isActive = enabling;
    await employee.save();
    return sendSuccess(res, publicEmployee(employee), 'Employee status updated.');
};

export const deleteEmployee = async (req, res) => updateEmployeeStatus({ ...req, body: { isActive: false } }, res);

export const resetEmployeePassword = async (req, res) => {
    const employee = await User.findById(req.params.id).select('+password');
    if (!employee) return sendError(res, 'Employee not found.', 404);
    if (!canAccess(req.user, employee)) return sendError(res, 'You cannot reset this branch employee.', 403);
    if (!req.body.password || req.body.password.length < 8) return sendError(res, 'Password must be at least 8 characters.', 400);
    employee.password = req.body.password;
    await employee.save();
    return sendSuccess(res, null, 'Employee password reset.');
};

export default { listEmployees, getEmployee, createEmployee, updateEmployee, updateEmployeeStatus, deleteEmployee, resetEmployeePassword };