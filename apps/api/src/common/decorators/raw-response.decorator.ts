import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'rawResponse';

/**
 * Opts a handler out of the `{ success, data }` envelope.
 *
 * Required for endpoints that return something other than JSON — invoice PDFs,
 * CSV exports, file streams — and for the Stripe webhook, which must answer
 * with a bare acknowledgement.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
