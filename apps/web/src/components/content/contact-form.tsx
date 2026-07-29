'use client';

import * as React from 'react';

import { Button, Card, CardContent, FormField, Input, Textarea } from '@pasta/ui';
import { Mail, Send, User } from 'lucide-react';

/** Contact form. Wired to `POST /contact` in Phase 9. */
export function ContactForm({ className }: { className?: string }) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const valid = name.trim().length > 0 && emailValid && message.trim().length >= 10;

  if (sent) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-semibold">Thanks — we have your message</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            We reply within one working day. For anything urgent on the day of your tour, please
            call +39 06 1234 5678.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <h2 className="font-display mb-5 text-lg font-semibold">Send us a message</h2>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (valid) setSent(true);
          }}
          className="flex flex-col gap-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Your name"
              required
              error={submitted && !name.trim() ? 'Enter your name.' : undefined}
            >
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
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
                placeholder="Enter your email address"
                autoComplete="email"
                leadingIcon={<Mail aria-hidden />}
              />
            </FormField>
          </div>

          <FormField
            label="Message"
            required
            hint="Include your booking reference if your question is about an existing booking."
            error={
              submitted && message.trim().length < 10
                ? 'Tell us a little more — at least 10 characters.'
                : undefined
            }
          >
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="How can we help?"
              rows={5}
            />
          </FormField>

          <div>
            <Button type="submit" leadingIcon={<Send aria-hidden />}>
              Send message
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
