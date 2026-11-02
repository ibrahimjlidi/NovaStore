import type { Request, Response } from 'express'
import app from '../server/app.js'

export default function handler(request: Request, response: Response) {
  app(request, response)
}
