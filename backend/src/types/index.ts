export type UserRole =
  | 'STUDENT'
  | 'FACULTY_MENTOR'
  | 'PROGRAM_ADMIN'
  | 'TRAINER'
  | 'PLACEMENT_COORDINATOR';

export type StudentTrack =
  | 'HOPE_ELITE'
  | 'HOPE_NON_ELITE'
  | 'PEP'
  | 'DEPARTMENT';

export type Difficulty = 'EASY' | 'MEDIUM' | 'ADVANCED';

export type SessionType = 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION';

export type SessionStatus = 'ACTIVE' | 'CONCLUDED' | 'ABANDONED' | 'FLAGGED';
