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
  useToast,
} from '@pasta/ui';
import { isApiClientError } from '@pasta/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { adminApi } from '@/lib/session';

/**
 * "Add New Location" from the tours toolbar. A location is two fields, so it
 * gets a dialog rather than a page of its own.
 */
export function AddLocationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState('');
  const [country, setCountry] = React.useState('Italy');
  const [error, setError] = React.useState<string | null>(null);

  const toast = useToast();

  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => adminApi.admin.createLocation({ name: name.trim(), country: country.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tours'] });
      toast.success('Location added', `${name.trim()} is now available to tours.`);
      setName('');
      setError(null);
      onOpenChange(false);
    },
    onError: (caught: unknown) => {
      const message = isApiClientError(caught)
        ? caught.message
        : 'Could not add that location. Please try again.';
      setError(message);
      toast.error('Location not added', message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Location</DialogTitle>
          <DialogDescription>
            Locations appear in the tour editor and in the public destination filters.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length >= 2) create.mutate();
          }}
        >
          <FormField label="Name" required error={error ?? undefined}>
            <Input
              value={name}
              placeholder="Milan, Italy"
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
            />
          </FormField>

          <FormField label="Country" required>
            <Input
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              required
              minLength={2}
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={create.isPending}>
              Add Location
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
