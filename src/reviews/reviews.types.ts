export type ReviewIdentity = {
  guestId: string;
  customerToken?: string;
};

export type SubmitOrderReviewInput = {
  orderId: string;
  rating: number;
  comment?: string;
  selectedOrderItemId?: string | null;
};

export type DismissReviewPromptInput = {
  orderId: string;
  neverAskAgain?: boolean;
};
