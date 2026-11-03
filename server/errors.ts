export class HttpError extends Error {
  public readonly status: number
  public readonly code: string

  constructor(
    status: number,
    message: string,
    code = 'request_error',
  ) {
    super(message)
    this.status = status
    this.code = code
    this.name = 'HttpError'
  }
}
