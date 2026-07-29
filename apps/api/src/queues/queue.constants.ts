/** Queue names. Kept in one place so producers and processors cannot drift. */
export const QueueName = {
  Mail: 'mail',
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

/** Job names within the mail queue. */
export const MailJob = {
  Send: 'send',
} as const;
export type MailJob = (typeof MailJob)[keyof typeof MailJob];

/**
 * Whether background processing is available.
 *
 * Redis is optional in local development: without it, work that would be queued
 * runs inline instead. Evaluated at module-definition time, before DI exists.
 */
export const isQueueEnabled = (): boolean => Boolean(process.env.REDIS_URL);
