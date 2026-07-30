import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { ApiEnvelopeResponse } from '../../common/decorators/api-response.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrencyQueryDto } from '../../common/dto/currency-query.dto';
import { CartService } from './cart.service';
import { AddCartItemDto, CartDto, SetCartCurrencyDto, UpdateCartItemDto } from './dto/cart.dto';

/** Anonymous cart cookie. Not httpOnly-sensitive — it holds no credentials. */
export const CART_COOKIE = 'prt_cart';
const CART_COOKIE_MAX_AGE_MS = 14 * 86_400_000;

@ApiTags('Cart')
@Controller('cart')
@Public()
export class CartController {
  constructor(private readonly cart: CartService) {}

  /**
   * Reads the cart session from the cookie, minting one when absent. The id is
   * a random UUID, so a cart cannot be guessed or enumerated.
   */
  private sessionOf(request: Request, response: Response): string {
    const cookies = request.cookies as Record<string, string> | undefined;
    const existing = cookies?.[CART_COOKIE];

    if (existing) return existing;

    const sessionId = randomUUID();
    response.cookie(CART_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: CART_COOKIE_MAX_AGE_MS,
      path: '/',
    });

    return sessionId;
  }

  @Get()
  @ApiOperation({ summary: 'The current cart' })
  @ApiEnvelopeResponse(CartDto)
  get(
    @Query() query: CurrencyQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartDto> {
    return this.cart.get(this.sessionOf(request, response), query.currency);
  }

  @Put('currency')
  @ApiOperation({ summary: 'Re-price the whole basket in another currency' })
  @ApiEnvelopeResponse(CartDto)
  setCurrency(
    @Body() dto: SetCartCurrencyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartDto> {
    return this.cart.setCurrency(this.sessionOf(request, response), dto.currency);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add a departure to the cart' })
  @ApiEnvelopeResponse(CartDto)
  add(
    @Body() dto: AddCartItemDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartDto> {
    return this.cart.addItem(this.sessionOf(request, response), dto);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Change the ticket count on a cart item' })
  @ApiEnvelopeResponse(CartDto)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
    @Query() query: CurrencyQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartDto> {
    return this.cart.updateItem(
      this.sessionOf(request, response),
      id,
      dto.quantity,
      query.currency,
    );
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove a cart item' })
  @ApiEnvelopeResponse(CartDto)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CurrencyQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartDto> {
    return this.cart.removeItem(this.sessionOf(request, response), id, query.currency);
  }

  @Delete()
  @ApiOperation({ summary: 'Empty the cart' })
  @ApiEnvelopeResponse(CartDto)
  clear(
    @Query() query: CurrencyQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartDto> {
    return this.cart.clear(this.sessionOf(request, response), query.currency);
  }
}
