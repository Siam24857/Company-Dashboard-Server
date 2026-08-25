import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { welcomeApproved, suspendedEmail, passwordResetEmail } from '../services/email.service.js'
import { sendEmail } from '../services/email.service.js'
import { hashPassword } from '../utils/hash.utils.js'
import { validatePassword } from '../utils/hash.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const createUserSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  role: z.enum(['BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER']),
  department: z.enum(['BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER']),
})

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  role: z.enum(['BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER']).optional(),
  department: z.enum(['BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER']).optional(),
  bio: z.string().optional(),
  skills: z.array(z.string()).optional(),
  linkedinUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
})

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { status, department, role, search, page = 1, limit = 10 } = req.query

    const where = {}
    if (status) where.status = status
    if (department) where.department = department
    if (role) where.role = role
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          department: true,
          status: true,
          createdAt: true,
          avatarUrl: true,
          bio: true,
          skills: true,
        },
      }),
      prisma.user.count({ where }),
    ])

    return successResponse(res, {
      users,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        department: true,
          status: true,
          createdAt: true,
          avatarUrl: true,
          bio: true,
          skills: true,
          linkedinUrl: true,
        portfolioUrl: true,
        attendances: { take: 10, orderBy: { date: 'desc' } },
        projects: {
          include: { project: true },
        },
      },
    })

    if (!user) return errorResponse(res, 'User not found', 404)

    const { password: _, ...userWithoutPassword } = user
    return successResponse(res, { user: userWithoutPassword })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/', authenticateAdmin, validateBody(createUserSchema), async (req, res) => {
  try {
    const { fullName, email, password, phone, role, department } = req.body

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return errorResponse(res, 'Email already in use', 400)

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        password: hashedPassword,
        phone,
        role,
        department,
        status: 'ACTIVE',
      },
    })

    await sendEmail(email, ...Object.values(welcomeApproved(fullName, `${process.env.FRONTEND_URL}/login`)))

    const { password: _, ...userWithoutPassword } = user
    return successResponse(res, { user: userWithoutPassword }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id', authenticateAdmin, validateBody(updateUserSchema), async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.body,
    })

    const { password: _, ...userWithoutPassword } = user
    return successResponse(res, { user: userWithoutPassword })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body

    const user = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!user) return errorResponse(res, 'User not found', 404)

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
    })

    if (status === 'ACTIVE') {
      await sendEmail(user.email, ...Object.values(welcomeApproved(user.fullName, `${process.env.FRONTEND_URL}/login`)))
    } else if (status === 'SUSPENDED') {
      await sendEmail(user.email, ...Object.values(suspendedEmail(user.fullName)))
    }

    const { password: _, ...userWithoutPassword } = updatedUser
    return successResponse(res, { user: userWithoutPassword })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/reset-password', authenticateAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body

    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.isValid) {
      return errorResponse(res, Object.values(passwordValidation.errors).filter(Boolean).join(', '), 400)
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!user) return errorResponse(res, 'User not found', 404)

    const hashedPassword = await hashPassword(newPassword)

    await prisma.user.update({
      where: { id: req.params.id },
      data: { password: hashedPassword },
    })

    await sendEmail(user.email, ...Object.values(passwordResetEmail(user.fullName, newPassword)))

    return successResponse(res, { message: 'Password reset successfully' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'User deleted successfully' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
