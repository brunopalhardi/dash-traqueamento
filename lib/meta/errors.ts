export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly httpStatus?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export class MetaAuthError extends MetaApiError {
  constructor(message: string, code?: number, raw?: unknown) {
    super(message, code, undefined, 401, raw);
    this.name = "MetaAuthError";
  }
}

export class MetaRateLimitError extends MetaApiError {
  constructor(message: string, raw?: unknown) {
    super(message, undefined, undefined, 429, raw);
    this.name = "MetaRateLimitError";
  }
}
