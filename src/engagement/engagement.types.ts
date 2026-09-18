export type EngagementIdentity = {
  guestId: string;
  customerToken?: string;
};

export type ApplyReferralInput = {
  code: string;
};

export type ReorderPreferenceInput = {
  reminderId: string;
  enabled: boolean;
  dueAt?: string;
};

export type RewardAdjustmentInput = {
  customerId: string;
  points: number;
  reason: string;
};
