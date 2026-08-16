'use client';

import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Combobox,
  FormField,
  Input,
  Skeleton,
  useToast,
  type ComboboxOption,
} from '@pasta/ui';
import { isApiClientError, type AdminLocation } from '@pasta/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { COUNTRIES } from '@/lib/countries';
import { adminApi } from '@/lib/session';

/** Built once — the list is constant, and 252 objects per render is waste. */
const COUNTRY_OPTIONS: ComboboxOption[] = COUNTRIES.map((country) => ({
  value: country.code,
  label: country.name,
  prefix: country.flag,
  keywords: country.code,
}));

/** The API stores the English country name; the select works in ISO codes. */
function codeForCountry(country: string): string {
  return COUNTRIES.find((option) => option.name === country)?.code ?? 'IT';
}

function nameForCode(code: string): string {
  return COUNTRIES.find((option) => option.code === code)?.name ?? '';
}

/**
 * Manage destinations.
 *
 * Opened from the tours toolbar. It used to be an add-only form, which meant a
 * typo in a location name could only ever be added to, never corrected — so
 * the existing list now sits alongside the form, each row editable in place
 * and deletable when no tour depends on it.
 */
export function AddLocationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('IT');
  const [error, setError] = React.useState<string | null>(null);

  /** The row being edited, if any, held as a draft so Cancel is a real cancel. */
  const [editing, setEditing] = React.useState<{
    id: string;
    name: string;
    countryCode: string;
  } | null>(null);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<AdminLocation | null>(null);

  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: () => adminApi.admin.locations(),
    enabled: open,
  });

  /** Both writes invalidate the same two caches: the list, and the tour rows. */
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['locations'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'tours'] }),
    ]);
  }

  const create = useMutation({
    mutationFn: () =>
      adminApi.admin.createLocation({ name: name.trim(), country: nameForCode(countryCode) }),
    onSuccess: async () => {
      await refresh();
      toast.success('Location added', `${name.trim()} is now available to tours.`);
      setName('');
      setError(null);
    },
    onError: (caught: unknown) => {
      const message = isApiClientError(caught)
        ? caught.message
        : 'Could not add that location. Please try again.';
      setError(message);
      toast.error('Location not added', message);
    },
  });

  const update = useMutation({
    mutationFn: (draft: { id: string; name: string; countryCode: string }) =>
      adminApi.admin.updateLocation(draft.id, {
        name: draft.name.trim(),
        country: nameForCode(draft.countryCode),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success('Location updated', 'Tours filed under it follow the new name.');
      setEditing(null);
      setEditError(null);
    },
    onError: (caught: unknown) => {
      const message = isApiClientError(caught)
        ? caught.message
        : 'Could not save that location. Please try again.';
      setEditError(message);
      toast.error('Location not saved', message);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.admin.deleteLocation(id),
    onSuccess: async () => {
      await refresh();
      toast.success('Location removed', `${deleting?.name ?? 'It'} is no longer offered.`);
      setDeleting(null);
    },
    onError: (caught: unknown) => {
      toast.error(
        'Location not removed',
        isApiClientError(caught)
          ? caught.message
          : 'Could not remove that location. Please try again.',
      );
      setDeleting(null);
    },
  });

  const rows = locations.data ?? [];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setEditing(null);
            setEditError(null);
            setError(null);
          }
          onOpenChange(next);
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Locations</DialogTitle>
            <DialogDescription>
              Locations appear in the tour editor and in the public destination filters.
            </DialogDescription>
          </DialogHeader>

          <section aria-label="Existing locations" className="flex flex-col gap-2">
            {locations.isLoading ? (
              Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-14" />)
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground rounded-field border-border border border-dashed px-4 py-6 text-center text-sm">
                No locations yet. Add the first one below.
              </p>
            ) : (
              <ul className="border-border rounded-field max-h-72 divide-y overflow-y-auto border">
                {rows.map((location) =>
                  editing?.id === location.id ? (
                    <li key={location.id} className="bg-muted/40 flex flex-col gap-3 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField label="Name" required error={editError ?? undefined}>
                          <Input
                            autoFocus
                            value={editing.name}
                            minLength={2}
                            onChange={(event) =>
                              setEditing({ ...editing, name: event.target.value })
                            }
                          />
                        </FormField>
                        <FormField label="Country" required>
                          <Combobox
                            aria-label="Country"
                            options={COUNTRY_OPTIONS}
                            value={editing.countryCode}
                            onValueChange={(next) => setEditing({ ...editing, countryCode: next })}
                            placeholder="Choose a country"
                            searchPlaceholder="Search 250+ countries…"
                            emptyText="No country matches that."
                          />
                        </FormField>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          leadingIcon={<X aria-hidden />}
                          onClick={() => {
                            setEditing(null);
                            setEditError(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          leadingIcon={<Check aria-hidden />}
                          isLoading={update.isPending}
                          disabled={editing.name.trim().length < 2}
                          onClick={() => update.mutate(editing)}
                        >
                          Save
                        </Button>
                      </div>
                    </li>
                  ) : (
                    <li key={location.id} className="flex items-center gap-3 px-3 py-2.5">
                      <MapPin className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{location.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {location.country} ·{' '}
                          {location.tourCount === 1 ? '1 tour' : `${location.tourCount} tours`}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="subtle"
                        size="icon"
                        aria-label={`Edit ${location.name}`}
                        onClick={() => {
                          setEditError(null);
                          setEditing({
                            id: location.id,
                            name: location.name,
                            countryCode: codeForCountry(location.country),
                          });
                        }}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      {/*
                        Disabled rather than hidden when tours depend on it: a
                        greyed-out button with a reason attached explains the
                        rule, where a missing one just looks inconsistent.
                      */}
                      <Button
                        type="button"
                        variant="subtle"
                        size="icon"
                        aria-label={`Delete ${location.name}`}
                        disabled={location.tourCount > 0}
                        title={
                          location.tourCount > 0
                            ? 'Tours are filed under this location. Move them first.'
                            : undefined
                        }
                        onClick={() => setDeleting(location)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>

          <form
            className="border-border mt-6 flex flex-col gap-4 border-t pt-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim().length >= 2 && nameForCode(countryCode)) create.mutate();
            }}
          >
            <h3 className="text-sm font-medium">Add a new location</h3>

            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button type="submit" leadingIcon={<Plus aria-hidden />} isLoading={create.isPending}>
                Add Location
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title="Remove this location?"
        description={
          <>
            <strong>{deleting?.name}</strong> will disappear from the tour editor and from the
            public destination filters.
          </>
        }
        confirmLabel="Remove"
        isPending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}
