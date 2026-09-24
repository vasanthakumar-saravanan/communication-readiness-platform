export const Events = {
  USER_REGISTERED: 'USER_REGISTERED',
  ATTEMPT_COMPLETED: 'ATTEMPT_COMPLETED',
  CHECKLIST_ITEM_TOGGLED: 'CHECKLIST_ITEM_TOGGLED',
  MENTOR_VERIFIED: 'MENTOR_VERIFIED',
} as const;

export type EventName = typeof Events[keyof typeof Events];

export interface UserRegisteredPayload {
  userId: string;
  studentId: string;
  email: string;
  name: string;
}

export interface AttemptCompletedPayload {
  sessionId: string;
  studentId: string;
  overallScore: number;
}

export interface ChecklistItemToggledPayload {
  studentId: string;
  itemId: string;
  isCompleted: boolean;
  toggledBy: string;
}

export interface MentorVerifiedPayload {
  studentId: string;
  mentorId: string;
  verifiedAt: string;
}
