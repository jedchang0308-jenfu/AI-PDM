export class NumberStateFlowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "NumberStateFlowError";
  }
}

export type NumberStateActor = {
  userId: string;
  companyId: string;
  role: string;
  roles?: string[];
};
