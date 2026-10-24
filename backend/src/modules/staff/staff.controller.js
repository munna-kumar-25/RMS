import mongoose from 'mongoose';
import Branch from '../branch/branch.model.js';
import { AccessError, loadAccess } from '../access/authorization.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import * as staff from './staff.service.js';

const handle = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error instanceof AccessError) return sendError(res, error.message, error.statusCode);
    console.error(`[staff] ${error.message}`);
    return sendError(res, 'Unable to complete the staff request.', 500);
  }
};

const accessFor = async (req) => {
  const loaded = await loadAccess(req.user, req.session);
  if (!loaded.active) throw new AccessError('No active company membership.', 403);
  req.access = loaded.active;
  return req.access;
};

const holds = (access, permission, branchId) => {
  if (access.isCompanySuperAdmin || access.companyPermissions.includes(permission)) return true;
  return access.branches.some((branch) => branch.id === String(branchId) && branch.permissions.includes(permission));
};

export const loadManagedBranch = async (req, permission) => {
  const access = await accessFor(req);
  if (!mongoose.isValidObjectId(req.params.branchId)) throw new AccessError('Branch not found.', 404);
  const branch = await Branch.findOne({ _id: req.params.branchId, companyId: access.company._id });
  if (!branch || !holds(access, permission, branch._id)) throw new AccessError('Branch not found.', 404);
  return branch;
};

const resultOf = (result) => result?.body || result;

export const listStaff = handle(async (req, res) => {
  await accessFor(req);
  if (!req.access.isCompanySuperAdmin && !req.access.branches.some((branch) => branch.permissions.includes('staff.read')) && !req.access.companyPermissions.includes('staff.read')) {
    throw new AccessError('You do not have permission for this action.', 403);
  }
  return sendSuccess(res, await staff.listStaff(req), 'Staff retrieved.');
});

export const createStaff = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, { staff: await staff.createStaff(req) }, 'Staff profile created.', 201);
});

export const onboardStaff = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, await staff.onboardStaff(req), 'Staff member and branch login created.', 201);
});

export const getMe = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, await staff.myProfile(req), 'Staff profile retrieved.');
});

export const myShifts = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, { shifts: await staff.myShifts(req) }, 'Shifts retrieved.');
});

export const myAttendance = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, { attendance: await staff.myAttendance(req) }, 'Attendance retrieved.');
});

const selfClock = (mode) => handle(async (req, res) => {
  await accessFor(req);
  const result = await staff.clock(req, { mode, self: true });
  return sendSuccess(res, { attendance: resultOf(result) }, 'Attendance updated.', result.statusCode || 200);
});

export const selfClockIn = selfClock('in');
export const selfStartBreak = selfClock('start-break');
export const selfEndBreak = selfClock('end-break');
export const selfClockOut = selfClock('out');

export const getStaff = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, await staff.getStaff(req), 'Staff profile retrieved.');
});

export const patchStaff = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, { staff: await staff.patchStaff(req) }, 'Staff profile updated.');
});

export const deactivateStaff = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, await staff.deactivateStaff(req), 'Staff profile updated.');
});

export const listAssignments = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, { assignments: await staff.listAssignments(req) }, 'Assignments retrieved.');
});

export const createAssignment = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, { assignment: await staff.createAssignment(req) }, 'Assignment created.', 201);
});

export const patchAssignment = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, { assignment: await staff.patchAssignment(req) }, 'Assignment updated.');
});

export const listTemplates = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'shifts.read');
  return sendSuccess(res, { templates: await staff.listTemplates(branch) }, 'Shift templates retrieved.');
});

export const createTemplate = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'shifts.manage');
  return sendSuccess(res, { template: await staff.createTemplate(req, branch) }, 'Shift template created.', 201);
});

export const patchTemplate = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'shifts.manage');
  return sendSuccess(res, { template: await staff.patchTemplate(req, branch) }, 'Shift template updated.');
});

export const listShifts = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'shifts.read');
  return sendSuccess(res, { shifts: await staff.listShifts(req, branch) }, 'Shifts retrieved.');
});

export const createShift = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'shifts.manage');
  return sendSuccess(res, { shift: await staff.createShift(req, branch) }, 'Shift created.', 201);
});

export const patchShift = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'shifts.manage');
  return sendSuccess(res, { shift: await staff.patchShift(req, branch) }, 'Shift updated.');
});

export const publishShift = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'shifts.manage');
  return sendSuccess(res, { shift: await staff.publishShift(req, branch) }, 'Shift published.');
});

export const cancelShift = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'shifts.manage');
  return sendSuccess(res, { shift: await staff.cancelShift(req, branch) }, 'Shift cancelled.');
});

export const managerClockIn = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'attendance.clock');
  req.params.branchId = String(branch._id);
  const result = await staff.clock(req, { mode: 'in', self: false });
  return sendSuccess(res, { attendance: resultOf(result) }, 'Attendance recorded.', result.statusCode || 200);
});

export const listBranchAttendance = handle(async (req, res) => {
  const branch = await loadManagedBranch(req, 'attendance.read');
  return sendSuccess(res, { attendance: await staff.listBranchAttendance(req, branch) }, 'Attendance retrieved.');
});

export const requestCorrection = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, { request: await staff.requestCorrection(req) }, 'Correction requested.', 201);
});

export const approveCorrection = handle(async (req, res) => {
  await accessFor(req);
  const result = await staff.approveCorrection(req);
  return sendSuccess(res, resultOf(result), 'Correction approved.');
});

export const rejectCorrection = handle(async (req, res) => {
  await accessFor(req);
  const result = await staff.rejectCorrection(req);
  return sendSuccess(res, resultOf(result), 'Correction rejected.');
});

export const approveAttendance = handle(async (req, res) => {
  await accessFor(req);
  const result = await staff.approveAttendance(req);
  return sendSuccess(res, { attendance: resultOf(result) }, 'Attendance approved.');
});

export const listCorrections = handle(async (req, res) => {
  await accessFor(req);
  return sendSuccess(res, { requests: await staff.listCorrections(req) }, 'Correction requests retrieved.');
});

export const exportAttendance = handle(async (req, res) => {
  await accessFor(req);
  if (!req.access.isCompanySuperAdmin && !req.access.branches.some((branch) => branch.permissions.includes('attendance.export')) && !req.access.companyPermissions.includes('attendance.export')) {
    throw new AccessError('You do not have permission for this action.', 403);
  }
  const csv = await staff.exportAttendance(req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
  return res.status(200).send(csv);
});
