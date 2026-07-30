import { ApiPropertyOptional } from '@nestjs/swagger';
import { CurrencyCode } from '@pasta/types';
import { IsIn, IsOptional } from 'class-validator';

export const CURRENCY_CODES = [CurrencyCode.EUR, CurrencyCode.USD] as const;

/**
 * The currency a public response should be priced in.
 *
 * Both prices are entered by hand in the admin tour form rather than derived
 * from a rate, so switching currency selects a column — it never converts.
 * EUR is the default for a caller that does not ask.
 */
export class CurrencyQueryDto {
  @ApiPropertyOptional({ enum: CURRENCY_CODES, default: CurrencyCode.EUR })
  @IsOptional()
  @IsIn(CURRENCY_CODES)
  currency: CurrencyCode = CurrencyCode.EUR;
}

/** The adult price of `tour` in `currency`, in minor units. */
export function adultPriceMinor(
  tour: { priceAdultEur: number; priceAdultUsd: number },
  currency: CurrencyCode,
): number {
  return currency === CurrencyCode.USD ? tour.priceAdultUsd : tour.priceAdultEur;
}
