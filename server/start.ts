
import app from './app.js'

const port = Number(process.env.API_PORT) || 3001

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`NovaStore listening on port ${port}`)
})

function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down NovaStore...`)

  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
