import type { ReasonCode } from "./reason-codes.js";

export class DomainError extends Error {
  constructor(
    public readonly reasonCode: ReasonCode,
    public readonly httpStatus: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function badRequest(code: ReasonCode, message: string, details?: Record<string, unknown>): DomainError {
  return new DomainError(code, 400, message, details);
}

export function notFound(code: ReasonCode, message: string, details?: Record<string, unknown>): DomainError {
  return new DomainError(code, 404, message, details);
}

export function conflict(code: ReasonCode, message: string, details?: Record<string, unknown>): DomainError {
  return new DomainError(code, 409, message, details);
}
