'use client';

import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pasta/ui';
import { isApiClientError } from '@pasta/api-client';
import { formatClockTime, formatMoney } from '@pasta/utils';
import { useMutation, useQuery } from '@tanstack/react-query';

import { adminApi } from '@/lib/session';

/** Today, as YYYY-MM-DD in the browser's own timezone. */
function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Adds a tour to an existing booking.
 *
 * The choice is tour → date → departure, because a departure only means
 * something once both are known. Sold-out times are shown but not selectable,
 * so an operator can see *why* a time is missing rather than wondering where it
 * went. The server still refuses an oversell; this is only the courtesy.
 */
export function AddBookingItemDialog({
  open,
  onOpenChange,
  reference,
  currency,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reference: string;
  currency: string;
  onAdded: () => void;
}) {
  const [tourId, setTourId] = React.useState('');
  const [date, setDate] = React.useState(today());
  const [slotId, setSlotId] = React.useState('');
  const [quantity, setQuantity] = React.useState('1');
  const [error, setError] = React.useState<string | null>(null);

  const tours = useQuery({
    queryKey: ['admin', 'tours', 'for-booking'],
    queryFn: () => adminApi.admin.tours({ status: 'PUBLISHED', limit: 100 }),
    enabled: open,
  });

  const slots = useQuery({
    queryKey: ['admin', 'tours', tourId, 'slots', date],
    queryFn: () => adminApi.admin.tourSlots(tourId, date),
    enabled: open && Boolean(tourId),
  });

  // A departure chosen for one date must not survive a change of date.
  React.useEffect(() => {
    setSlotId('');
  }, [tourId, date]);

  const add = useMutation({
    mutationFn: () =>
      adminApi.admin.addBookingItem(reference, { slotId, quantity: Number(quantity) || 1 }),
    onSuccess: () => {
      setError(null);
      setTourId('');
      setSlotId('');
      setQuantity('1');
      onAdded();
      onOpenChange(false);
    },
    onError: (caught: unknown) => {
      setError(isApiClientError(caught) ? caught.message : 'Could not add that tour.');
    },
  });

  const selectedTour = tours.data?.data.find((tour) => tour.id === tourId);
  const available = slots.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a tour to {reference}</DialogTitle>
          <DialogDescription>
            Seats are claimed immediately and the booking total is recalculated.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (slotId) add.mutate();
          }}
        >
          <FormField label="Tour" required>
            <Select value={tourId} onValueChange={setTourId}>
              <SelectTrigger>
                <SelectValue placeholder={tours.isLoading ? 'Loading…' : 'Choose a tour'} />
              </SelectTrigger>
              <SelectContent>
                {(tours.data?.data ?? []).map((tour) => (
                  <SelectItem key={tour.id} value={tour.id}>
                    {tour.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Date" required>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value || today())}
            />
          </FormField>

          <FormField
            label="Departure"
            required
            hint={
              tourId && !slots.isLoading && available.length === 0
                ? 'No departures on that date.'
                : undefined
            }
          >
            <Select value={slotId} onValueChange={setSlotId} disabled={!tourId}>
              <SelectTrigger>
                <SelectValue placeholder={tourId ? 'Choose a time' : 'Choose a tour first'} />
              </SelectTrigger>
              <SelectContent>
                {available.map((slot) => {
                  const remaining = slot.capacity - slot.booked;
                  return (
                    <SelectItem key={slot.id} value={slot.id} disabled={remaining <= 0}>
                      {formatClockTime(slot.time)} —{' '}
                      {remaining > 0 ? `${remaining} seat(s) left` : 'sold out'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Tickets"
            required
            error={error ?? undefined}
            hint={
              selectedTour
                ? `${formatMoney(selectedTour.priceEurMinor, currency === 'USD' ? 'USD' : 'EUR')} per adult, at today's catalogue price.`
                : undefined
            }
          >
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={add.isPending} disabled={!slotId}>
              Add Tour
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
