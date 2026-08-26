import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'
import { createAuditLog } from '../services/audit.service.js'

const router = Router()

router.get('/', authenticate, async (req, res) => {
  try {
    let userId = req.user?.id

    if (!userId && req.admin?.id) {
      const adminUser = await prisma.user.findUnique({
        where: { email: req.admin.email },
        select: { id: true },
      })
      if (adminUser) {
        userId = adminUser.id
      }
    }

    if (!userId) {
      return successResponse(res, {
        user: {
          id: req.admin?.id,
          fullName: 'Administrator',
          email: req.admin?.email,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        profession: true,
        bio: true,
        skills: true,
        role: true,
        department: true,
        status: true,
        createdAt: true,
        avatarUrl: true,
        avatarPublicId: true,
        coverImageUrl: true,
        coverPublicId: true,
        resumeUrl: true,
        resumePublicId: true,
        githubUrl: true,
        linkedinUrl: true,
        portfolioUrl: true,
        bestProject: true,
        bestProjectUrl: true,
      },
    })

    return successResponse(res, { user })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/', authenticate, validateBody(z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  profession: z.string().optional(),
  bio: z.string().optional(),
  skills: z.array(z.string()).optional(),
  linkedinUrl: z.string().url().or(z.literal('')).optional(),
  portfolioUrl: z.string().url().or(z.literal('')).optional(),
  githubUrl: z.string().url().or(z.literal('')).optional(),
  bestProject: z.string().optional(),
  bestProjectUrl: z.string().url().or(z.literal('')).optional(),
}).partial()), async (req, res) => {
  try {
    let userId = req.user?.id

    if (!userId && req.admin?.id) {
      const adminUser = await prisma.user.findUnique({
        where: { email: req.admin.email },
        select: { id: true },
      })
      if (adminUser) {
        userId = adminUser.id
      }
    }

    if (!userId) {
      return errorResponse(res, 'No user account found to update', 400)
    }

    const cleaned = Object.fromEntries(
      Object.entries(req.body).filter(([_, v]) => v !== '' && v !== undefined)
    )

    if (Object.keys(cleaned).length === 0) {
      return errorResponse(res, 'No valid fields to update', 400)
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: cleaned,
    })

    const actorId = req.user?.id || req.admin?.id
    const actorEmail = req.user?.email || req.admin?.email
    await createAuditLog('PROFILE_UPDATED', user.id, 'User updated their profile', actorId, actorEmail, req.ip)

    const { password: _, ...userWithoutPassword } = user
    return successResponse(res, { user: userWithoutPassword })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/password', authenticate, validateBody(z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
})), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    const bcrypt = await import('bcryptjs')
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })

    const isValid = await bcrypt.compare(currentPassword, user.password)
    if (!isValid) {
      return errorResponse(res, 'Current password is incorrect', 400)
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12)

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    })

    await createAuditLog('PASSWORD_CHANGED', req.user.id, 'User changed their password', req.user.id, req.user.email, req.ip)

    return successResponse(res, { message: 'Password changed successfully' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
