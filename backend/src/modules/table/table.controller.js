import Table from './table.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';

const branchFor = (req, requested) => req.user.role === 'SUPER_ADMIN' ? requested : req.user.branchId;
const canAccess = (req, table) => req.user.role === 'SUPER_ADMIN' || String(req.user.branchId) === String(table.branchId);

export const listTables = async (req, res) => {
    const branchId = branchFor(req, req.query.branchId);
    const tables = await Table.find({ ...(branchId ? { branchId } : {}), ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.sectionName ? { sectionName: req.query.sectionName } : {}) }).sort({ sectionName: 1, tableNumber: 1 });
    return sendSuccess(res, tables, 'Tables retrieved.');
};

export const createTable = async (req, res) => {
    try {
        const branchId = branchFor(req, req.body.branchId);
        if (!branchId) return sendError(res, 'Branch assignment is required.', 400);
        const table = await Table.create({ ...req.body, branchId, status: req.body.status || 'AVAILABLE' });
        return sendSuccess(res, table, 'Table created.', 201);
    } catch (error) {
        return sendError(res, error.code === 11000 ? 'Table number already exists in this branch.' : error.message, error.code === 11000 ? 409 : 400);
    }
};

export const getTable = async (req, res) => {
    const table = await Table.findById(req.params.id);
    if (!table) return sendError(res, 'Table not found.', 404);
    if (!canAccess(req, table)) return sendError(res, 'Branch access denied.', 403);
    return sendSuccess(res, table, 'Table retrieved.');
};

export const updateTable = async (req, res) => {
    const table = await Table.findById(req.params.id);
    if (!table) return sendError(res, 'Table not found.', 404);
    if (!canAccess(req, table)) return sendError(res, 'Branch access denied.', 403);
    ['sectionName', 'tableNumber', 'capacity', 'isActive', 'activeOrderId'].forEach((field) => { if (req.body[field] !== undefined) table[field] = req.body[field]; });
    await table.save();
    return sendSuccess(res, table, 'Table updated.');
};

export const updateTableStatus = async (req, res) => {
    const table = await Table.findById(req.params.id);
    if (!table) return sendError(res, 'Table not found.', 404);
    if (!canAccess(req, table)) return sendError(res, 'Branch access denied.', 403);
    if (!['AVAILABLE', 'OCCUPIED', 'ORDERED', 'BILLED', 'NEEDS_CLEANING', 'RESERVED'].includes(req.body.status)) return sendError(res, 'Invalid table status.', 400);
    table.status = req.body.status;
    await table.save();
    return sendSuccess(res, table, 'Table status updated.');
};

export const deleteTable = async (req, res) => {
    const table = await Table.findById(req.params.id);
    if (!table) return sendError(res, 'Table not found.', 404);
    if (!canAccess(req, table)) return sendError(res, 'Branch access denied.', 403);
    await table.deleteOne();
    return sendSuccess(res, null, 'Table deleted.');
};

export default { listTables, createTable, getTable, updateTable, updateTableStatus, deleteTable };
