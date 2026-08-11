'use client';

import * as React from 'react';

import { Button, Card, CardContent, Input, Skeleton, useToast } from '@pasta/ui';
import { isApiClientError, type AdminSlot } from '@pasta/api-client';
import { formatClockTime, formatDate } from '@pasta/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { adminApi } from '@/lib/session';

import {
  ScheduleBuilder,
  defaultSchedule,
  scheduleDates,
  scheduleTimes,
  shiftDay,
  today,
  type SlotSchedule,
} from './schedule-builder';

/**
 * Departures for one date.
 *
 * Every row is a real record, so each edit is its own request rather than part
 * of the tour's save. That matches the rules the design states: a time is
 * unique per tour and date, and capacity cannot fall below what is already
 * booked — both are enforced by the API and surfaced here verbatim.
 */
export function TourSlotsPanel({ tourId }: { tourId?: string }) {
  const [date, setDate] = React.useState(today());
  const [draft, setDraft] = React.useState<{ time: string; capacity: string } | null>(null);
  const [schedule, setSchedule] = React.useState<SlotSchedule>(defaultSchedule);
  const [editing, setEditing] = React.useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = React.useState<AdminSlot | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const toast = useToast();

  const queryClient = useQueryClient();
  // Every query below hangs off this prefix, so one invalidation refreshes the
  // visible date and the summary together.
  const slotsKey = ['admin', 'tours', tourId, 'slots'];
  const key = [...slotsKey, date];

  const slots = useQuery({
    queryKey: key,
    queryFn: () => adminApi.admin.tourSlots(tourId!, date),
    enabled: Boolean(tourId),
  });

  const summary = useQuery({
    queryKey: [...slotsKey, 'summary'],
    queryFn: () => adminApi.admin.tourSlotSummary(tourId!),
    enabled: Boolean(tourId),
  });

  function fail(caught: unknown, fallback: string) {
    const message = isApiClientError(caught) ? caught.message : fallback;
    setError(message);
    toast.error('That change was not saved', message);
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: slotsKey });

  const applySchedule = useMutation({
    mutationFn: () =>
      adminApi.admin.createSlotSchedule(tourId!, {
        dates: scheduleDates(schedule),
        times: scheduleTimes(schedule),
        capacity: Number(schedule.capacity) || 0,
      }),
    onSuccess: (result) => {
      setError(null);
      toast.success(
        `${result.created} ${result.created === 1 ? 'departure' : 'departures'} added`,
        result.skipped
          ? `${result.skipped} already existed and were left as they are.`
          : 'Travellers can book these dates now.',
      );
      // Land on the first day of the run, so the table below shows the work.
      setDate(scheduleDates(schedule)[0] ?? date);
      void invalidate();
    },
    onError: (caught) => fail(caught, 'Could not add those departures.'),
  });

  const create = useMutation({
    mutationFn: (payload: { time: string; capacity: number }) =>
      adminApi.admin.createSlot(tourId!, { date, ...payload }),
    onSuccess: () => {
      setError(null);
      setDraft(null);
      toast.success('Departure added');
      void invalidate();
    },
    onError: (caught) => fail(caught, 'Could not add that time slot.'),
  });

  const update = useMutation({
    mutationFn: (input: { slot: AdminSlot; capacity: number }) =>
      adminApi.admin.updateSlot(input.slot.id, {
        date: input.slot.date,
        time: input.slot.time,
        capacity: input.capacity,
      }),
    onSuccess: (_result, input) => {
      setError(null);
      toast.success('Capacity updated');
      setEditing((current) => {
        const next = { ...current };
        delete next[input.slot.id];
        return next;
      });
      void invalidate();
    },
    onError: (caught) => fail(caught, 'Could not update that time slot.'),
  });

  const remove = useMutation({
    mutationFn: (slot: AdminSlot) => adminApi.admin.deleteSlot(slot.id),
    onSuccess: () => {
      setError(null);
      setPendingDelete(null);
      toast.success('Departure removed', 'Its seats are back in the pool.');
      void invalidate();
    },
    onError: (caught) => {
      setPendingDelete(null);
      fail(caught, 'Could not remove that time slot.');
    },
  });

  const rows = slots.data ?? [];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Tour Ticket Availability (Time Slots)</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Manage available time slots for this tour.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            leadingIcon={<Plus aria-hidden />}
            disabled={!tourId || Boolean(draft)}
            onClick={() => setDraft({ time: '09:00', capacity: '20' })}
          >
            Add Time Slot
          </Button>
        </div>

        {!tourId ? (
          <p className="text-muted-foreground rounded-field border-border border border-dashed p-6 text-center text-sm">
            Save the tour first — departures attach to a tour that exists.
          </p>
        ) : (
          <>
            {summary.data && summary.data.upcoming === 0 ? (
              <p
                role="status"
                className="border-warning/30 bg-warning-soft text-warning-foreground rounded-field mb-4 flex items-start gap-2.5 border p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong className="block">This tour has no departures ahead of it.</strong>
                  Until one is scheduled it cannot be booked on the website, published or not. Add a
                  schedule below.
                </span>
              </p>
            ) : summary.data?.nextDate ? (
              <p className="text-muted-foreground mb-4 text-sm">
                {summary.data.upcoming} upcoming{' '}
                {summary.data.upcoming === 1 ? 'departure' : 'departures'}, next on{' '}
                {formatDate(summary.data.nextDate)}
                {summary.data.nextTime ? ` at ${formatClockTime(summary.data.nextTime)}` : ''}.
              </p>
            ) : null}

            <div className="rounded-field border-border mb-5 border p-4">
              <h3 className="text-sm font-semibold">Schedule a run of departures</h3>
              <p className="text-muted-foreground mb-4 mt-0.5 text-sm">
                Fill a stretch of the calendar in one go. Dates that already have a departure at
                that time keep the capacity they have.
              </p>

              <ScheduleBuilder
                value={schedule}
                onChange={setSchedule}
                onApply={() => applySchedule.mutate()}
                isApplying={applySchedule.isPending}
              />
            </div>

            {/* The design pairs the date with step arrows — checking a run of
                consecutive days is the common case, and clicking through a date
                picker for each one is slow. */}
            <div className="mb-4 flex items-center gap-2">
              <Button
                type="button"
                variant="subtle"
                size="icon"
                aria-label="Previous day"
                onClick={() => setDate(shiftDay(date, -1))}
              >
                <ChevronLeft aria-hidden />
              </Button>

              <label htmlFor="slot-date" className="sr-only">
                Departure date
              </label>
              <Input
                id="slot-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value || today())}
                className="h-10 w-48"
              />

              <Button
                type="button"
                variant="subtle"
                size="icon"
                aria-label="Next day"
                onClick={() => setDate(shiftDay(date, 1))}
              >
                <ChevronRight aria-hidden />
              </Button>

              {date !== today() ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDate(today())}>
                  Today
                </Button>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="text-danger-foreground mb-3 text-sm">
                {error}
              </p>
            ) : null}

            <div className="rounded-field border-border overflow-x-auto border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border bg-muted/40 text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Time
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Adult Tickets Available
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Booked
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {slots.isLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-4">
                        <Skeleton className="h-8" />
                      </td>
                    </tr>
                  ) : rows.length === 0 && !draft ? (
                    <tr>
                      <td colSpan={4} className="text-muted-foreground px-4 py-6 text-center">
                        No time slots for {formatDate(date)} yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((slot) => {
                      const pending = editing[slot.id];
                      const changed = pending !== undefined && Number(pending) !== slot.capacity;

                      return (
                        <tr key={slot.id} className="border-border border-b last:border-0">
                          <td className="px-4 py-2.5 font-medium">{formatClockTime(slot.time)}</td>
                          <td className="px-4 py-2.5">
                            <Input
                              type="number"
                              min={slot.booked}
                              value={pending ?? String(slot.capacity)}
                              aria-label={`Tickets available for ${formatClockTime(slot.time)}`}
                              onChange={(event) =>
                                setEditing((current) => ({
                                  ...current,
                                  [slot.id]: event.target.value,
                                }))
                              }
                              className="h-9 w-28"
                            />
                          </td>
                          <td className="text-muted-foreground px-4 py-2.5">{slot.booked}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-1.5">
                              {changed ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-success size-8"
                                  aria-label={`Save capacity for ${formatClockTime(slot.time)}`}
                                  isLoading={update.isPending}
                                  onClick={() =>
                                    update.mutate({ slot, capacity: Number(pending) || 0 })
                                  }
                                >
                                  <Check aria-hidden />
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-danger hover:bg-danger-soft size-8"
                                aria-label={`Delete the ${formatClockTime(slot.time)} departure`}
                                onClick={() => setPendingDelete(slot)}
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {draft ? (
                    <tr className="bg-muted/30 border-border border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <Input
                          type="time"
                          value={draft.time}
                          aria-label="Time for the new departure"
                          onChange={(event) => setDraft({ ...draft, time: event.target.value })}
                          className="h-9 w-32"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min="0"
                          value={draft.capacity}
                          aria-label="Tickets available for the new departure"
                          onChange={(event) => setDraft({ ...draft, capacity: event.target.value })}
                          className="h-9 w-28"
                        />
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5">0</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            isLoading={create.isPending}
                            onClick={() =>
                              create.mutate({
                                time: draft.time,
                                capacity: Number(draft.capacity) || 0,
                              })
                            }
                          >
                            Add
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Discard the new departure"
                            onClick={() => setDraft(null)}
                          >
                            <X aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="rounded-field bg-info-soft text-info-foreground mt-4 flex gap-2.5 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="block">Availability Rules</strong>
            Time is unique for each tour + date. You cannot add duplicate time slots for the same
            date, and tickets available cannot drop below the number already booked.
          </span>
        </p>
      </CardContent>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this departure?"
        description={
          pendingDelete
            ? `${formatClockTime(pendingDelete.time)} on ${formatDate(pendingDelete.date)} will be removed. Departures with bookings cannot be deleted.`
            : ''
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </Card>
  );
}
