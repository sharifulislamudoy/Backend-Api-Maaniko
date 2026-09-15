import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrderStatus, Role } from '@prisma/client';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CommerceAiService } from './commerce-ai.service';
import { CommerceService } from './commerce.service';
import { SteadfastService } from '../steadfast/steadfast.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('commerce/admin')
export class AdminCommerceController {
  constructor(
    private readonly commerce: CommerceService,
    private readonly ai: CommerceAiService,
    private readonly steadfast: SteadfastService,
  ) {}

  @Get('orders')
  orders(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commerce.adminOrders(status, search, page, limit);
  }

  @Patch('orders/:orderId/status')
  updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() body: { status: OrderStatus; note?: string },
  ) {
    return this.commerce.adminUpdateOrderStatus(orderId, body);
  }

  @Patch('orders/:orderId/manual-status')
  manualUpdateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() body: { status: OrderStatus; note?: string },
  ) {
    return this.steadfast.manualUpdateOrderStatus(
      orderId,
      body.status,
      body.note,
    );
  }

  @Post('orders/:orderId/steadfast/dispatch')
  dispatchToSteadfast(@Param('orderId') orderId: string) {
    return this.steadfast.dispatchOrder(orderId);
  }

  @Post('orders/:orderId/steadfast/sync')
  syncSteadfastOrder(@Param('orderId') orderId: string) {
    return this.steadfast.syncOrder(orderId);
  }

  @Post('orders/steadfast/sync')
  syncAllSteadfastOrders() {
    return this.steadfast.syncActiveOrders();
  }

  @Get('customers')
  customers() {
    return this.commerce.adminCustomers();
  }

  @Get('customers/:customerId/activity')
  activity(@Param('customerId') customerId: string) {
    return this.commerce.adminActivity(customerId);
  }

  @Get('abandoned-carts')
  abandonedCarts() {
    return this.commerce.adminAbandonedCarts();
  }

  @Post('abandoned-carts/:cartId/recovery')
  createRecovery(@Param('cartId') cartId: string) {
    return this.commerce.adminCreateCartRecovery(cartId);
  }

  @Post('abandoned-carts/message')
  abandonedMessage(
    @Body()
    body: {
      name?: string;
      phone?: string;
      subtotal: number;
      itemNames: string[];
      recoveryUrl?: string;
    },
  ) {
    return this.ai.abandonedCartMessage({
      name: body.name,
      phone: body.phone,
      subtotal: Number(body.subtotal ?? 0),
      itemNames: Array.isArray(body.itemNames)
        ? body.itemNames.map(String).slice(0, 10)
        : [],
      recoveryUrl: body.recoveryUrl,
    });
  }
}
