import express, { Router } from 'express'
import { register, login, forgotPassword, resetPassword, logout, getMe } from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validate.middleware.js'
import { z } from 'zod'

const router = Router()

const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  role: z.enum(['BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER']),
  department: z.enum(['BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER']),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const forgotSchema = z.object({ email: z.string().email() })
const resetSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8),
})

router.post('/register', validateBody(registerSchema), register)
router.post('/login', validateBody(loginSchema), login)
router.post('/forgot-password', validateBody(forgotSchema), forgotPassword)
router.post('/reset-password', validateBody(resetSchema), resetPassword)
router.post('/logout', authenticate, logout)
router.get('/me', authenticate, getMe)

export default router
