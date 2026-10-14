export type DanawaFailureStage = "VALIDATION" | "HTTP" | "PARSE";

export class DanawaIntegrationError extends Error {
  constructor(
    message: string,
    public readonly stage: DanawaFailureStage,
    public readonly status?: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "DanawaIntegrationError";
  }
}
