import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { UserService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { Status } from '@prisma/client';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly bot: Telegraf;
  private readonly superAdminChatId?: string;

  constructor(
    private config: ConfigService,
    private userService: UserService,
    private emailService: EmailService,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    this.superAdminChatId = this.config.get<string>('TELEGRAM_CHAT_ID');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN সেট করা নেই');
    this.bot = new Telegraf(token);

    this.bot.start((ctx) => {
      ctx.reply(
        `স্বাগতম! আপনার chat ID: ${ctx.chat.id}। অপেক্ষমাণ আবেদন দেখতে /pending ব্যবহার করুন।`,
      );
    });

    this.bot.command('pending', async (ctx) => {
      if (!this.superAdminChatId || ctx.chat.id.toString() !== this.superAdminChatId) return;
      const users = await this.userService.getPendingUsers();
      if (users.length === 0) {
        return ctx.reply('কোনো অপেক্ষমাণ আবেদন নেই।');
      }
      for (const user of users) {
        await ctx.reply(
          `নতুন অ্যাডমিন আবেদন:\nনাম: ${user.name || 'দেওয়া হয়নি'}\nইমেইল: ${user.email}`,
          Markup.inlineKeyboard([
            Markup.button.callback('অনুমোদন', `approve_${user.id}`),
            Markup.button.callback('প্রত্যাখ্যান', `reject_${user.id}`),
          ]),
        );
      }
    });

    this.bot.action(/^(approve|reject)_(.+)$/, async (ctx) => {
      if (ctx.chat?.id.toString() !== this.superAdminChatId) {
        return ctx.answerCbQuery('আপনার অনুমতি নেই');
      }
      const action = ctx.match[1];
      const userId = ctx.match[2];
      const newStatus =
        action === 'approve' ? Status.APPROVED : Status.REJECTED;

      try {
        const user = await this.userService.updateStatus(userId, newStatus);
        if (newStatus === Status.APPROVED) {
          await this.emailService.sendApprovalEmail(
            user.email,
            user.name || '',
          );
        }
        await ctx.editMessageReplyMarkup(undefined);
        // Fix for message type: cast to any to access text safely
        const originalText = (ctx.callbackQuery.message as any)?.text || '';
        await ctx.editMessageText(`${originalText}\n\nঅবস্থা: ${newStatus}`);
        await ctx.answerCbQuery('ব্যবহারকারীর অবস্থা সফলভাবে পরিবর্তন হয়েছে।');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'অজানা ত্রুটি';
        await ctx.answerCbQuery('ত্রুটি: ' + message);
      }
    });
  }

  async onModuleInit() {
    this.bot
      .launch()
      .catch((err) => console.error('Telegram চালু করা যায়নি:', err));
    console.log('Telegram bot চালু হচ্ছে...');
  }

  async onModuleDestroy() {
    await this.bot.stop();
  }

  async sendNewSignupNotification(
    email: string,
    userId: string,
    name?: string,
  ) {
    if (!this.superAdminChatId) return;
    try {
      await this.bot.telegram.sendMessage(
        this.superAdminChatId,
        `🆕 নতুন অ্যাডমিন আবেদন:\nনাম: ${name || 'দেওয়া হয়নি'}\nইমেইল: ${email}`,
        Markup.inlineKeyboard([
          Markup.button.callback('অনুমোদন', `approve_${userId}`),
          Markup.button.callback('প্রত্যাখ্যান', `reject_${userId}`),
        ]),
      );
    } catch (error) {
      console.error('Telegram notification পাঠানো যায়নি:', error);
    }
  }

  async sendNewOrderNotification(order: {
    orderNumber: string;
    customerName: string;
    phone: string;
    address: string;
    area?: string | null;
    city?: string | null;
    note?: string | null;
    total: number;
    items: Array<{ name: string; quantity: number; lineTotal: number }>;
  }) {
    if (!this.superAdminChatId) {
      console.warn('TELEGRAM_CHAT_ID সেট করা নেই; order alert পাঠানো হয়নি।');
      return;
    }

    const itemLines = order.items
      .map(
        (item, index) =>
          `${index + 1}. ${item.name} × ${item.quantity} — ৳${item.lineTotal.toLocaleString('bn-BD')}`,
      )
      .join('\n');
    const location = [order.address, order.area, order.city]
      .filter(Boolean)
      .join(', ');
    const message = [
      '🛍️ নতুন অর্ডার এসেছে',
      `অর্ডার: ${order.orderNumber}`,
      `ক্রেতা: ${order.customerName}`,
      `ফোন: ${order.phone}`,
      `ঠিকানা: ${location}`,
      '',
      itemLines,
      '',
      `মোট: ৳${order.total.toLocaleString('bn-BD')}`,
      order.note ? `নোট: ${order.note}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await this.bot.telegram.sendMessage(this.superAdminChatId, message);
    } catch (error) {
      console.error('Telegram order alert পাঠানো যায়নি:', error);
    }
  }

  async sendAiFailureAlert(input: {
    ticketId: string;
    conversationId: string;
    question: string;
    pagePath?: string | null;
    reason: string;
  }) {
    if (!this.superAdminChatId) {
      console.warn('TELEGRAM_CHAT_ID সেট করা নেই; AI failure alert পাঠানো হয়নি।');
      return false;
    }

    const adminUrl = this.config.get<string>('ADMIN_APP_URL')?.replace(/\/$/, '');
    const message = [
      '🚨 Maaniko AI human reply প্রয়োজন',
      `Ticket: ${input.ticketId}`,
      `Conversation: ${input.conversationId}`,
      `Page: ${input.pagePath || '/'}`,
      '',
      `Customer: ${input.question.slice(0, 700)}`,
      '',
      `Provider: ${input.reason.slice(0, 700)}`,
      adminUrl ? `Reply: ${adminUrl}/ai-assistant` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await this.bot.telegram.sendMessage(this.superAdminChatId, message, {
        link_preview_options: { is_disabled: true },
      });
      return true;
    } catch (error) {
      console.error('Telegram AI failure alert পাঠানো যায়নি:', error);
      return false;
    }
  }
}
