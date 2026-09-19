export type MessengerWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MessengerEvent[];
  }>;
};

export type MessengerEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload?: string };
  };
  postback?: {
    mid?: string;
    title?: string;
    payload?: string;
  };
};

export type MessengerButton =
  | {
      type: 'postback';
      title: string;
      payload: string;
    }
  | {
      type: 'web_url';
      title: string;
      url: string;
      webview_height_ratio?: 'compact' | 'tall' | 'full';
    };

export type MessengerCard = {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  buttons: MessengerButton[];
};

export type MessengerQuickReply = {
  title: string;
  payload: string;
};

export type ConversationStage =
  | 'BROWSING'
  | 'AWAITING_PRODUCT'
  | 'AWAITING_VARIANT'
  | 'AWAITING_QUANTITY'
  | 'AWAITING_CUSTOMER'
  | 'AWAITING_CONFIRMATION'
  | 'ORDER_PROCESSING'
  | 'ORDERED';

export type AiHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};
