'use client';

import {
  AreaChart,
  Card,
  CardContent,
  DonutChart,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  type DonutSlice,
} from '@pasta/ui';
import { BarChart3 } from 'lucide-react';

/** The Bookings Overview period select. Values are day counts. */
export const SERIES_PERIODS = [
  { value: '7', label: 'This Week' },
  { value: '30', label: 'This Month' },
  { value: '90', label: 'This Quarter' },
] as const;

export interface DashboardChartsProps {
  series: { day: string; bookings: number }[];
  breakdown: DonutSlice[];
  /** Selected period, in days, as a string — owned by the page that queries it. */
  period: string;
  onPeriodChange: (period: string) => void;
  isLoading?: boolean;
}

/**
 * Bookings Overview and Bookings by Status.
 *
 * The "Revenue Overview" chart drawn beside these was struck from the design,
 * so the two remaining charts share the row.
 *
 * The period select drives its own query — it used to hold local state that
 * nothing read, so picking "This Quarter" relabelled the control and left the
 * chart showing the week.
 */
export function DashboardCharts({
  series,
  breakdown,
  period,
  onPeriodChange,
  isLoading,
}: DashboardChartsProps) {
  const total = breakdown.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <BarChart3 className="text-primary size-5" aria-hidden />
              Bookings Overview
            </h2>
            <Select value={period} onValueChange={onPeriodChange}>
              <SelectTrigger className="h-9 w-36" aria-label="Chart period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERIES_PERIODS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <AreaChart data={series} categoryKey="day" valueKey="bookings" height={280} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Bookings by Status</h2>
          {isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : total === 0 ? (
            // Every slice is zero. The donut would render as an empty ring and
            // the percentages as NaN, so say so instead.
            <EmptyState
              title="No bookings in this range"
              description="Widen the date range to see how bookings break down by status."
              className="py-16"
            />
          ) : (
            <DonutChart
              data={breakdown}
              height={260}
              valueFormatter={(value) => `${value} (${((value / total) * 100).toFixed(1)}%)`}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
