import { AccessError } from '../access/authorization.js';
import { ARCHIVE_LIMITATIONS, buildChecklist } from './branch.checklist.js';

export const assertNewSalesAllowed = (branch) => {
  if (!branch || branch.archivedAt || branch.setupStatus !== 'active') {
    throw new AccessError('This branch is not accepting new sales.', 403);
  }
};

export const lifecyclePlan = async (branch, company, action, { reason = '' } = {}) => {
  const checklist = await buildChecklist(branch, company);
  const current = branch.archivedAt ? 'archived' : branch.setupStatus;
  if (current === 'archived') throw new AccessError('Archived branches cannot change lifecycle.', 409);

  if (action === 'mark-ready') {
    if (current !== 'draft') throw new AccessError('Only a draft branch can be marked ready for testing.', 409);
    if (!checklist.readyForTesting) throw new AccessError('Required branch setup is still incomplete.', 409);
    return { checklist, update: { setupStatus: 'ready_for_testing' } };
  }

  if (action === 'activate') {
    if (current !== 'ready_for_testing') throw new AccessError('Activate a branch only after it is ready for testing.', 409);
    if (!checklist.readyForActivation) {
      const blocked = checklist.items.filter((item) => item.required && item.status !== 'complete').map((item) => item.reason);
      throw new AccessError(`Activation is blocked. ${blocked[0] || 'Required checks are incomplete.'}`, 409);
    }
    return { checklist, update: { setupStatus: 'active', activatedAt: new Date(), suspendedAt: null, suspensionReason: '' } };
  }

  if (action === 'suspend') {
    if (!['active', 'ready_for_testing'].includes(current)) throw new AccessError('This branch cannot be suspended from its current state.', 409);
    if (!String(reason).trim()) throw new AccessError('A suspension reason is required.', 400);
    return {
      checklist,
      update: { setupStatus: 'suspended', suspendedAt: new Date(), suspensionReason: String(reason).trim() },
    };
  }

  if (action === 'resume') {
    if (current !== 'suspended') throw new AccessError('Only a suspended branch can be resumed.', 409);
    if (!checklist.readyForTesting) throw new AccessError('Required branch setup is still incomplete.', 409);
    if (checklist.readyForActivation) {
      return { checklist, update: { setupStatus: 'active', suspendedAt: null, suspensionReason: '' } };
    }
    return { checklist, update: { setupStatus: 'ready_for_testing', suspendedAt: null, suspensionReason: '' } };
  }

  if (action === 'archive') {
    if (!String(reason).trim()) throw new AccessError('An archive reason is required.', 400);
    return {
      checklist,
      limitations: ARCHIVE_LIMITATIONS,
      update: { archivedAt: new Date(), archiveReason: String(reason).trim() },
    };
  }

  throw new AccessError('Unknown lifecycle action.', 400);
};
