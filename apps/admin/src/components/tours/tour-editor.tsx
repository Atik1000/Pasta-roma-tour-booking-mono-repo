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
  useToast,
} from '@pasta/ui';
import { isApiClientError, type SaveTourPayload } from '@pasta/api-client';
import { formatDate } from '@pasta/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { adminApi } from '@/lib/session';

import { SortableTextList } from './sortable-text-list';
import { TourGalleryPanel } from './tour-gallery-panel';
import { TourSlotsPanel } from './tour-slots-panel';
import { TourStepRail } from './tour-step-rail';

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

/** A plan moved one place in `direction`, or the list unchanged at either end. */
function movePlan(plans: TourPlanRow[], index: number, direction: -1 | 1): TourPlanRow[] {
  const target = index + direction;
  if (target < 0 || target >= plans.length) return plans;

  const next = [...plans];
  const moved = next[index];
  const displaced = next[target];
  if (!moved || !displaced) return plans;

  next[index] = displaced;
  next[target] = moved;
  return next;
}

const TOUR_TYPES = [
  { value: 'WALKING', label: 'Walking Tour' },
  { value: 'BUS', label: 'Bus Tour' },
  { value: 'MUSEUM', label: 'Museum Tour' },
  { value: 'DAY_TRIP', label: 'Day Trip' },
  { value: 'FOOD', label: 'Food Tour' },
  { value: 'PRIVATE', label: 'Private Tour' },
];

interface Step {
  id: string;
  label: string;
  title: string;
  description: string;
  required?: boolean;
  complete: boolean;
  render: () => React.ReactNode;
}

/**
 * Tour create/edit, as a wizard.
 *
 * Three points from the mark-ups are load-bearing here:
 *   • the rich-text toolbar over Description was struck — it is a plain textarea
 *   • "Max Adult Tickets per Booking" was annotated *Tour* → "Max Tickets per Tour"
 *   • the "Created By" card was struck
 *
 * The design put each region in its own card with its own Save. Built out in
 * full that came to eight cards across two columns and six Save buttons, and
 * two panels greyed out until the tour existed with nothing saying why. Nothing
 * on that screen said where to start, what depended on what, or which Save
 * wrote which fields — every one of them wrote the whole record anyway.
 *
 * So the fields now arrive one step at a time, in the order a tour is actually
 * described, under a single Save. The one real dependency is handled by
 * sequencing rather than by a disabled panel: departures need a tour to attach
 * to, so that step only exists once the tour has been created.
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
  const [error, setError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);
  const [furthest, setFurthest] = React.useState(0);

  const toast = useToast();
  const queryClient = useQueryClient();
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  function patch(changes: Partial<TourEditorValue>) {
    setValue((current) => ({ ...current, ...changes }));
  }

  /**
   * Set by the gallery step, and only while that step is on screen. Calling it
   * uploads any photo that was chosen but never uploaded — see the panel's
   * `flush` for why Save has to do that rather than drop them.
   */
  const flushGallery = React.useRef<(() => Promise<string[]>) | null>(null);

  const save = useMutation({
    mutationFn: async (payload: SaveTourPayload) => {
      // Before the record is written, so a failed upload fails the save rather
      // than leaving a tour saved with photos that quietly went nowhere.
      const gallery = flushGallery.current ? await flushGallery.current() : value.gallery;

      const result = value.id
        ? await adminApi.admin.updateTour(value.id, payload)
        : await adminApi.admin.createTour(payload);

      return { ...result, gallery };
    },
    onSuccess: async (result) => {
      setError(null);
      toast.success(
        value.id ? 'Tour saved' : 'Tour created',
        value.id ? 'Your changes are live.' : 'You can now add photos and departures.',
      );

      if (value.id) {
        // Queries here are cached for a minute and nothing else invalidates
        // them, so without this the tour list, the stat cards and this tour's
        // own detail keep serving the pre-save snapshot. A saved cover photo
        // then looks like it never uploaded.
        await queryClient.invalidateQueries({ queryKey: ['admin', 'tours'] });
        return;
      }

      // The gallery could not be attached before the tour existed.
      if (result.gallery.length) {
        await adminApi.admin.setTourImages(result.id, result.gallery);
      }
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tours'] });
      patch({ id: result.id });
      router.replace(`/tours/${result.id}`);
    },
    onError: (caught: unknown) => {
      const message = isApiClientError(caught)
        ? caught.message
        : 'Could not save. Please try again.';
      setError(message);
      toast.error('Tour not saved', message);
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

  const steps: Step[] = [
    {
      id: 'basic',
      label: 'Basics',
      title: 'Basic information',
      description: 'What the tour is called, how long it runs, and where it happens.',
      required: true,
      complete: Boolean(
        value.title.trim() &&
        value.durationHours &&
        value.location &&
        value.type &&
        value.description.trim(),
      ),
      render: () => (
        <div className="flex flex-col gap-5">
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
              <Select value={value.location} onValueChange={(next) => patch({ location: next })}>
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
            label="Description"
            required
            hint="Plain text. This appears under the tour title on the public site."
          >
            <Textarea
              rows={6}
              value={value.description}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </FormField>
        </div>
      ),
    },
    {
      id: 'pricing',
      label: 'Pricing',
      title: 'Pricing & tickets',
      description: 'The adult price in each currency, and how many tickets one booking may take.',
      required: true,
      complete: Boolean(value.priceEur && value.priceUsd && value.maxTicketsPerTour),
      render: () => (
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Adult Price (EUR)" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={value.priceEur}
                onChange={(event) => patch({ priceEur: event.target.value })}
              />
            </FormField>

            <FormField label="Adult Price (USD)" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={value.priceUsd}
                onChange={(event) => patch({ priceUsd: event.target.value })}
              />
            </FormField>
          </div>

          {/* Renamed per the mark-up: "per Booking" → "per Tour". */}
          <FormField
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

          <p className="text-muted-foreground text-xs">
            The two prices are entered independently — they are not converted at a rate.
          </p>
        </div>
      ),
    },
    {
      id: 'lists',
      label: 'Highlights',
      title: 'Highlights & inclusions',
      description: 'The bullet lists shown down the tour page. All optional.',
      complete: [...value.highlights, ...value.included, ...value.goodToKnow].some((entry) =>
        entry.trim(),
      ),
      render: () => (
        <div className="flex flex-col gap-6">
          <SortableTextList
            legend="Highlights"
            items={value.highlights}
            onChange={(items) => patch({ highlights: items })}
            addLabel="Add Highlight"
          />
          <SortableTextList
            legend="What's Included"
            items={value.included}
            onChange={(items) => patch({ included: items })}
            addLabel="Add Item"
          />
          <SortableTextList
            legend="Good to Know"
            items={value.goodToKnow}
            onChange={(items) => patch({ goodToKnow: items })}
            addLabel="Add Item"
          />
        </div>
      ),
    },
    {
      id: 'plans',
      label: 'Itinerary',
      title: 'Itinerary',
      description: 'The step-by-step plan, in the order travellers will read it. Optional.',
      complete: value.plans.some((plan) => plan.title.trim()),
      render: () => (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
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

          {value.plans.length === 0 ? (
            <p className="text-muted-foreground rounded-field border-border border border-dashed p-6 text-center text-sm">
              No itinerary steps yet. Add one to describe how the tour runs.
            </p>
          ) : (
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

                  {/*
                    Reordering by button rather than drag: the position is what
                    the public itinerary renders in, and arrows work with a
                    keyboard and a screen reader, which a drag handle alone
                    does not.
                  */}
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Move plan ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => patch({ plans: movePlan(value.plans, index, -1) })}
                    >
                      <ChevronUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Move plan ${index + 1} down`}
                      disabled={index === value.plans.length - 1}
                      onClick={() => patch({ plans: movePlan(value.plans, index, 1) })}
                    >
                      <ChevronDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-danger hover:bg-danger-soft size-8"
                      aria-label={`Delete plan ${index + 1}`}
                      onClick={() => patch({ plans: value.plans.filter((_, i) => i !== index) })}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <p className="text-muted-foreground text-xs">
            Plans run in the order shown. Reorder with the arrows.
          </p>
        </div>
      ),
    },
    {
      id: 'meeting',
      label: 'Meeting point',
      title: 'Meeting point',
      description: 'Where travellers gather before the tour starts. Optional.',
      complete: Boolean(value.meetingPointTitle.trim()),
      render: () => (
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
      ),
    },
    {
      id: 'gallery',
      label: 'Photos',
      title: 'Photos',
      description:
        mode === 'create'
          ? 'The gallery shown on the tour page. Pick them now — they attach when you create the tour.'
          : 'The gallery shown on the tour page. The first photo is the cover.',
      complete: value.gallery.length > 0,
      render: () => (
        <TourGalleryPanel
          tourId={value.id}
          gallery={value.gallery}
          onChange={(gallery) => patch({ gallery })}
          flushRef={flushGallery}
        />
      ),
    },
  ];

  /**
   * Departures only exist once the tour does — a departure is a row pointing at
   * a tour id. Rather than show the step greyed out with no explanation, the
   * wizard simply does not include it while creating; saving lands on the edit
   * page, where it is the last step.
   */
  if (value.id) {
    steps.push({
      id: 'slots',
      label: 'Departures',
      title: 'Departures',
      description: 'The dates and times this tour runs, and how many seats each one holds.',
      complete: true,
      render: () => <TourSlotsPanel tourId={value.id} />,
    });
  }

  const current = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;
  const blocked = Boolean(current?.required && !current.complete);
  const requiredOutstanding = steps.filter((entry) => entry.required && !entry.complete);
  const canSave = requiredOutstanding.length === 0;

  function goTo(index: number) {
    const next = Math.min(Math.max(index, 0), steps.length - 1);
    setStep(next);
    setFurthest((reached) => Math.max(reached, next));
    // Move focus to the new step's heading; without it a keyboard or screen
    // reader user presses Next and stays where they were.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (!current) return null;

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

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                {mode === 'create' ? 'New Tour' : value.title || 'Untitled tour'}
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

          <div className="flex items-center gap-4">
            {/* One control, so it sits in the header rather than in a card of
                its own. It decides what the pill beside the title says. */}
            <label className="flex items-center gap-2.5">
              <Switch
                checked={value.published}
                onCheckedChange={(checked) => patch({ published: checked })}
              />
              <span className="text-sm font-medium">{value.published ? 'Published' : 'Draft'}</span>
            </label>

            {/* Editing an existing tour should not require walking to the last
                step to save one changed field. Creating one does — the final
                step is where Create lives. */}
            {mode === 'edit' ? (
              <Button
                leadingIcon={<Save aria-hidden />}
                isLoading={save.isPending}
                disabled={!canSave}
                title={canSave ? undefined : 'Complete the required steps first'}
                onClick={() => save.mutate(toPayload())}
              >
                Save Tour
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <TourStepRail
        steps={steps.map((entry) => ({
          id: entry.id,
          label: entry.label,
          required: entry.required,
          complete: entry.complete,
        }))}
        current={step}
        furthest={furthest}
        // Nothing is left to sequence on a tour that already exists.
        unlockAll={mode === 'edit'}
        onSelect={goTo}
      />

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-sm">
            Step {step + 1} of {steps.length}
          </p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-semibold outline-none">
            {current.title}
          </h2>
          <p className="text-muted-foreground mb-6 mt-1 text-sm">{current.description}</p>

          {current.render()}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={step === 0}
          leadingIcon={<ArrowLeft aria-hidden />}
          onClick={() => goTo(step - 1)}
        >
          Back
        </Button>

        <div className="flex items-center gap-3">
          {blocked ? (
            <p className="text-muted-foreground text-xs" role="status">
              Fill in the required fields to continue.
            </p>
          ) : null}

          {isLast ? (
            mode === 'create' ? (
              <Button
                leadingIcon={<Save aria-hidden />}
                isLoading={save.isPending}
                disabled={!canSave}
                title={
                  canSave
                    ? undefined
                    : `Complete ${requiredOutstanding.map((entry) => entry.label).join(' and ')} first`
                }
                onClick={() => save.mutate(toPayload())}
              >
                Create Tour
              </Button>
            ) : null
          ) : (
            <Button disabled={blocked} onClick={() => goTo(step + 1)}>
              Next
              <ArrowRight className="ml-1.5 size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Unpublished tours are hidden from the website.
        {mode === 'create'
          ? ' Nothing is written until you press Create Tour.'
          : ' Photos and departures save as you edit them; everything else saves with the button above.'}
      </p>
    </div>
  );
}
