import { Hono } from 'hono'
import { renderer } from './renderer'
import api from './routes/api'
import { globalErrorHandler } from './middlewares/errorHandler'

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Centralized Global Error Handler
app.onError(globalErrorHandler())

// Serve standard Renderer for root index SPA React page
app.use(renderer)

app.get('/', (c) => {
  return c.render(
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>A Clean Arch Way API Server</h1>
      <p>Blazing fast, highly secure Firebase Authorization and Claim Assignment backend built on Cloudflare Workers.</p>
      <div style={{ marginTop: '2rem', background: '#f5f5f5', padding: '1rem', borderRadius: '8px' }}>
        <h3>API Reference Highlights</h3>
        <ul>
          <li><code>GET /api/me</code> - Verify Firebase ID token and fetch user details & fresh claims.</li>
          <li><code>POST /api/claims/assign</code> - Assign business roles (owner, moderator, staff) securely.</li>
        </ul>
      </div>
    </div>
  )
})

// Bind clean architecture API endpoints route
app.route('/api', api)

export default app
