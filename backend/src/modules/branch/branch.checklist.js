import Membership from '../access/membership.model.js';
import Role from '../access/role.model.js';
import { StaffBranchAssignment } from '../staff/staff.models.js';
import { localDate } from '../staff/staff.time.js';
import { resolveConfiguration } from './branch.configuration.js';
import { InventoryLocation, OpeningStock } from '../inventory/location.model.js';
import Recipe from '../inventory/recipe.model.js';
import Order from '../order/order.model.js';
import KOT from '../order/kot.model.js';
import Payment from '../pos/payment.model.js';
import PosTerminal from '../pos/terminal.model.js';
import Table from '../table/table.model.js';
import MenuItem from '../menu/item.model.js';

const check = (key, title, complete, reason, moduleName, required = true, navigationTarget = null, requiredForTesting = required) => ({
  key,
  title,
  status: complete ? 'complete' : 'incomplete',
  required,
  requiredForTesting,
  reason: complete ? '' : reason,
  relatedModule: moduleName,
  navigationTarget,
  manual: false,
});

const notApplicable = (key, title, reason) => ({
  key,
  title,
  status: 'not_applicable',
  required: false,
  reason,
  relatedModule: null,
  navigationTarget: null,
  manual: false,
});

export const managerAssigned = async (branch) => {
  const role = await Role.findOne({ companyId: branch.companyId, key: 'branch_manager' });
  if (!role) return false;
  const count = await Membership.countDocuments({
    companyId: branch.companyId,
    status: 'active',
    branchAssignments: { $elemMatch: { branchId: branch._id, roleIds: role._id } },
  });
  return count > 0;
};

export const buildChecklist = async (branch, company) => {
  const resolved = resolveConfiguration(company, branch);
  const channels = resolved.settings.supportedOrderChannels.value || [];
  const dineIn = channels.includes('dine_in');
  const packaged = branch.serviceProfile === 'packaged';
  const hours = resolved.settings.operatingHours.value;
  const hoursReady = Boolean(hours?.monday && resolved.settings.timezone.value);
  const identityReady = Boolean(branch.name && branch.code && branch.addressLine1 && branch.city && branch.countryCode);
  const hasManager = await managerAssigned(branch);
  const modules = branch.moduleSettings || {};
  const menuPublication = modules.menuPublication;
  const kitchenRouting = modules.kitchenRouting;
  const inventoryPolicies = modules.inventoryPolicies;
  const receiptPrinting = modules.receiptPrinting;
  const taxConfiguration = modules.taxConfiguration;
  const paymentConfiguration = modules.paymentConfiguration;
  const [inventoryLocationReady, openingStockReady, recipeMenuItemIds, activeMenuItemIds, tablesReady, posReady, testOrder] = await Promise.all([
    InventoryLocation.exists({ branchId: branch._id, isActive: true }),
    OpeningStock.exists({ branchId: branch._id, status: 'POSTED' }),
    Recipe.find({ branchId: branch._id, status: 'ACTIVE', ingredients: { $elemMatch: {} } }).distinct('menuItemId'),
    MenuItem.find({ branchId: branch._id, status: 'ACTIVE', availability: true }).distinct('_id'),
    Table.exists({ branchId: branch._id, isActive: true }),
    PosTerminal.exists({ branchId: branch._id, isActive: true }),
    Order.findOne({ branchId: branch._id, setupTest: true, status: 'PAID' }).sort('-createdAt').select('_id'),
  ]);
  const recipeReady = packaged || (
    activeMenuItemIds.length > 0
    && activeMenuItemIds.every((menuItemId) => recipeMenuItemIds.some((recipeMenuItemId) => String(recipeMenuItemId) === String(menuItemId)))
  );
  let testOrderReady = false;
  if (testOrder) {
    const [paymentExists, completedKotExists] = await Promise.all([
      Payment.exists({ branchId: branch._id, orderId: testOrder._id, status: 'COMPLETED' }),
      KOT.exists({ branchId: branch._id, orderId: testOrder._id, status: { $in: ['READY', 'SERVED'] } }),
    ]);
    testOrderReady = Boolean(paymentExists && completedKotExists);
  }
  const today = localDate(new Date(), resolved.settings.timezone.value || 'UTC');
  const staffCoverage = await StaffBranchAssignment.exists({
    companyId: branch.companyId,
    branchId: branch._id,
    startDate: { $lte: today },
    $or: [{ endDate: null }, { endDate: { $gte: today } }],
  });

  const items = [
    check('identity', 'Branch identity and address', identityReady, 'Add the street address, city, and country.', 'branch'),
    check('hours', 'Operating hours and timezone', hoursReady, 'Set a weekly schedule and timezone.', 'branch'),
    check('manager', 'Branch manager assignment', hasManager, 'Assign an active membership with the branch manager role for this branch. A job title is not system authority.', 'access'),
    {
      key: 'staff_coverage',
      title: 'Staff branch assignment',
      status: staffCoverage ? 'complete' : 'incomplete',
      required: false,
      reason: staffCoverage ? 'Employment assignments do not grant login access.' : 'Assign employees on the staff page. A job title does not grant login access.',
      relatedModule: 'staff',
      navigationTarget: '/admin/employees',
      manual: false,
    },
    check('inventory_locations', 'Inventory locations', Boolean(inventoryLocationReady), 'Create and activate a stock location for this branch.', 'inventory', true, `/admin/branches/${branch._id}?tab=setup`, false),
    check('opening_stock', 'Opening stock review', Boolean(openingStockReady), 'Count every inventory item by location, review the opening quantities, and post the opening stock.', 'inventory', true, `/admin/branches/${branch._id}?tab=setup`, false),
    packaged
      ? notApplicable('kitchens', 'Kitchens and stations', 'Packaged-item sales do not require a kitchen.')
      : check(
        'kitchens',
        'Kitchens and stations',
        Boolean(kitchenRouting?.stations?.length),
        'Configure at least one kitchen station in branch configuration.',
        'configuration',
        false
      ),
    check(
      'menu',
      'Branch menu publication',
      Boolean(menuPublication?.published && menuPublication.channels?.length),
      'Publish this branch menu and select at least one order channel in branch configuration.',
      'configuration',
      false
    ),
    check(
      'inventory_policies',
      'Inventory policies',
      Boolean(inventoryPolicies),
      'Save inventory policies in branch configuration.',
      'configuration',
      false
    ),
    packaged
      ? notApplicable('recipes', 'Recipe and stock routing', 'Packaged-item sales do not require recipes.')
      : check('recipes', 'Recipe and stock routing', Boolean(recipeReady), 'Create an active recipe for every available menu item using same-branch inventory ingredients.', 'recipes', true, '/admin/recipes', false),
    dineIn
      ? check('tables', 'Dining areas and tables', Boolean(tablesReady), 'Create at least one active dining table for this branch.', 'tables', true, '/admin/floor', false)
      : notApplicable('tables', 'Dining areas and tables', 'This branch does not take dine-in orders.'),
    check('pos', 'POS terminal configuration', Boolean(posReady), 'Configure at least one active POS terminal for this branch.', 'pos', true, `/admin/branches/${branch._id}?tab=setup`, false),
    check(
      'printing',
      'Receipt printing',
      Boolean(receiptPrinting?.enabled),
      'Enable receipt printing in branch configuration before testing the browser print dialog.',
      'configuration',
      false
    ),
    check(
      'taxes',
      'Taxes and service charges',
      Boolean(taxConfiguration),
      'Review GST and service-charge settings in branch configuration. These are optional for branches that do not use them.',
      'configuration',
      false
    ),
    check(
      'payments',
      'Payment configuration',
      Boolean(paymentConfiguration?.enabledMethods?.length),
      'Choose at least one accepted payment method in branch configuration.',
      'configuration',
      false
    ),
    check('test_order', 'End-to-end test order', testOrderReady, 'Create a setup test order, complete its KOT, and record full payment.', 'orders', true, `/admin/branches/${branch._id}?tab=setup`, false),
  ];

  const measurable = items.filter((item) => item.requiredForTesting && item.status !== 'blocked');
  const complete = measurable.filter((item) => item.status === 'complete').length;
  const blockedCount = items.filter((item) => item.status === 'blocked').length;
  return {
    items,
    progress: {
      implementedRequired: measurable.length,
      complete,
      percent: measurable.length ? Math.round((complete / measurable.length) * 100) : 0,
      blockedModules: blockedCount,
    },
    readyForTesting: items.filter((item) => item.requiredForTesting).every((item) => item.status === 'complete'),
    readyForActivation: items.filter((item) => item.required).every((item) => item.status === 'complete'),
  };
};

export const ARCHIVE_LIMITATIONS = [
  'Open orders are not checked before archive.',
  'Active table orders are not checked before archive.',
  'Outstanding deliveries were not checked because delivery is not implemented.',
  'Open cash sessions are not checked before archive.',
  'Pending transfers were not checked because inventory transfers are not implemented.',
  'Inventory balances are not reconciled before archive.',
];
