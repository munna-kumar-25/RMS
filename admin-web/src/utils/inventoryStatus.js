export const isMenuItemStockConfigured = (item) => (
  item.stockTracked === true
  || Number(item.stockQuantity) > 0
  || Number(item.minimumStockQuantity) > 0
);

export const getMenuItemStockStatus = (item) => {
  if (!isMenuItemStockConfigured(item)) return 'NOT_CONFIGURED';
  const stock = Number(item.stockQuantity) || 0;
  const threshold = Number(item.minimumStockQuantity) || 0;
  if (stock <= 0) return 'OUT_OF_STOCK';
  return stock <= threshold ? 'LOW_STOCK' : 'IN_STOCK';
};

export const getMaterialStockStatus = (item) => {
  if (item.lifecycleStatus === 'DRAFT') return 'DRAFT';
  const stock = Number(item.currentStock) || 0;
  const threshold = Number(item.minimumStock) || 0;
  if (stock <= 0) return 'OUT_OF_STOCK';
  return stock <= threshold ? 'LOW_STOCK' : 'IN_STOCK';
};
