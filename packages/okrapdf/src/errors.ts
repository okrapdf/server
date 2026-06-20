import type { RuntimeErrorCode, StructuredOutputErrorCode } from './types';

export class OkraRuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: RuntimeErrorCode, message: string, status = 500, details?: unknown) {
    super(message);
    this.name = 'OkraRuntimeError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class StructuredOutputError extends OkraRuntimeError {
  readonly code: StructuredOutputErrorCode;

  constructor(code: StructuredOutputErrorCode, message: string, status: number, details?: unknown) {
    super(code, message, status, details);
    this.name = 'StructuredOutputError';
    this.code = code;
  }
}

