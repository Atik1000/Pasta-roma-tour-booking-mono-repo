'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { isApiClientError, type AuthUser } from '@pasta/api-client';
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  useToast,
} from '@pasta/ui';
import { initials } from '@pasta/utils';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';

import { adminApi, signOut, useSession } from '@/lib/session';

/** Mirrors the API's `PASSWORD_MIN_LENGTH`, so the field says no before the server does. */
const PASSWORD_MIN_LENGTH = 10;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  EDITOR: 'Editor',
};

/**
 * The signed-in admin's own account: name, email address, and password.
 *
 * The two forms are separate because their consequences differ — saving
 * details keeps you signed in, while changing a password revokes every session
 * server-side and therefore has to end at the login screen.
 */
export function ProfileForm() {
  const user = useSession((state) => state.user);
  const setUser = useSession((state) => state.setUser);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          <Avatar className="size-14">
            <AvatarFallback>{initials(user?.name ?? '')}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user?.name ?? 'Signed in'}</p>
            <p className="text-muted-foreground truncate text-sm">
              {user?.email}
              {user ? ` · ${ROLE_LABELS[user.role] ?? user.role}` : null}
            </p>
          </div>
        </CardContent>
      </Card>

      <DetailsForm
        key={user?.id ?? 'anonymous'}
        initialName={user?.name ?? ''}
        initialEmail={user?.email ?? ''}
        onSaved={setUser}
      />

      <PasswordForm />
    </div>
  );
}

function DetailsForm({
  initialName,
  initialEmail,
  onSaved,
}: {
  initialName: string;
  initialEmail: string;
  onSaved: (user: AuthUser) => void;
}) {
  const toast = useToast();
  const [name, setName] = React.useState(initialName);
  const [email, setEmail] = React.useState(initialEmail);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const nameValid = name.trim().length >= 2;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const save = useMutation({
    mutationFn: () => adminApi.auth.updateProfile({ name: name.trim(), email: email.trim() }),
    onSuccess: (updated) => {
      // The header's avatar and account menu read from the same store, so they
      // follow the rename immediately rather than waiting for a reload.
      onSaved(updated);
      setError(null);
      toast.success('Profile updated', 'Your account details have been saved.');
    },
    onError: (caught: unknown) => {
      const message = isApiClientError(caught)
        ? caught.message
        : 'Could not save your details. Please try again.';
      setError(message);
      toast.error('Profile not updated', message);
    },
  });

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold">Your details</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The name shown in the panel header, and the address you sign in with.
        </p>

        <form
          noValidate
          className="mt-6 flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (nameValid && emailValid) save.mutate();
          }}
        >
          {error ? <FormError message={error} /> : null}

          <FormField
            label="Name"
            required
            error={submitted && !nameValid ? 'Enter your name.' : undefined}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              leadingIcon={<User aria-hidden />}
            />
          </FormField>

          <FormField
            label="Email address"
            required
            error={submitted && !emailValid ? 'Enter a valid email address.' : undefined}
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              leadingIcon={<Mail aria-hidden />}
            />
          </FormField>

          <div className="flex justify-end">
            <Button
              type="submit"
              isLoading={save.isPending}
              disabled={name === initialName && email === initialEmail}
            >
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const router = useRouter();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [visible, setVisible] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const longEnough = newPassword.length >= PASSWORD_MIN_LENGTH;
  const matches = newPassword === confirmPassword;

  const change = useMutation({
    mutationFn: () => adminApi.auth.changePassword(currentPassword, newPassword),
    onSuccess: async () => {
      toast.success('Password changed', 'Sign in again with your new password.');
      // The API revokes every refresh token, this session's included, so the
      // in-memory token here is already dead — clear it rather than let the
      // next request 401 its way out.
      await signOut();
      router.replace('/login');
    },
    onError: (caught: unknown) => {
      const message = isApiClientError(caught)
        ? caught.message
        : 'Could not change your password. Please try again.';
      setError(message);
      toast.error('Password not changed', message);
    },
  });

  const reveal = (
    <button
      type="button"
      onClick={() => setVisible((shown) => !shown)}
      aria-label={visible ? 'Hide passwords' : 'Show passwords'}
      className="hover:text-foreground focus-visible:outline-ring pointer-events-auto rounded-full p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold">Password</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Changing it signs you out everywhere, on this device and any other.
        </p>

        <form
          noValidate
          className="mt-6 flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            setError(null);
            if (currentPassword && longEnough && matches) change.mutate();
          }}
        >
          {error ? <FormError message={error} /> : null}

          <FormField
            label="Current password"
            required
            error={submitted && !currentPassword ? 'Enter your current password.' : undefined}
          >
            <Input
              type={visible ? 'text' : 'password'}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              leadingIcon={<Lock aria-hidden />}
              trailingIcon={reveal}
            />
          </FormField>

          <FormField
            label="New password"
            required
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            error={
              submitted && !longEnough
                ? `Use at least ${PASSWORD_MIN_LENGTH} characters.`
                : undefined
            }
          >
            <Input
              type={visible ? 'text' : 'password'}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              leadingIcon={<Lock aria-hidden />}
            />
          </FormField>

          <FormField
            label="Confirm new password"
            required
            error={submitted && !matches ? 'Both passwords must match.' : undefined}
          >
            <Input
              type={visible ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              leadingIcon={<Lock aria-hidden />}
            />
          </FormField>

          <div className="flex justify-end">
            <Button type="submit" isLoading={change.isPending}>
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="border-danger/30 bg-danger-soft text-danger-foreground rounded-field flex items-start gap-2.5 border px-3 py-2.5 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
