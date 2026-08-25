import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'

const router = Router()

const getUserId = (req) => req.user?.id || req.admin?.id || null

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) {
      return errorResponse(res, 'Authentication required', 401)
    }

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(res, { notifications })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) {
      return errorResponse(res, 'Authentication required', 401)
    }

    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    })

    return successResponse(res, { count })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/read-all', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) {
      return errorResponse(res, 'Authentication required', 401)
    }

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    })

    return successResponse(res, { message: 'All notifications marked as read' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) {
      return errorResponse(res, 'Authentication required', 401)
    }

    await prisma.notification.update({
      where: { id: req.params.id, userId },
      data: { isRead: true },
    })

    return successResponse(res, { message: 'Marked as read' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
