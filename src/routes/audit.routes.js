import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { requireAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'

const router = Router()

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { action, actorEmail, page = 1, limit = 50 } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const where = {}
    if (action) where.action = action
    if (actorEmail) where.actorEmail = { contains: actorEmail, mode: 'insensitive' }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.auditLog.count({ where }),
    ])

    return successResponse(res, {
      logs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
