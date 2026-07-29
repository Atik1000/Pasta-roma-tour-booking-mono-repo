'use client';

import * as React from 'react';

import {
  AreaChart,
  Card,
  CardContent,
  DonutChart,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  type DonutSlice,
} from '@pasta/ui';
import { BarChart3 } from 'lucide-react';

export interface DashboardChartsProps {
  series: { day: string; bookings: number }[];
  breakdown: DonutSlice[];
  isLoading?: boolean;
}

/**
 * Bookings Overview and Bookings by Status.
 *
 * The "Revenue Overview" chart drawn beside these was struck from the design,
 * so the two remaining charts share the row.
 */
export function DashboardCharts({ series, breakdown, isLoading }: DashboardChartsProps) {
  const [range, setRange] = React.useState('week');
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
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
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
