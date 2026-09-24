export interface ApiSuccess<T> {
  status: 'success';
  data: T;
}

export interface ApiError {
  status: 'error';
  message: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
