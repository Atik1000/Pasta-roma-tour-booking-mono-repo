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
  useToast,
} from '@pasta/ui';
import { isApiClientError } from '@pasta/api-client';
import { formatMoney } from '@pasta/utils';
import { useMutation, useQuery } from '@tanstack/react-query';

import { adminApi } from '@/lib/session';

/**
 * Adds a tour to an existing booking.
 *
 * Choosing the tour is the whole form. It used to be tour → date → departure,
 * with sold-out times shown but disabled so an operator could see why a slot
 * was missing; tours run on demand now, so there is no date to narrow and
 * nothing to be sold out of. The server still refuses a tour already on the
 * booking — change its quantity instead — and that refusal surfaces here.
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
  const [quantity, setQuantity] = React.useState('1');
  const [error, setError] = React.useState<string | null>(null);

  const toast = useToast();

  const tours = useQuery({
    queryKey: ['admin', 'tours', 'for-booking'],
    queryFn: () => adminApi.admin.tours({ status: 'PUBLISHED', limit: 100 }),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: () =>
      adminApi.admin.addBookingItem(reference, { tourId, quantity: Number(quantity) || 1 }),
    onSuccess: () => {
      setError(null);
      toast.success('Tour added', 'The booking total has been recalculated.');
      setTourId('');
      setQuantity('1');
      onAdded();
      onOpenChange(false);
    },
    onError: (caught: unknown) => {
      const message = isApiClientError(caught) ? caught.message : 'Could not add that tour.';
      setError(message);
      toast.error('Tour not added', message);
    },
  });

  const selectedTour = tours.data?.data.find((tour) => tour.id === tourId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a tour to {reference}</DialogTitle>
          <DialogDescription>The booking total is recalculated immediately.</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (tourId) add.mutate();
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
            <Button type="submit" isLoading={add.isPending} disabled={!tourId}>
              Add Tour
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
