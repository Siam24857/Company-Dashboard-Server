import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'

const router = Router()

router.get('/', authenticate, async (req, res) => {
  try {
    const { action, userId, page = 1, limit = 50 } = req.query
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(parseInt(limit) || 50, 100)
    const where = {}
    if (action) where.action = action
    if (userId) where.userId = userId
    const [activities, total] = await Promise.all([
      prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) || 50 }),
      prisma.activityLog.count({ where }),
    ])
    return successResponse(res, {
      activities,
      pagination: { page: parseInt(page) || 1, limit: parseInt(limit) || 50, total, pages: Math.ceil(total / (parseInt(limit) || 50)) },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/recent', authenticateAdmin, async (req, res) => {
  try {
    const activities = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return successResponse(res, { activities })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
