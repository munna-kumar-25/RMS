export const getActualRevenueOrders = (orders, branchId = null) => orders.filter((order) => (
  order.status === 'PAID'
  && (!branchId || String(order.branchId) === String(branchId))
));

export const getRevenueTrajectory = (orders, timeRange, now = new Date()) => {
  const buckets = new Map();

  orders.forEach((order) => {
    const date = new Date(order.createdAt);
    if (Number.isNaN(date.getTime())) return;

    const bucketDate = new Date(date);
    let label;
    if (timeRange === 'today') {
      bucketDate.setMinutes(0, 0, 0);
      label = bucketDate.toLocaleTimeString([], { hour: 'numeric' });
    } else if (timeRange === '7d') {
      bucketDate.setHours(0, 0, 0, 0);
      label = bucketDate.toLocaleDateString([], { weekday: 'short' });
    } else if (timeRange === 'all') {
      bucketDate.setDate(1);
      bucketDate.setHours(0, 0, 0, 0);
      label = bucketDate.toLocaleDateString([], { month: 'short', year: 'numeric' });
    } else {
      bucketDate.setHours(0, 0, 0, 0);
      label = bucketDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    const key = bucketDate.getTime();
    const bucket = buckets.get(key) || { label, value: 0 };
    bucket.value += Number(order.grandTotal) || 0;
    buckets.set(key, bucket);
  });

  const sortedBuckets = Array.from(buckets.entries()).sort(([left], [right]) => left - right);
  if (timeRange !== 'all' || sortedBuckets.length === 0) {
    return sortedBuckets.map(([, bucket]) => bucket);
  }

  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstMonth = new Date(sortedBuckets[0][0]);
  if (firstMonth.getTime() === currentMonth.getTime()) firstMonth.setMonth(firstMonth.getMonth() - 1);

  const monthlyTrajectory = [];
  for (const month = firstMonth; month <= currentMonth; month.setMonth(month.getMonth() + 1)) {
    const key = month.getTime();
    monthlyTrajectory.push({
      label: month.toLocaleDateString([], { month: 'short', year: 'numeric' }),
      value: buckets.get(key)?.value || 0,
    });
  }
  return monthlyTrajectory;
};

const revenueSeriesColors = ['#4f46e5', '#0891b2', '#059669', '#e11d48', '#d97706', '#7c3aed', '#2563eb', '#65a30d'];

export const getStackedRevenueTrajectory = (orders, branches, timeRange, now = new Date()) => {
  const series = branches.map((branch, index) => ({
    id: String(branch._id),
    label: branch.name,
    color: revenueSeriesColors[index % revenueSeriesColors.length],
  }));
  const knownBranches = new Set(series.map((item) => item.id));
  const buckets = new Map();

  orders.forEach((order) => {
    const date = new Date(order.createdAt);
    const branchId = String(order.branchId);
    if (Number.isNaN(date.getTime()) || !knownBranches.has(branchId)) return;

    const bucketDate = new Date(date);
    if (timeRange === 'today') {
      bucketDate.setMinutes(0, 0, 0);
    } else if (timeRange === '7d' || timeRange === '30d') {
      bucketDate.setHours(0, 0, 0, 0);
    } else {
      bucketDate.setDate(1);
      bucketDate.setHours(0, 0, 0, 0);
    }

    const key = bucketDate.getTime();
    const bucket = buckets.get(key) || new Map();
    bucket.set(branchId, (bucket.get(branchId) || 0) + (Number(order.grandTotal) || 0));
    buckets.set(key, bucket);
  });

  if (buckets.size === 0) return { series, data: [] };

  let start;
  let end;
  if (timeRange === 'all') {
    start = new Date(Math.min(...buckets.keys()));
    end = new Date(now.getFullYear(), now.getMonth(), 1);
    if (start.getTime() === end.getTime()) start.setMonth(start.getMonth() - 1);
  } else if (timeRange === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setMinutes(0, 0, 0);
    end = new Date(start);
    end.setHours(now.getHours());
  } else {
    const days = timeRange === '7d' ? 6 : 29;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - days);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const data = [];
  const current = new Date(start);
  while (current <= end) {
    const key = current.getTime();
    const label = timeRange === 'all'
      ? current.toLocaleDateString([], { month: 'short', year: 'numeric' })
      : timeRange === 'today'
        ? current.toLocaleTimeString([], { hour: 'numeric' })
        : timeRange === '7d'
          ? current.toLocaleDateString([], { weekday: 'short' })
          : current.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const branchValues = {};
    series.forEach((item) => {
      branchValues[item.id] = buckets.get(key)?.get(item.id) || 0;
    });
    data.push({ label, values: branchValues });

    if (timeRange === 'all') current.setMonth(current.getMonth() + 1);
    else if (timeRange === 'today') current.setHours(current.getHours() + 1);
    else current.setDate(current.getDate() + 1);
  }

  return { series, data };
};

export const getActualRevenueByBranch = (orders, branches, branchId = null) => {
  const revenueByBranch = new Map();

  orders.forEach((order) => {
    if (order.status !== 'PAID') return;
    const orderBranchId = String(order.branchId);
    revenueByBranch.set(
      orderBranchId,
      (revenueByBranch.get(orderBranchId) || 0) + (Number(order.grandTotal) || 0)
    );
  });

  return branches.map((branch) => ({
    label: branch.name.split(' ')[0],
    value: revenueByBranch.get(String(branch._id)) || 0,
    color: branchId && String(branch._id) !== String(branchId) ? '#cbd5e1' : '#4f46e5',
  }));
};
