/** Primitive aliases used across the domain. */
export type UUID = string;
/** ISO-8601 timestamp, e.g. `2024-05-21T10:35:00.000Z`. */
export type ISODateString = string;
/** Calendar date with no time component, e.g. `2024-05-21`. */
export type CalendarDate = string;
/** 24-hour clock time, e.g. `09:30`. */
export type ClockTime = string;

/** Monetary amounts travel as integer minor units to avoid float drift. */
export type MinorUnits = number;

export interface Money {
  /** Amount in minor units (cents). */
  amount: MinorUnits;
  currency: 'EUR' | 'USD';
}

export type SortDirection = 'asc' | 'desc';

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: SortDirection;
  search?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Every successful list endpoint returns this shape. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Envelope applied by the API's global response interceptor. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
  timestamp: ISODateString;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

/** Envelope produced by the API's global exception filter. */
export interface ApiError {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  errors?: ApiFieldError[];
  path: string;
  timestamp: ISODateString;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

export interface AuthTokens {
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
}

/** Model fields shared by every persisted entity. */
export interface Timestamped {
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
}
