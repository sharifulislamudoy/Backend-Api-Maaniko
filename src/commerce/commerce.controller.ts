import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CartItemType, CustomerEventType, LeadType } from '@prisma/client';
import { CommerceService } from './commerce.service';
import type {
  CareProfileInput,
  CartItemInput,
  CheckoutDraftInput,
  ContactInput,
  CreateOrderInput,
  LeadInput,
  OrderQuoteInput,
  RestoreInput,
  TrackingEventInput,
} from './commerce.types';

@Controller('commerce')
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  private identity(
    guestId: string | undefined,
    sessionId: string | undefined,
    customerToken: string | undefined,
  ) {
    return {
      guestId: guestId ?? '',
      sessionId,
      customerToken,
    };
  }

  private cartItemType(value: string): CartItemType {
    return value === CartItemType.COMBO
      ? CartItemType.COMBO
      : CartItemType.PRODUCT;
  }

  @Get('cart')
  getCart(
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.getCart(
      this.identity(guestId, sessionId, customerToken),
    );
  }

  @Put('cart/items/:clientKey')
  putCartItem(
    @Param('clientKey') clientKey: string,
    @Body() body: CartItemInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.putCartItem(
      this.identity(guestId, sessionId, customerToken),
      clientKey,
      {
        ...body,
        itemType: this.cartItemType(String(body.itemType)),
      },
    );
  }

  @Delete('cart/items/:clientKey')
  deleteCartItem(
    @Param('clientKey') clientKey: string,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.deleteCartItem(
      this.identity(guestId, sessionId, customerToken),
      clientKey,
    );
  }

  @Patch('cart/contact')
  saveCheckoutDraft(
    @Body() body: CheckoutDraftInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.saveCheckoutDraft(
      this.identity(guestId, sessionId, customerToken),
      body,
    );
  }

  @Post('cart/save')
  saveCart(
    @Body() body: ContactInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.saveCart(
      this.identity(guestId, sessionId, customerToken),
      body,
    );
  }

  @Post('cart/recover/:token')
  recoverCart(
    @Param('token') token: string,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.recoverCart(
      this.identity(guestId, sessionId, customerToken),
      token,
    );
  }

  @Get('wishlist')
  getWishlist(
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.getWishlist(
      this.identity(guestId, sessionId, customerToken),
    );
  }

  @Put('wishlist/:itemType/:entityId')
  putWishlist(
    @Param('itemType') itemType: string,
    @Param('entityId') entityId: string,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.putWishlistItem(
      this.identity(guestId, sessionId, customerToken),
      this.cartItemType(itemType),
      entityId,
    );
  }

  @Delete('wishlist/:itemType/:entityId')
  deleteWishlist(
    @Param('itemType') itemType: string,
    @Param('entityId') entityId: string,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.deleteWishlistItem(
      this.identity(guestId, sessionId, customerToken),
      this.cartItemType(itemType),
      entityId,
    );
  }

  @Post('wishlist/save')
  saveWishlist(
    @Body() body: ContactInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.saveWishlist(
      this.identity(guestId, sessionId, customerToken),
      body,
    );
  }

  @Post('contact')
  captureContact(
    @Body() body: ContactInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.captureContact(
      this.identity(guestId, sessionId, customerToken),
      body,
    );
  }

  @Post('restore')
  restore(
    @Body() body: RestoreInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.restoreProfile(
      this.identity(guestId, sessionId, customerToken),
      body,
    );
  }

  @Get('me')
  me(
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.myAccount(
      this.identity(guestId, sessionId, customerToken),
    );
  }

  @Post('events')
  event(
    @Body() body: TrackingEventInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.track(
      this.identity(guestId, sessionId, customerToken),
      {
        ...body,
        type: String(body.type) as CustomerEventType,
      },
    );
  }

  @Post('combos/:comboId/quote')
  comboQuote(
    @Param('comboId') comboId: string,
    @Body()
    body: {
      customConfig?: { productId: string; quantity: number }[];
      quantity?: number;
    },
  ) {
    return this.commerce.quoteCombo(
      comboId,
      body.customConfig,
      Number(body.quantity ?? 1),
    );
  }

  @Post('custom-combo/quote')
  customComboQuote(
    @Body()
    body: {
      customConfig?: { productId: string; quantity: number }[];
      quantity?: number;
    },
  ) {
    return this.commerce.quoteCustomCombo(
      body.customConfig ?? [],
      Number(body.quantity ?? 1),
    );
  }

  @Post('orders/quote')
  orderQuote(
    @Body() body: OrderQuoteInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.quoteOrder(
      this.identity(guestId, sessionId, customerToken),
      body,
    );
  }

  @Post('orders')
  createOrder(
    @Body() body: CreateOrderInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.createOrder(
      this.identity(guestId, sessionId, customerToken),
      body,
    );
  }

  @Post('leads')
  createLead(
    @Body() body: LeadInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.createLead(
      this.identity(guestId, sessionId, customerToken),
      {
        ...body,
        type: String(body.type) as LeadType,
      },
    );
  }

  @Patch('care-profile')
  updateCareProfile(
    @Body() body: CareProfileInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-session-id') sessionId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.commerce.updateCareProfile(
      this.identity(guestId, sessionId, customerToken),
      body,
    );
  }
}
