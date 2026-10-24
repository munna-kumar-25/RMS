import mongoose from 'mongoose';
import { DEPARTMENTS, EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES } from './staff.constants.js';

const staffSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  employeeCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  preferredName: { type: String, default: '', trim: true, maxlength: 80 },
  email: { type: String, default: '', trim: true, lowercase: true, maxlength: 160 },
  phone: { type: String, default: '', trim: true, maxlength: 40 },
  emergencyContact: {
    name: { type: String, default: '', maxlength: 120 },
    phone: { type: String, default: '', maxlength: 40 },
    relationship: { type: String, default: '', maxlength: 80 },
  },
  jobTitle: { type: String, default: '', trim: true, maxlength: 80 },
  department: { type: String, enum: DEPARTMENTS, default: 'other' },
  employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: 'full_time' },
  joiningDate: { type: String, default: '' },
  employmentStatus: { type: String, enum: EMPLOYMENT_STATUSES, default: 'active', index: true },
  terminationDate: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revision: { type: Number, default: 1 },
}, { timestamps: true });

staffSchema.index({ companyId: 1, employeeCode: 1 }, { unique: true });
staffSchema.index(
  { companyId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);

const assignmentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffProfile', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  assignmentType: { type: String, enum: ['primary', 'secondary'], required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, default: null },
  jobTitleOverride: { type: String, default: '', maxlength: 80 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revision: { type: Number, default: 1 },
}, { timestamps: true });

assignmentSchema.index({ staffId: 1, branchId: 1, startDate: 1 });

const templateSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  startLocalTime: { type: String, required: true },
  endLocalTime: { type: String, required: true },
  endsNextDay: { type: Boolean, default: false },
  plannedBreakMinutes: { type: Number, default: 0 },
  gracePeriodMinutes: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  revision: { type: Number, default: 1 },
}, { timestamps: true });

const shiftSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffProfile', required: true, index: true },
  shiftTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftTemplate', default: null },
  templateRevision: { type: Number, default: null },
  shiftDate: { type: String, required: true },
  scheduledStartAt: { type: Date, required: true },
  scheduledEndAt: { type: Date, required: true },
  timezoneSnapshot: { type: String, required: true },
  plannedBreakMinutes: { type: Number, default: 0 },
  gracePeriodMinutes: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'published', 'cancelled'], default: 'draft', index: true },
  notes: { type: String, default: '', maxlength: 500 },
  revision: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

shiftSchema.index({ branchId: 1, scheduledStartAt: 1 });
shiftSchema.index({ staffId: 1, scheduledStartAt: 1, status: 1 });

const breakSchema = new mongoose.Schema({
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, default: null },
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffProfile', required: true, index: true },
  shiftAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftAssignment', default: null },
  attendanceDate: { type: String, required: true },
  clockInAt: { type: Date, required: true },
  clockOutAt: { type: Date, default: null },
  timezoneSnapshot: { type: String, required: true },
  breaks: { type: [breakSchema], default: [] },
  source: { type: String, enum: ['self_service', 'manager', 'correction'], required: true },
  reviewStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  unscheduled: { type: Boolean, default: false },
  originalEvents: { type: mongoose.Schema.Types.Mixed, default: null },
  revision: { type: Number, default: 1 },
}, { timestamps: true });

attendanceSchema.index({ staffId: 1, attendanceDate: 1 });
attendanceSchema.index(
  { staffId: 1 },
  { unique: true, partialFilterExpression: { clockOutAt: null } }
);

const correctionSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  attendanceRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRecord', required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  proposedChanges: { type: mongoose.Schema.Types.Mixed, required: true },
  reason: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewComment: { type: String, default: '', maxlength: 500 },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  revision: { type: Number, default: 1 },
}, { timestamps: true });

correctionSchema.index(
  { attendanceRecordId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

const idempotencySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  key: { type: String, required: true, maxlength: 200 },
  action: { type: String, required: true },
  status: { type: String, enum: ['pending', 'complete'], default: 'pending' },
  statusCode: { type: Number, default: 200 },
  body: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

idempotencySchema.index({ companyId: 1, action: 1, key: 1 }, { unique: true });

const lockSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  lockedUntil: { type: Date, required: true },
});

export const StaffProfile = mongoose.models.StaffProfile || mongoose.model('StaffProfile', staffSchema);
export const StaffBranchAssignment = mongoose.models.StaffBranchAssignment || mongoose.model('StaffBranchAssignment', assignmentSchema);
export const ShiftTemplate = mongoose.models.ShiftTemplate || mongoose.model('ShiftTemplate', templateSchema);
export const ShiftAssignment = mongoose.models.ShiftAssignment || mongoose.model('ShiftAssignment', shiftSchema);
export const AttendanceRecord = mongoose.models.AttendanceRecord || mongoose.model('AttendanceRecord', attendanceSchema);
export const AttendanceCorrectionRequest = mongoose.models.AttendanceCorrectionRequest || mongoose.model('AttendanceCorrectionRequest', correctionSchema);
export const StaffIdempotency = mongoose.models.StaffIdempotency || mongoose.model('StaffIdempotency', idempotencySchema);
export const ScheduleLock = mongoose.models.ScheduleLock || mongoose.model('ScheduleLock', lockSchema);
