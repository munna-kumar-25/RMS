export type Role =
  | 'SUPER_ADMIN'
  | 'BRANCH_ADMIN'
  | 'CASHIER'
  | 'WAITER'
  | 'KITCHEN_STAFF'
  | 'ACCOUNTANT';

export type PermissionModule =
  | 'Dashboard'
  | 'Branches'
  | 'Employees'
  | 'Menu'
  | 'Inventory'
  | 'POS'
  | 'Orders'
  | 'Kitchen'
  | 'Accounting'
  | 'Reports'
  | 'Settings';

export type PermissionAction = 'View' | 'Create' | 'Edit' | 'Delete';

export interface GranularPermission {
  module: PermissionModule;
  actions: PermissionAction[];
}

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface ContactInfo {
  phone: string;
  email: string;
  address: Address;
}

export interface TaxDetails {
  taxRegNumber: string; // GST / VAT
  defaultTaxRate: number; // percentage
}

export interface BranchSettings {
  currency: string;
  allowOfflineBilling: boolean;
  enableKDS: boolean;
  openingTime?: string;
  closingTime?: string;
  timeZone?: string;
}

export interface Branch {
  _id: string;
  restaurantId?: string;
  restaurantIds?: string[];
  name: string;
  code: string;
  contact: ContactInfo;
  taxDetails: TaxDetails;
  settings: BranchSettings;
  managerName?: string;
  managerEmail?: string;
  isActive: boolean;
  todayRevenue: number;
  todayOrders: number;
  employeeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  _id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  roleId?: string;
  membershipId?: string;
  revision?: number;
  permissionModules: string[];
  branchId: string; // branch _id or 'GLOBAL'
  branchName: string;
  permissions: GranularPermission[];
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
  joiningDate: string;
  lastLogin?: string;
}

export type FoodType = 'VEG' | 'NON_VEG' | 'VEGAN' | 'BEVERAGE';

export interface MenuItemVariant {
  name: string;
  price: number;
}

export interface MenuItemAddon {
  name: string;
  price: number;
}

export interface MenuItem {
  _id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  restaurantId?: string;
  description: string;
  price: number;
  costPrice: number;
  taxRate: number;
  foodType: FoodType;
  preparationTimeMinutes: number;
  isAvailable: boolean;
  isAvailableOnline: boolean;
  isAvailablePOS: boolean;
  branchAvailability: string[]; // array of branch IDs
  branchId?: string;
  branchName?: string;
  stockTracked?: boolean;
  stockQuantity?: number;
  minimumStockQuantity?: number;
  variants?: MenuItemVariant[];
  addons?: MenuItemAddon[];
  imageUrl?: string;
  calories?: number;
}

export interface MenuCategory {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  foodType?: FoodType | 'MIXED';
  branchId?: string;
  branchName?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  sortOrder?: number;
  displayOrder: number;
  isActive: boolean;
  itemCount: number;
}

export interface InventoryItem {
  _id: string;
  name: string;
  sku: string;
  category: 'DAIRY' | 'MEAT' | 'PRODUCE' | 'GROCERY' | 'BEVERAGES' | 'SPICES' | 'PACKAGING';
  branchId: string;
  branchName: string;
  currentStock: number;
  unit: 'KG' | 'GRAMS' | 'LITRES' | 'ML' | 'PIECES' | 'PACKS';
  minimumStock: number;
  unitCost: number;
  lifecycleStatus?: 'DRAFT' | 'ACTIVE';
  draftOpeningStock?: number;
  supplierId?: string;
  supplierName?: string;
  expiryDate?: string;
  batchNumber?: string;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  updatedAt: string;
}

export interface RecipeIngredient {
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  cost: number;
}

export interface Recipe {
  _id: string;
  menuItemId: string;
  menuItemName: string;
  categoryName: string;
  ingredients: RecipeIngredient[];
  totalRecipeCost: number;
  sellingPrice: number;
  foodCostPercentage: number;
  grossMarginPercentage: number;
  servingSize: string;
}

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type OrderStatus = 'OPEN' | 'BILLED' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'OTHER' | 'SPLIT';

export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  variant?: string;
  notes?: string;
  status: 'ORDERED' | 'PREPARING' | 'READY' | 'SERVED';
  taxRate?: number;
}

export interface Order {
  _id: string;
  orderNumber: string;
  branchId: string;
  branchName: string;
  tableNumber?: string;
  sectionName?: string;
  orderType: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  serviceChargeAmount?: number;
  taxBreakdown?: {
    taxMode?: 'GST' | 'NONE';
    registrationStateCode?: string;
    placeOfSupplyStateCode?: string;
    cgst?: number;
    sgst?: number;
    igst?: number;
    serviceChargeRate?: number;
    serviceChargeAmount?: number;
  };
  receiptSettings?: {
    name?: string;
    enabled?: boolean;
    paperWidth?: '58mm' | '80mm';
    copies?: number;
    footer?: string;
    gstin?: string;
  };
  enabledPaymentMethods?: PaymentMethod[];
  paymentGatewayProviders?: ('PAYTM' | 'PHONEPE')[];
  discountAmount: number;
  grandTotal: number;
  payment: {
    method: PaymentMethod;
    isPaid: boolean;
    transactionRef?: string;
    paidAt?: string;
  };
  waiterName?: string;
  customerName?: string;
  customerPhone?: string;
  createdAt: string;
}

export type KOTStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';

export interface KOT {
  _id: string;
  kotNumber: string;
  orderId: string;
  orderNumber: string;
  branchId: string;
  branchName: string;
  tableNumber?: string;
  waiterName?: string;
  items: {
    name: string;
    quantity: number;
    notes?: string;
    variant?: string;
  }[];
  status: KOTStatus;
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  elapsedMinutes: number;
  createdAt: string;
}

export type TableStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'ORDERED'
  | 'BILLED'
  | 'NEEDS_CLEANING'
  | 'RESERVED';

export interface DiningTable {
  _id: string;
  branchId: string;
  sectionId: string;
  sectionName: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  activeOrderId?: string;
  activeOrderAmount?: number;
  activeGuests?: number;
  seatedAt?: string;
}

export interface DiningSection {
  _id: string;
  branchId: string;
  name: string; // e.g. 'Indoor AC', 'Outdoor Patio', 'Rooftop', 'VIP'
  description?: string;
  totalTables: number;
}

export interface LedgerAccount {
  _id: string;
  branchId: string;
  accountCode: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  balance: number;
  isSystemAccount: boolean;
  description?: string;
}

export interface AccountingTransaction {
  _id: string;
  transactionId: string;
  branchId: string;
  branchName: string;
  date: string;
  type: 'SALE' | 'PURCHASE' | 'EXPENSE' | 'PAYROLL' | 'TAX_PAYMENT';
  description: string;
  debit: number;
  credit: number;
  paymentMethod: PaymentMethod;
  balance: number;
  referenceId?: string;
}

export type ExpenseCategory =
  | 'Rent'
  | 'Electricity'
  | 'Salary'
  | 'Maintenance'
  | 'Raw Material'
  | 'Transportation'
  | 'Marketing'
  | 'Miscellaneous';

export interface Expense {
  _id: string;
  expenseNumber: string;
  branchId: string;
  branchName: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  taxAmount: number;
  paymentMethod: PaymentMethod;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  paidTo: string;
  date: string;
  receiptUrl?: string;
  notes?: string;
  approvedBy?: string;
}

export interface Supplier {
  _id: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  gstNumber: string;
  paymentTerms: 'IMMEDIATE' | 'NET_15' | 'NET_30' | 'NET_60';
  totalPurchases: number;
  outstandingBalance: number;
  categoriesSupplied: string[];
  status: 'ACTIVE' | 'INACTIVE';
}

export interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  type: 'ALERT' | 'WARNING' | 'SUCCESS' | 'INFO';
  category: 'INVENTORY' | 'KOT' | 'FINANCE' | 'SYSTEM';
  branchId?: string;
  branchName?: string;
  isRead: boolean;
  timestamp: string;
  actionUrl?: string;
}

export interface AuditLogItem {
  _id: string;
  userName: string;
  userRole: Role;
  branchName: string;
  action: string;
  module: PermissionModule;
  oldValue?: string;
  newValue?: string;
  ipAddress: string;
  timestamp: string;
}
