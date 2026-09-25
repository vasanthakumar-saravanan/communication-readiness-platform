// Temporary stub — delete when M4 delivers real CreditService implementation.
// M4 interface: consume(studentId, amount, reason, referenceId): Promise<{ newBalance: number }>
// Throws AppError(402, 'Insufficient credits', 'INSUFFICIENT_CREDITS')

export const CreditServiceStub = {
  consume: async (
    _studentId: string,
    _amount: number,
    _reason: string,
    _referenceId: string
  ): Promise<{ newBalance: number }> => {
    return { newBalance: 50 };
  },
};

// Re-export as CreditService so the consumer code doesn't need to change when M4 delivers
export const CreditService = CreditServiceStub;
