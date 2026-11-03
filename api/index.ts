import type { Request, Response } from 'express'
import app from '../server/app.js'

export default function handler(request: Request, response: Response) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const route = url.searchParams.get('__route')
  if (route !== null) {
    url.searchParams.delete('__route')
    request.url = `/api/${route}${url.search}`
  }
  app(request, response)
}
