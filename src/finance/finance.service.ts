import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseCategory,
  FinanceEntryType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ExpenseInput = {
  category: ExpenseCategory;
  title: string;
  amount: number;
  expenseDate: string;
  note?: string;
};

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private number(value: Prisma.Decimal | number | string | null | undefined) {
    return Number(value ?? 0);
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private range(from?: string, to?: string) {
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const start = from
      ? new Date(`${from}T00:00:00.000Z`)
      : new Date(end.getTime() - 29 * 86_400_000);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start > end
    ) {
      throw new BadRequestException('সঠিক date range দিন');
    }
    return { start, end };
  }

  async recognizeDeliveredOrder(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order পাওয়া যায়নি');
    const productCost = this.money(
      order.items.reduce(
        (sum, item) =>
          sum + this.number(item.purchaseCostSnapshot) * item.quantity,
        0,
      ),
    );
    const packagingCost = this.money(
      order.items.reduce(
        (sum, item) =>
          sum + this.number(item.packagingCostSnapshot) * item.quantity,
        0,
      ),
    );
    const revenue = this.number(order.total);
    const totalCost = this.money(
      productCost +
        packagingCost +
        this.number(order.courierCost) +
        this.number(order.gatewayFee) +
        this.number(order.otherCost),
    );
    const grossProfit = this.money(revenue - productCost);
    const netProfit = this.money(revenue - totalCost);
    await tx.financeEntry.upsert({
      where: { orderId_type: { orderId, type: FinanceEntryType.SALE } },
      update: {
        revenue,
        productCost,
        packagingCost,
        courierCost: order.courierCost,
        gatewayFee: order.gatewayFee,
        otherCost: order.otherCost,
        totalCost,
        netProfit,
        occurredAt: new Date(),
      },
      create: {
        orderId,
        type: FinanceEntryType.SALE,
        revenue,
        productCost,
        packagingCost,
        courierCost: order.courierCost,
        gatewayFee: order.gatewayFee,
        otherCost: order.otherCost,
        totalCost,
        netProfit,
        occurredAt: new Date(),
      },
    });
    return tx.order.update({
      where: { id: orderId },
      data: {
        revenue,
        productCost,
        packagingCost,
        totalCost,
        grossProfit,
        netProfit,
        profitMargin: revenue > 0 ? this.money((netProfit / revenue) * 100) : 0,
        financialRecognized: true,
        deliveredAt: order.deliveredAt ?? new Date(),
        returnedAt: null,
      },
    });
  }

  async reverseReturnedOrder(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order পাওয়া যায়নি');
    const packagingCost = this.money(
      order.items.reduce(
        (sum, item) =>
          sum + this.number(item.packagingCostSnapshot) * item.quantity,
        0,
      ),
    );
    const totalCost = this.money(
      packagingCost +
        this.number(order.courierCost) +
        this.number(order.gatewayFee) +
        this.number(order.otherCost),
    );
    const originalRevenue =
      this.number(order.revenue) || this.number(order.total);
    const originalProductCost =
      this.number(order.productCost) ||
      this.money(
        order.items.reduce(
          (sum, item) =>
            sum + this.number(item.purchaseCostSnapshot) * item.quantity,
          0,
        ),
      );
    const returnProfit = this.money(-originalRevenue + originalProductCost);
    await tx.financeEntry.upsert({
      where: { orderId_type: { orderId, type: FinanceEntryType.RETURN } },
      update: {
        revenue: -originalRevenue,
        productCost: -originalProductCost,
        totalCost: -originalProductCost,
        netProfit: returnProfit,
        occurredAt: new Date(),
      },
      create: {
        orderId,
        type: FinanceEntryType.RETURN,
        revenue: -originalRevenue,
        productCost: -originalProductCost,
        totalCost: -originalProductCost,
        netProfit: returnProfit,
        occurredAt: new Date(),
      },
    });
    return tx.order.update({
      where: { id: orderId },
      data: {
        revenue: 0,
        productCost: 0,
        packagingCost,
        totalCost,
        grossProfit: 0,
        netProfit: -totalCost,
        profitMargin: 0,
        financialRecognized: true,
        returnedAt: new Date(),
      },
    });
  }

  async summary(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const [orders, expenses, entries] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: start, lte: end } },
        include: { items: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.operatingExpense.findMany({
        where: { expenseDate: { gte: start, lte: end } },
        orderBy: { expenseDate: 'desc' },
      }),
      this.prisma.financeEntry.findMany({
        where: { occurredAt: { gte: start, lte: end } },
        orderBy: { occurredAt: 'asc' },
      }),
    ]);
    const delivered = orders.filter(
      (order) =>
        order.status === OrderStatus.DELIVERED && order.financialRecognized,
    );
    const sum = (
      field:
        | 'revenue'
        | 'productCost'
        | 'packagingCost'
        | 'courierCost'
        | 'gatewayFee'
        | 'otherCost'
        | 'netProfit',
    ) =>
      this.money(
        entries.reduce((total, entry) => total + this.number(entry[field]), 0),
      );
    const operatingExpense = this.money(
      expenses.reduce((total, item) => total + this.number(item.amount), 0),
    );
    const orderNetProfit = sum('netProfit');
    const actualNetProfit = this.money(orderNetProfit - operatingExpense);
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
    }).format(new Date());
    const dayKey = (date: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(date);
    const daily = new Map<
      string,
      {
        date: string;
        orders: number;
        delivered: number;
        returned: number;
        cancelled: number;
        revenue: number;
        profit: number;
      }
    >();
    for (const order of orders) {
      const key = dayKey(order.createdAt);
      const item = daily.get(key) ?? {
        date: key,
        orders: 0,
        delivered: 0,
        returned: 0,
        cancelled: 0,
        revenue: 0,
        profit: 0,
      };
      item.orders += 1;
      if (order.status === OrderStatus.CANCELLED) item.cancelled += 1;
      daily.set(key, item);
    }
    for (const entry of entries) {
      const key = dayKey(entry.occurredAt);
      const item = daily.get(key) ?? {
        date: key,
        orders: 0,
        delivered: 0,
        returned: 0,
        cancelled: 0,
        revenue: 0,
        profit: 0,
      };
      item.revenue += this.number(entry.revenue);
      item.profit += this.number(entry.netProfit);
      if (entry.type === FinanceEntryType.SALE) item.delivered += 1;
      if (entry.type === FinanceEntryType.RETURN) item.returned += 1;
      daily.set(key, item);
    }
    const productMap = new Map<
      string,
      { name: string; quantity: number; revenue: number; profit: number }
    >();
    for (const order of delivered) {
      for (const item of order.items) {
        const key = item.productId ?? item.comboId ?? item.nameSnapshot;
        const current = productMap.get(key) ?? {
          name: item.nameSnapshot,
          quantity: 0,
          revenue: 0,
          profit: 0,
        };
        const revenue = this.number(item.lineTotal);
        const cost =
          (this.number(item.purchaseCostSnapshot) +
            this.number(item.packagingCostSnapshot)) *
          item.quantity;
        current.quantity += item.quantity;
        current.revenue += revenue;
        current.profit += revenue - cost;
        productMap.set(key, current);
      }
    }
    const todayOrders = orders.filter(
      (order) => dayKey(order.createdAt) === todayKey,
    );
    return {
      range: { from: start, to: end },
      summary: {
        totalOrders: orders.length,
        deliveredOrders: entries.filter(
          (entry) => entry.type === FinanceEntryType.SALE,
        ).length,
        returnedOrders: entries.filter(
          (entry) => entry.type === FinanceEntryType.RETURN,
        ).length,
        cancelledOrders: orders.filter(
          (order) => order.status === OrderStatus.CANCELLED,
        ).length,
        revenue: sum('revenue'),
        productCost: sum('productCost'),
        packagingCost: sum('packagingCost'),
        courierCost: sum('courierCost'),
        gatewayFee: sum('gatewayFee'),
        otherOrderCost: sum('otherCost'),
        grossProfit: this.money(sum('revenue') - sum('productCost')),
        orderNetProfit,
        operatingExpense,
        actualNetProfit,
        profitMargin:
          sum('revenue') > 0
            ? this.money((actualNetProfit / sum('revenue')) * 100)
            : 0,
      },
      today: {
        orders: todayOrders.length,
        delivered: entries.filter(
          (entry) =>
            entry.type === FinanceEntryType.SALE &&
            dayKey(entry.occurredAt) === todayKey,
        ).length,
        returned: entries.filter(
          (entry) =>
            entry.type === FinanceEntryType.RETURN &&
            dayKey(entry.occurredAt) === todayKey,
        ).length,
        cancelled: todayOrders.filter(
          (order) => order.status === OrderStatus.CANCELLED,
        ).length,
      },
      daily: [...daily.values()].map((item) => ({
        ...item,
        revenue: this.money(item.revenue),
        profit: this.money(item.profit),
      })),
      topProducts: [...productMap.values()]
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10)
        .map((item) => ({
          ...item,
          revenue: this.money(item.revenue),
          profit: this.money(item.profit),
        })),
      expenses: expenses.map((item) => ({
        ...item,
        amount: this.number(item.amount),
      })),
    };
  }

  async createExpense(input: ExpenseInput) {
    if (!Object.values(ExpenseCategory).includes(input.category))
      throw new BadRequestException('সঠিক expense category দিন');
    const title = String(input.title ?? '')
      .trim()
      .slice(0, 160);
    const amount = Number(input.amount);
    const expenseDate = new Date(input.expenseDate);
    if (
      !title ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Number.isNaN(expenseDate.getTime())
    )
      throw new BadRequestException('Expense তথ্য সঠিক নয়');
    return this.prisma.operatingExpense.create({
      data: {
        category: input.category,
        title,
        amount,
        expenseDate,
        note:
          String(input.note ?? '')
            .trim()
            .slice(0, 500) || null,
      },
    });
  }

  async deleteExpense(id: string) {
    await this.prisma.operatingExpense.delete({ where: { id } });
    return { success: true };
  }
}
