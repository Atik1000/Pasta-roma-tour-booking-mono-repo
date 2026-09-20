import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { ApiEnvelopeResponse } from '../../common/decorators/api-response.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { BusinessErrorCode, BusinessException } from '../../common/exceptions/business.exception';
import { CART_COOKIE } from '../cart/cart.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutDto, CheckoutPaymentMethodsDto, CheckoutResultDto } from './dto/checkout.dto';

@ApiTags('Checkout')
@Controller('checkout')
@Public()
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /**
   * Which ways to pay this deployment is currently offering.
   *
   * The form asks rather than being built knowing, for the same reason the
   * payment page is told its gateway by the API: the credentials that decide
   * this never leave the server, and a front-end that guessed would go on
   * offering a gateway the day its keys were pulled.
   */
  @Get('payment-methods')
  @ApiOperation({ summary: 'The payment methods on offer right now' })
  @ApiEnvelopeResponse(CheckoutPaymentMethodsDto)
  paymentMethods(): CheckoutPaymentMethodsDto {
    return { methods: this.checkout.availableMethods() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Booking creation writes rows and sends mail; keep it well below the global limit.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Turn the cart into a booking' })
  @ApiEnvelopeResponse(CheckoutResultDto)
  create(@Body() dto: CheckoutDto, @Req() request: Request): Promise<CheckoutResultDto> {
    const cookies = request.cookies as Record<string, string> | undefined;
    const sessionId = cookies?.[CART_COOKIE];

    if (!sessionId) {
      throw new BusinessException(BusinessErrorCode.CartEmpty, 'Your cart is empty.');
    }

    return this.checkout.create(sessionId, dto);
  }
}
