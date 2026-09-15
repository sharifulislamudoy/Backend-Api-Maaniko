import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('EMAIL_HOST'),
      port: parseInt(this.config.get('EMAIL_PORT') || '587'),
      secure: false,
      auth: {
        user: this.config.get('EMAIL_USER'),
        pass: this.config.get('EMAIL_PASS'),
      },
    });
  }

  async sendApprovalEmail(email: string, name: string) {
    const adminUrl = this.config.get('ADMIN_FRONTEND_URL');
    await this.transporter.sendMail({
      from: `"Maaniko অ্যাডমিন" <${this.config.get('EMAIL_USER')}>`,
      to: email,
      subject: 'আপনার Maaniko অ্যাডমিন অ্যাক্সেস অনুমোদিত হয়েছে',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #062a54">
          <h2>আসসালামু আলাইকুম ${name || 'ব্যবহারকারী'},</h2>
          <p>অ্যাডমিন প্যানেলে যোগ দেওয়ার আপনার আবেদন <b>অনুমোদিত হয়েছে</b>।</p>
          <p>এখন আপনার Google অ্যাকাউন্ট দিয়ে লগ ইন করতে পারবেন।</p>
          <a href="${adminUrl}">অ্যাডমিন প্যানেলে যান</a>
        </div>
      `,
    });
  }
}
