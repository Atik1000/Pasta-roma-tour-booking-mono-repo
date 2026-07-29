'use client';

import * as React from 'react';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { cn } from '../lib/cn';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds on screen. Errors linger because they need reading. */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: number;
  open: boolean;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  /** Shorthands, so call sites read as the outcome they are reporting. */
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * Colour, icon and dwell time per outcome.
 *
 * Colour alone never carries the meaning: each tone also has a distinct icon
 * and its own wording, so the message still reads for anyone who cannot
 * distinguish the hues.
 */
const TONES: Record<
  ToastTone,
  { className: string; icon: React.ReactNode; duration: number; label: string }
> = {
  success: {
    className: 'border-success/30 bg-success-soft text-success-foreground',
    icon: <CheckCircle2 className="text-success size-5 shrink-0" aria-hidden />,
    duration: 4000,
    label: 'Success',
  },
  error: {
    className: 'border-danger/30 bg-danger-soft text-danger-foreground',
    // Long enough to read and act on; a failure that vanishes is a failure hidden.
    icon: <XCircle className="text-danger size-5 shrink-0" aria-hidden />,
    duration: 9000,
    label: 'Error',
  },
  warning: {
    className: 'border-warning/30 bg-warning-soft text-warning-foreground',
    icon: <AlertTriangle className="text-warning size-5 shrink-0" aria-hidden />,
    duration: 6000,
    label: 'Warning',
  },
  info: {
    className: 'border-info/30 bg-info-soft text-info-foreground',
    icon: <Info className="text-info size-5 shrink-0" aria-hidden />,
    duration: 5000,
    label: 'Notice',
  },
};

/**
 * Application-wide toasts.
 *
 * Built on Radix so the accessibility comes from the primitive rather than
 * from hand-rolled ARIA: a success is announced politely, an error assertively,
 * F6 moves focus to the stack, Escape dismisses, and a toast under the pointer
 * or keyboard focus will not time out while it is being read.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const nextId = React.useRef(0);

  const toast = React.useCallback((options: ToastOptions) => {
    nextId.current += 1;
    const id = nextId.current;

    setToasts((current) => [...current, { ...options, id, open: true }]);
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: 'success' }),
      error: (title, description) => toast({ title, description, tone: 'error' }),
      info: (title, description) => toast({ title, description, tone: 'info' }),
      warning: (title, description) => toast({ title, description, tone: 'warning' }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}

        {toasts.map((entry) => {
          const tone = TONES[entry.tone ?? 'info'];

          return (
            <ToastPrimitive.Root
              key={entry.id}
              open={entry.open}
              duration={entry.duration ?? tone.duration}
              // An error interrupts; everything else waits its turn.
              type={entry.tone === 'error' ? 'foreground' : 'background'}
              onOpenChange={(open) => {
                if (open) return;
                setToasts((current) => current.filter((item) => item.id !== entry.id));
              }}
              className={cn(
                'rounded-card toast-animated pointer-events-auto flex w-full items-start gap-3 border p-4 shadow-lg',
                tone.className,
              )}
            >
              {tone.icon}

              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-sm font-semibold">
                  {/* Names the outcome for a screen reader before the message. */}
                  <span className="sr-only">{tone.label}: </span>
                  {entry.title}
                </ToastPrimitive.Title>

                {entry.description ? (
                  <ToastPrimitive.Description className="mt-1 text-sm opacity-90">
                    {entry.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>

              <ToastPrimitive.Close
                aria-label="Dismiss"
                className="focus-visible:outline-ring -m-1 shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <X className="size-4" aria-hidden />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}

        <ToastPrimitive.Viewport
          // `pointer-events-none` on the stack so an empty viewport never
          // swallows clicks on the page behind it.
          className="pointer-events-none fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:top-0 sm:max-w-sm sm:flex-col"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

/**
 * Reports an outcome to the user.
 *
 * Throws when no provider is mounted rather than silently doing nothing —
 * a toast that never appears is exactly the failure this component exists to
 * prevent.
 */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside a <ToastProvider>.');
  }

  return context;
}
