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
  Combobox,
  FormField,
  Input,
  useToast,
  type ComboboxOption,
} from '@pasta/ui';
import { isApiClientError } from '@pasta/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { COUNTRIES } from '@/lib/countries';
import { adminApi } from '@/lib/session';

/** Built once — the list is constant, and 252 objects per render is waste. */
const COUNTRY_OPTIONS: ComboboxOption[] = COUNTRIES.map((country) => ({
  value: country.code,
  label: country.name,
  prefix: country.flag,
  keywords: country.code,
}));

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
  // The select works in ISO codes because country names are not unique enough
  // to key a list by; the API still receives the English name.
  const [countryCode, setCountryCode] = React.useState<string>('IT');
  const [error, setError] = React.useState<string | null>(null);

  const country = COUNTRIES.find((option) => option.code === countryCode)?.name ?? '';

  const toast = useToast();

  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => adminApi.admin.createLocation({ name: name.trim(), country }),
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
            if (name.trim().length >= 2 && country) create.mutate();
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
            <Combobox
              aria-label="Country"
              options={COUNTRY_OPTIONS}
              value={countryCode}
              onValueChange={setCountryCode}
              placeholder="Choose a country"
              searchPlaceholder="Search 250+ countries…"
              emptyText="No country matches that."
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
