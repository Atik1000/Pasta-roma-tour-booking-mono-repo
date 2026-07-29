'use client';

import * as React from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { isApiClientError } from '@pasta/api-client';
import { Button, Card, CardContent, Checkbox, FormField, Input } from '@pasta/ui';
import { AlertTriangle, Eye, EyeOff, Lock, Mail } from 'lucide-react';

import { signIn } from '@/lib/session';

/**
 * Admin sign-in.
 *
 * Phase 9 replaces the submit handler with `POST /auth/login`, which sets the
 * httpOnly refresh cookie and returns the access token. The error copy here
 * matches the API's deliberately non-specific "Incorrect email or password".
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);

    if (!emailValid || password.length === 0) return;

    setIsPending(true);

    try {
      await signIn(email, password);
      router.replace('/dashboard');
    } catch (caught) {
      // The API deliberately does not say which field was wrong.
      setError(isApiClientError(caught) ? caught.message : 'Could not sign in. Please try again.');
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-8">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Enter your credentials to access the admin panel.
        </p>

        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="mt-6 flex flex-col gap-5"
        >
          {error ? (
            <p
              role="alert"
              className="border-danger/30 bg-danger-soft text-danger-foreground rounded-field flex items-start gap-2.5 border px-3 py-2.5 text-sm"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          <FormField
            label="Email address"
            required
            error={submitted && !emailValid ? 'Enter a valid email address.' : undefined}
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@pastaromatour.com"
              autoComplete="username"
              leadingIcon={<Mail aria-hidden />}
            />
          </FormField>

          <FormField
            label="Password"
            required
            error={submitted && password.length === 0 ? 'Enter your password.' : undefined}
          >
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              leadingIcon={<Lock aria-hidden />}
              trailingIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="hover:text-foreground focus-visible:outline-ring pointer-events-auto rounded-full p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />
          </FormField>

          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox name="remember" />
              Keep me signed in
            </label>
            <Link href="/forgot-password" className="text-primary text-sm hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" size="lg" block isLoading={isPending}>
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
