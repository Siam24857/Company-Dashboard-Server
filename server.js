import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'

import { Router } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'

import { prisma } from './src/utils/db.js'

import authRoutes from './src/routes/auth.routes.js'
import adminRoutes from './src/routes/admin.routes.js'
import userRoutes from './src/routes/user.routes.js'
import profileRoutes from './src/routes/profile.routes.js'
import attendanceRoutes from './src/routes/attendance.routes.js'
import projectRoutes from './src/routes/project.routes.js'
import taskRoutes from './src/routes/task.routes.js'
import taskSubmissionRoutes from './src/routes/task-submission.routes.js'
import messageRoutes from './src/routes/message.routes.js'
import notificationRoutes from './src/routes/notification.routes.js'
import emailRoutes from './src/routes/email.routes.js'
import leaveRoutes from './src/routes/leave.routes.js'
import bdRoutes from './src/routes/bd.routes.js'
import salesRoutes from './src/routes/sales.routes.js'
import opsRoutes from './src/routes/ops.routes.js'
import announcementRoutes from './src/routes/announcement.routes.js'
import auditRoutes from './src/routes/audit.routes.js'
import cloudinaryRoutes from './src/routes/cloudinary.routes.js'
import dashboardRoutes from './src/routes/dashboard.routes.js'
import walletRoutes from './src/routes/wallet.routes.js'
import analyticsRoutes from './src/routes/analytics.routes.js'
import documentRoutes from './src/routes/documents.routes.js'
import supportRoutes from './src/routes/support.routes.js'
import calendarRoutes from './src/routes/calendar.routes.js'
import securityRoutes from './src/routes/security.routes.js'
import activityRoutes from './src/routes/activity.routes.js'
import bulkRoutes from './src/routes/bulk.routes.js'
import teamsRoutes from './src/routes/teams.routes.js'
import employeesRoutes from './src/routes/employees.routes.js'
import projectDetailRoutes from './src/routes/project-detail.routes.js'
import enterpriseRoutes from './src/routes/enterprise.routes.js'
import commandCenterRoutes from './src/routes/command-center.routes.js'
import { startCronJobs } from './src/services/attendance.cron.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.set('trust proxy', 1)

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://vercel.live"],
        "script-src-elem": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://vercel.live"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://vercel.live", "ws:", "http://localhost:*"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    },
  })
)
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['http://localhost:3000']

const isOriginAllowed = (origin) => {
  if (!origin) return true
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return true
  return allowedOrigins.some((o) => o.includes('*') && origin.match(new RegExp('^' + o.replace(/\*/g, '.*') + '$')))
}

app.use(
  cors({
    origin: isOriginAllowed,
    credentials: true,
  })
)

const isDevelopment = process.env.NODE_ENV === 'development'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 1000 : 500,
  message: { message: 'Too many requests, please try again later.' },
  validate: false,
})
app.use(limiter)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 1000 : 50,
  message: { message: 'Too many authentication attempts, please try again later.' },
  validate: false,
})

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

app.get('/', (req, res) => res.json({ name: 'ideon-dashboard-backend', status: 'running', timestamp: new Date().toISOString() }))
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }))

app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/admin', authLimiter, adminRoutes)
app.use('/api/users', userRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/projects', taskRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/email', emailRoutes)
app.use('/api/leave', leaveRoutes)
app.use('/api/bd', bdRoutes)
app.use('/api/sales', salesRoutes)
app.use('/api/ops', opsRoutes)
app.use('/api/announcements', announcementRoutes)
app.use('/api/tasks', taskSubmissionRoutes)
app.use('/api/submissions', taskSubmissionRoutes)
app.use('/api/admin/audit-logs', auditRoutes)
app.use('/api/upload', cloudinaryRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/support', supportRoutes)
app.use('/api/calendar', calendarRoutes)
app.use('/api/security', securityRoutes)
app.use('/api/activity', activityRoutes)
app.use('/api/teams', teamsRoutes)
app.use('/api/employees', employeesRoutes)
app.use('/api/projects', projectDetailRoutes)
app.use('/api/enterprise', enterpriseRoutes)
app.use('/api/admin', commandCenterRoutes)
app.use('/api/bulk', bulkRoutes)

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ message: 'Internal server error', error: err.message })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  startCronJobs()
})
