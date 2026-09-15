import { Injectable } from '@nestjs/common';

@Injectable()
export class CommerceAiService {
  async abandonedCartMessage(input: {
    name?: string | null;
    phone?: string | null;
    subtotal: number;
    itemNames: string[];
    recoveryUrl?: string;
  }) {
    const fallback = `${
      input.name ? `${input.name} আপু, ` : ''
    }আপনার Maaniko কার্টে ${input.itemNames.slice(0, 3).join(', ')}${
      input.itemNames.length > 3 ? ' সহ আরও কিছু পণ্য' : ''
    } রাখা আছে। মোট মূল্য প্রায় ৳${Math.round(
      input.subtotal,
    )}। চাইলে আগের জায়গা থেকেই আবার অর্ডার সম্পন্ন করতে পারবেন।${
      input.recoveryUrl ? ` ${input.recoveryUrl}` : ''
    }`;

    const apiKey = process.env.GROQ_API_KEY?.trim();
    const model = process.env.GROQ_MODEL?.trim();
    if (!apiKey || !model) return { message: fallback, source: 'fallback' };

    try {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: 180,
            messages: [
              {
                role: 'system',
                content:
                  'You write short respectful Bangla ecommerce cart-recovery messages for a Bangladesh mother-and-baby care brand. Never invent discounts, urgency, medical claims, or availability. Keep it under 70 Bangla words. If recoveryUrl is provided, include that URL exactly once.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  customerName: input.name ?? undefined,
                  cartValue: input.subtotal,
                  items: input.itemNames.slice(0, 5),
                  recoveryUrl: input.recoveryUrl,
                }),
              },
            ],
          }),
        },
      );

      if (!response.ok) return { message: fallback, source: 'fallback' };
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const message = data.choices?.[0]?.message?.content?.trim();
      return {
        message: message || fallback,
        source: message ? 'groq' : 'fallback',
      };
    } catch {
      return { message: fallback, source: 'fallback' };
    }
  }
}
