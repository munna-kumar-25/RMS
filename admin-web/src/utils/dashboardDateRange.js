export const getDashboardDateRange = (timeRange, now = new Date()) => {
  const end = new Date(now);
  const start = timeRange === 'all' ? new Date(0) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (timeRange === '7d') start.setDate(start.getDate() - 6);
  if (timeRange === '30d') start.setDate(start.getDate() - 29);
  return { start, end };
};
