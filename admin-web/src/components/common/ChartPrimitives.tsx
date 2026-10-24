import React, { useState } from 'react';

const ChartEmptyState: React.FC = () => (
  <div className="h-48 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center">
    <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-lg">
      -
    </div>
    <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">No data available yet</p>
    <p className="mt-1 text-[11px] text-slate-400">Activity will appear here when records are created.</p>
  </div>
);

// =========================================================================
// 1. Interactive Area / Line Chart
// =========================================================================
interface LineChartDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface StackedAreaDataPoint {
  label: string;
  values: Record<string, number>;
}

interface StackedAreaSeries {
  id: string;
  label: string;
  color: string;
}

interface StackedAreaChartProps {
  data: StackedAreaDataPoint[];
  series: StackedAreaSeries[];
  title?: string;
  height?: number;
  valuePrefix?: string;
}

export const StackedAreaChart: React.FC<StackedAreaChartProps> = ({
  data,
  series,
  title,
  height = 280,
  valuePrefix = '₹',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
      {data.length === 0 || series.length === 0 ? <ChartEmptyState /> : (() => {
        const width = 600;
        const paddingX = 56;
        const paddingY = 26;
        const plotWidth = width - paddingX * 2;
        const plotHeight = height - paddingY * 2;
        const totals = data.map((point) => series.reduce((sum, item) => sum + (point.values[item.id] || 0), 0));
        const maxValue = Math.max(...totals, 1);
        const roughTick = maxValue / 5;
        const tickMagnitude = 10 ** Math.floor(Math.log10(roughTick));
        const normalizedTick = roughTick / tickMagnitude;
        const tickMultiplier = normalizedTick <= 1 ? 1 : normalizedTick <= 2 ? 2 : normalizedTick <= 5 ? 5 : 10;
        const tickStep = tickMultiplier * tickMagnitude;
        const axisMax = Math.ceil(maxValue / tickStep) * tickStep;
        const getX = (index: number) => data.length === 1
          ? width / 2
          : paddingX + (index / (data.length - 1)) * plotWidth;
        const getY = (value: number) => height - paddingY - (value / axisMax) * plotHeight;
        const stackedAreas = [];
        const cumulative = data.map(() => 0);

        series.forEach((item) => {
          const lower = [...cumulative];
          const upper = data.map((point, index) => {
            cumulative[index] += point.values[item.id] || 0;
            return cumulative[index];
          });
          const upperPath = upper.map((value, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(value)}`).join(' ');
          const lowerPath = lower.slice().reverse().map((value, reversedIndex) => {
            const index = lower.length - reversedIndex - 1;
            return `L ${getX(index)} ${getY(value)}`;
          }).join(' ');
          stackedAreas.push({ ...item, path: `${upperPath} ${lowerPath} Z`, upperPath });
        });

        const tickValues = Array.from({ length: Math.round(axisMax / tickStep) + 1 }, (_, index) => index * tickStep);
        const hoveredTotal = hoveredIdx === null ? 0 : totals[hoveredIdx];
        const tooltipLeft = hoveredIdx === null ? 0 : (getX(hoveredIdx) / width) * 100;
        const tooltipTop = hoveredIdx === null ? 0 : (getY(hoveredTotal) / height) * 100;
        const labelStep = Math.max(1, Math.ceil(data.length / 6));
        const periodRevenue = totals.reduce((sum, total) => sum + total, 0);

        return (
          <div className="relative w-full overflow-visible select-none">
            <div className="mb-1 flex items-start justify-between gap-4">
              {title && (
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {title}
                </h3>
              )}
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Revenue in range</div>
                <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{valuePrefix}{periodRevenue.toLocaleString()}</div>
              </div>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible" style={{ maxHeight: height }}>
              {tickValues.map((value, index) => {
                const y = getY(value);
                return (
                  <g key={`${value}-${index}`}>
                    <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="4 4" />
                    <text x={paddingX - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-mono">
                      {valuePrefix}{value >= 1000 ? `${(value / 1000).toLocaleString()}k` : value.toLocaleString()}
                    </text>
                  </g>
                );
              })}
              {stackedAreas.map((area) => (
                <path key={area.id} d={area.path} fill={area.color} fillOpacity="0.22" />
              ))}
              {stackedAreas.map((area) => (
                <path key={`${area.id}-boundary`} d={area.upperPath} fill="none" stroke={area.color} strokeOpacity="0.65" strokeWidth="1.25" strokeLinejoin="round" />
              ))}
              <path
                d={totals.map((total, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(total)}`).join(' ')}
                fill="none"
                stroke="#334155"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {totals.map((total, index) => (
                <circle key={`total-${data[index].label}`} cx={getX(index)} cy={getY(total)} r={hoveredIdx === index ? 4.5 : 3} fill="white" stroke="#334155" strokeWidth="2" />
              ))}
              {data.map((point, index) => {
                const left = index === 0 ? paddingX : (getX(index - 1) + getX(index)) / 2;
                const right = index === data.length - 1 ? width - paddingX : (getX(index) + getX(index + 1)) / 2;
                return (
                  <rect
                    key={`${point.label}-${index}`}
                    x={left}
                    y={paddingY}
                    width={Math.max(1, right - left)}
                    height={plotHeight}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIdx(index)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                );
              })}
              {data.map((point, index) => (index % labelStep === 0 || index === data.length - 1) && (
                <text key={`${point.label}-axis-${index}`} x={getX(index)} y={height - 7} textAnchor="middle" className="text-[10px] fill-slate-400 font-medium">
                  {point.label}
                </text>
              ))}
            </svg>
            {hoveredIdx !== null && (
              <div className="absolute z-10 pointer-events-none -translate-x-1/2 -translate-y-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white shadow-xl" style={{ left: `${tooltipLeft}%`, top: `${tooltipTop}%`, marginTop: '-8px' }}>
                <div className="mb-1 font-semibold text-slate-300">{data[hoveredIdx].label}</div>
                {series.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 text-slate-300"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
                    <span className="font-semibold">{valuePrefix}{(data[hoveredIdx].values[item.id] || 0).toLocaleString()}</span>
                  </div>
                ))}
                <div className="mt-1 border-t border-slate-700 pt-1 text-right font-bold">
                  Total {valuePrefix}{hoveredTotal.toLocaleString()}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-2 px-10 pt-1">
              {series.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

interface LineChartProps {
  data: LineChartDataPoint[];
  height?: number;
  valuePrefix?: string;
  lineColor?: string;
  areaGradientFrom?: string;
  areaGradientTo?: string;
}

export const InteractiveLineChart: React.FC<LineChartProps> = ({
  data,
  height = 240,
  valuePrefix = '₹',
  lineColor = '#6366f1', // Indigo 500
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0) return <ChartEmptyState />;

  const width = 600;
  const paddingX = 40;
  const paddingY = 30;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = 0;

  const getX = (index: number) => data.length === 1
    ? width / 2
    : paddingX + (index / (data.length - 1)) * (width - paddingX * 2);

  const getY = (value: number) =>
    height - paddingY - ((value - minValue) / (maxValue - minValue)) * (height - paddingY * 2);

  // Generate SVG path for line
  const points = data.map((d, i) => `${getX(i)},${getY(d.value)}`);
  const pathD = `M ${points.join(' L ')}`;

  // Area path (closed at bottom)
  const areaD = `${pathD} L ${getX(data.length - 1)},${height - paddingY} L ${getX(0)},${height - paddingY
    } Z`;

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        style={{ maxHeight: height }}
      >
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = height - paddingY - ratio * (height - paddingY * 2);
          const val = Math.round(minValue + ratio * (maxValue - minValue));
          return (
            <g key={ratio}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="currentColor"
                className="text-slate-100 dark:text-slate-800"
                strokeDasharray="4 4"
              />
              <text
                x={paddingX - 8}
                y={y + 4}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {valuePrefix}
                {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#areaGradient)" />

        {/* The Line */}
        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive nodes */}
        {data.map((d, idx) => {
          const cx = getX(idx);
          const cy = getY(d.value);
          const isHovered = hoveredIdx === idx;

          return (
            <g
              key={idx}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 6 : 4}
                className="fill-white dark:fill-slate-900 transition-all duration-150"
                stroke={lineColor}
                strokeWidth={isHovered ? 3 : 2}
              />

              {/* X Axis Label */}
              <text
                x={cx}
                y={height - 10}
                textAnchor="middle"
                className="text-[10px] fill-slate-400 font-medium"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover Tooltip Popup */}
      {hoveredIdx !== null && (
        <div
          className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full bg-slate-900 text-white text-xs py-1.5 px-3 rounded-lg shadow-xl border border-slate-800"
          style={{
            left: `${(getX(hoveredIdx) / width) * 100}%`,
            top: `${(getY(data[hoveredIdx].value) / height) * 100}%`,
            marginTop: '-12px',
          }}
        >
          <div className="font-semibold text-[11px] text-slate-300">
            {data[hoveredIdx].label}
          </div>
          <div className="font-bold text-indigo-400 text-sm">
            {valuePrefix}
            {data[hoveredIdx].value.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// 2. Interactive Bar Chart (Branch Comparison)
// =========================================================================
interface BarChartDataPoint {
  label: string;
  value: number;
  subValue?: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartDataPoint[];
  height?: number;
  valuePrefix?: string;
  barColor?: string;
}

export const InteractiveBarChart: React.FC<BarChartProps> = ({
  data,
  height = 240,
  valuePrefix = '₹',
  barColor = '#6366f1',
}) => {
  if (data.length === 0) return <ChartEmptyState />;

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex items-end justify-between gap-4 w-full pt-6 pb-2" style={{ height }}>
      {data.map((item, idx) => {
        const heightPercent = (item.value / maxValue) * 100;
        const isHovered = hoveredIdx === idx;

        return (
          <div
            key={idx}
            className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* Tooltip */}
            {isHovered && (
              <div className="absolute -top-10 bg-slate-900 text-white text-xs py-1 px-2.5 rounded-lg shadow-lg border border-slate-800 whitespace-nowrap z-20">
                <span className="font-bold">
                  {valuePrefix}
                  {item.value.toLocaleString()}
                </span>
              </div>
            )}

            {/* Bar */}
            <div className="w-full max-w-[48px] bg-slate-100 dark:bg-slate-800 rounded-t-xl overflow-hidden h-full flex items-end">
              <div
                className={`w-full rounded-t-xl transition-all duration-300 ${isHovered ? 'brightness-110' : ''
                  }`}
                style={{
                  height: `${heightPercent}%`,
                  backgroundColor: item.color || barColor,
                }}
              />
            </div>

            {/* Label */}
            <span className="mt-2 text-[11px] font-medium text-slate-500 truncate max-w-[70px] text-center">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// =========================================================================
// 3. Interactive Donut Chart (Distribution)
// =========================================================================
interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  innerRadius?: number;
  centerTitle?: string;
  centerSubtitle?: string;
}

export const InteractiveDonutChart: React.FC<DonutChartProps> = ({
  data,
  size = 180,
  centerTitle,
  centerSubtitle,
}) => {
  if (data.length === 0) return <ChartEmptyState />;

  const total = data.reduce((acc, slice) => acc + slice.value, 0) || 1;

  let cumulativeAngle = 0;

  const radius = size / 2;
  const strokeWidth = 26;
  const normalizedRadius = radius - strokeWidth;
  const circumference = normalizedRadius * 2 * Math.PI;

  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-6">
      {/* Donut SVG */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full transform -rotate-90">
          {data.map((slice, idx) => {
            const strokeDashoffset = circumference - (slice.value / total) * circumference;
            const strokeDasharray = `${circumference} ${circumference}`;
            const rotation = cumulativeAngle;
            cumulativeAngle += (slice.value / total) * 360;

            return (
              <circle
                key={idx}
                cx={radius}
                cy={radius}
                r={normalizedRadius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(${rotation} ${radius} ${radius})`}
                className="transition-all duration-300 hover:opacity-90 cursor-pointer"
              />
            );
          })}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centerTitle && (
            <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              {centerTitle}
            </span>
          )}
          {centerSubtitle && (
            <span className="text-[10px] text-slate-400 uppercase font-semibold">
              {centerSubtitle}
            </span>
          )}
        </div>
      </div>

      {/* Legend list */}
      <div className="flex flex-col gap-2 min-w-[140px]">
        {data.map((slice, idx) => {
          const percentage = ((slice.value / total) * 100).toFixed(1);
          return (
            <div key={idx} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  {slice.label}
                </span>
              </div>
              <span className="font-mono font-bold text-slate-900 dark:text-white ml-2">
                {percentage}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const LineChart: React.FC<{
  data: LineChartDataPoint[];
  title?: string;
  height?: number;
  valuePrefix?: string;
  strokeColor?: string;
}> = ({ data, title, height = 240, valuePrefix = '₹', strokeColor = '#4f46e5' }) => {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
      {title && (
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
      )}
      <InteractiveLineChart
        data={data}
        height={height}
        valuePrefix={valuePrefix}
        lineColor={strokeColor}
      />
    </div>
  );
};

export const BarChart: React.FC<{
  data: BarChartDataPoint[];
  title?: string;
  height?: number;
  valuePrefix?: string;
  barColor?: string;
}> = ({ data, title, height = 240, valuePrefix = '₹', barColor = '#4f46e5' }) => {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
      {title && (
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
      )}
      <InteractiveBarChart
        data={data}
        height={height}
        valuePrefix={valuePrefix}
        barColor={barColor}
      />
    </div>
  );
};

export const DonutChart: React.FC<{
  data: DonutSlice[];
  title?: string;
  height?: number;
  size?: number;
  centerTitle?: string;
  centerSubtitle?: string;
}> = ({ data, title, size = 180, centerTitle, centerSubtitle }) => {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
      {title && (
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
      )}
      <InteractiveDonutChart
        data={data}
        size={size}
        centerTitle={centerTitle}
        centerSubtitle={centerSubtitle}
      />
    </div>
  );
};

export default {
  LineChart,
  BarChart,
  DonutChart,
  InteractiveLineChart,
  InteractiveBarChart,
  InteractiveDonutChart,
};

