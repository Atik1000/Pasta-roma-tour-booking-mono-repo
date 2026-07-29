'use client';

import * as React from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  Switch,
  Textarea,
} from '@pasta/ui';
import { isApiClientError, type SaveTourPayload } from '@pasta/api-client';
import { formatDate } from '@pasta/utils';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from 'lucide-react';

import { adminApi } from '@/lib/session';

import { SortableTextList } from './sortable-text-list';
import { TourGalleryPanel } from './tour-gallery-panel';
import { TourSlotsPanel } from './tour-slots-panel';

export interface TourPlanRow {
  title: string;
  description: string;
}

export interface TourEditorValue {
  id?: string;
  title: string;
  durationHours: string;
  location: string;
  type: string;
  description: string;
  priceUsd: string;
  priceEur: string;
  maxTicketsPerTour: string;
  highlights: string[];
  included: string[];
  goodToKnow: string[];
  gallery: string[];
  plans: TourPlanRow[];
  meetingPointTitle: string;
  meetingPointAddress: string;
  published: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const TOUR_TYPES = [
  { value: 'WALKING', label: 'Walking Tour' },
  { value: 'BUS', label: 'Bus Tour' },
  { value: 'MUSEUM', label: 'Museum Tour' },
  { value: 'DAY_TRIP', label: 'Day Trip' },
  { value: 'FOOD', label: 'Food Tour' },
  { value: 'PRIVATE', label: 'Private Tour' },
];

/**
 * Tour create/edit.
 *
 * Three points from the mark-ups are load-bearing here:
 *   • the rich-text toolbar over Description was struck — it is a plain textarea
 *   • "Max Adult Tickets per Booking" was annotated *Tour* → "Max Tickets per Tour"
 *   • the "Created By" card was struck
 *
 * The design also saves in independent regions rather than one global submit,
 * so Basic Information, Tickets & Pricing and Meeting Point each own a button.
 */
export function TourEditor({
  initialValue,
  locations,
  mode,
}: {
  initialValue: TourEditorValue;
  locations: string[];
  mode: 'create' | 'edit';
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initialValue);
  const [savedRegion, setSavedRegion] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * The design saves in independent regions, but a tour is one document — the
   * whole thing is written on any Save, so a partial save can never leave the
   * record inconsistent. The button label still reports the region the editor
   * pressed.
   */
  const save = useMutation({
    mutationFn: (payload: SaveTourPayload) =>
      value.id ? adminApi.admin.updateTour(value.id, payload) : adminApi.admin.createTour(payload),
    onSuccess: async (result) => {
      setError(null);
      if (value.id) return;

      // The gallery could not be attached before the tour existed.
      if (value.gallery.length) {
        await adminApi.admin.setTourImages(result.id, value.gallery);
      }
      patch({ id: result.id });
      router.replace(`/tours/${result.id}`);
    },
    onError: (caught: unknown) => {
      setError(isApiClientError(caught) ? caught.message : 'Could not save. Please try again.');
    },
  });

  function toPayload(): SaveTourPayload {
    return {
      title: value.title,
      description: value.description,
      durationHours: Number(value.durationHours) || 1,
      type: value.type as SaveTourPayload['type'],
      location: value.location,
      // The form edits major units; the API stores minor units.
      priceEurMinor: Math.round(Number(value.priceEur || '0') * 100),
      priceUsdMinor: Math.round(Number(value.priceUsd || '0') * 100),
      maxTicketsPerTour: Number(value.maxTicketsPerTour) || 10,
      highlights: value.highlights.filter((entry) => entry.trim()),
      included: value.included.filter((entry) => entry.trim()),
      goodToKnow: value.goodToKnow.filter((entry) => entry.trim()),
      plans: value.plans.filter((plan) => plan.title.trim()),
      meetingPointTitle: value.meetingPointTitle || undefined,
      meetingPointAddress: value.meetingPointAddress || undefined,
      published: value.published,
    };
  }
  function patch(changes: Partial<TourEditorValue>) {
    setValue((current) => ({ ...current, ...changes }));
  }

  function saveRegion(region: string) {
    setSavedRegion(region);
    save.mutate(toPayload(), {
      onSettled: () => window.setTimeout(() => setSavedRegion(null), 2000),
    });
  }

  const SaveButton = ({ region }: { region: string }) => (
    <Button
      type="button"
      size="sm"
      isLoading={save.isPending && savedRegion === region}
      onClick={() => saveRegion(region)}
    >
      {savedRegion === region && save.isSuccess ? 'Saved' : 'Save Changes'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="border-danger/30 bg-danger-soft text-danger-foreground rounded-card flex items-start gap-2.5 border px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div>
        <Button variant="ghost" size="sm" asChild leadingIcon={<ArrowLeft aria-hidden />}>
          <Link href="/tours">Back to Tours</Link>
        </Button>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {mode === 'create' ? 'New Tour' : value.title}
          </h1>
          <StatusPill status={value.published ? 'PUBLISHED' : 'DRAFT'} />
        </div>

        {mode === 'edit' ? (
          <p className="text-muted-foreground mt-1 text-sm">
            Tour ID: #{value.id} • Created on {formatDate(value.createdAt ?? '')} • Last updated{' '}
            {formatDate(value.updatedAt ?? '')}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* ---------------- left column ---------------- */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">Basic Information</h2>
                <SaveButton region="basic" />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Title" required>
                  <Input
                    value={value.title}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                </FormField>

                <FormField label="Duration (in hours)" required>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={value.durationHours}
                    onChange={(event) => patch({ durationHours: event.target.value })}
                  />
                </FormField>

                <FormField label="Location" required>
                  <Select
                    value={value.location}
                    onValueChange={(next) => patch({ location: next })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((entry) => (
                        <SelectItem key={entry} value={entry}>
                          {entry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Type" required>
                  <Select value={value.type} onValueChange={(next) => patch({ type: next })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TOUR_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              {/* Plain textarea: the rich-text toolbar was struck from the design. */}
              <FormField
                className="mt-5"
                label="Description"
                required
                hint="Plain text. This appears under the tour title on the public site."
              >
                <Textarea
                  rows={5}
                  value={value.description}
                  onChange={(event) => patch({ description: event.target.value })}
                />
              </FormField>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {[
              {
                legend: 'Highlights',
                items: value.highlights,
                onChange: (items: string[]) => patch({ highlights: items }),
                addLabel: 'Add Highlight',
              },
              {
                legend: "What's Included",
                items: value.included,
                onChange: (items: string[]) => patch({ included: items }),
                addLabel: 'Add Item',
              },
              {
                legend: 'Good to Know',
                items: value.goodToKnow,
                onChange: (items: string[]) => patch({ goodToKnow: items }),
                addLabel: 'Add Item',
              },
            ].map((list) => (
              <Card key={list.legend}>
                <CardContent className="p-5">
                  <SortableTextList {...list} />
                </CardContent>
              </Card>
            ))}
          </div>

          <TourGalleryPanel
            tourId={value.id}
            gallery={value.gallery}
            onChange={(gallery) => patch({ gallery })}
          />

          <TourSlotsPanel tourId={value.id} />
        </div>

        {/* ---------------- right column ---------------- */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">Tickets &amp; Pricing</h2>
                <SaveButton region="pricing" />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Adult Price (USD)" required>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value.priceUsd}
                    onChange={(event) => patch({ priceUsd: event.target.value })}
                  />
                </FormField>

                <FormField label="Adult Price (EUR)" required>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value.priceEur}
                    onChange={(event) => patch({ priceEur: event.target.value })}
                  />
                </FormField>
              </div>

              {/* Renamed per the mark-up: "per Booking" → "per Tour". */}
              <FormField
                className="mt-5"
                label="Max Tickets per Tour"
                hint="Maximum number of adult tickets a user can book for this tour."
              >
                <Input
                  type="number"
                  min="1"
                  value={value.maxTicketsPerTour}
                  onChange={(event) => patch({ maxTicketsPerTour: event.target.value })}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  Tour Plans{' '}
                  <span className="text-muted-foreground text-sm font-normal">
                    (Itinerary / Plan Items)
                  </span>
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leadingIcon={<Plus aria-hidden />}
                  onClick={() => patch({ plans: [...value.plans, { title: '', description: '' }] })}
                >
                  Add Plan
                </Button>
              </div>

              <ol className="flex flex-col gap-3">
                {value.plans.map((plan, index) => (
                  <li key={index} className="rounded-field border-border flex gap-3 border p-3">
                    <span className="bg-brand-gradient text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                      {index + 1}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Input
                        value={plan.title}
                        placeholder="Step title"
                        aria-label={`Plan ${index + 1} title`}
                        className="h-9"
                        onChange={(event) => {
                          const next = [...value.plans];
                          next[index] = { ...plan, title: event.target.value };
                          patch({ plans: next });
                        }}
                      />
                      <Textarea
                        rows={2}
                        value={plan.description}
                        placeholder="What happens in this step?"
                        aria-label={`Plan ${index + 1} description`}
                        onChange={(event) => {
                          const next = [...value.plans];
                          next[index] = { ...plan, description: event.target.value };
                          patch({ plans: next });
                        }}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-danger hover:bg-danger-soft size-8 shrink-0"
                      aria-label={`Delete plan ${index + 1}`}
                      onClick={() => patch({ plans: value.plans.filter((_, i) => i !== index) })}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ol>

              <p className="text-muted-foreground mt-3 text-xs">Plans run in the order shown.</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">Meeting Point</h2>
                <SaveButton region="meeting" />
              </div>

              <div className="flex flex-col gap-5">
                <FormField label="Title">
                  <Input
                    value={value.meetingPointTitle}
                    onChange={(event) => patch({ meetingPointTitle: event.target.value })}
                  />
                </FormField>
                <FormField label="Description / Address">
                  <Input
                    value={value.meetingPointAddress}
                    onChange={(event) => patch({ meetingPointAddress: event.target.value })}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>

          {/* The "Created By" card that sat beside this was struck from the design. */}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Tour Status</h2>
              <label className="flex items-center gap-3">
                <Switch
                  checked={value.published}
                  onCheckedChange={(checked) => patch({ published: checked })}
                />
                <span className="text-sm font-medium">
                  {value.published ? 'Published' : 'Draft'}
                </span>
              </label>
              <p className="text-muted-foreground mt-3 text-xs">
                Unpublished tours will not be visible on the website.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
