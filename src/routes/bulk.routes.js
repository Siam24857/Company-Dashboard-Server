import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const bulkUserActionSchema = z.object({
  userIds: z.array(z.string()).min(1),
  action: z.enum(['activate', 'suspend', 'delete']),
})

router.post('/users', authenticateAdmin, validateBody(bulkUserActionSchema), async (req, res) => {
  try {
    const { userIds, action } = req.body
    let result
    switch (action) {
      case 'activate':
        result = await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { status: 'ACTIVE' } })
        break
      case 'suspend':
        result = await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { status: 'SUSPENDED' } })
        break
      case 'delete':
        result = await prisma.user.deleteMany({ where: { id: { in: userIds } } })
        break
      default:
        return errorResponse(res, 'Invalid action', 400)
    }
    return successResponse(res, { affected: result.count, message: `Bulk ${action} completed` })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

const bulkTaskActionSchema = z.object({
  taskIds: z.array(z.string()).min(1),
  action: z.enum(['complete', 'delete', 'assign']),
  assignedTo: z.string().optional(),
})

router.post('/tasks', authenticateAdmin, validateBody(bulkTaskActionSchema), async (req, res) => {
  try {
    const { taskIds, action, assignedTo } = req.body
    let result
    switch (action) {
      case 'complete':
        result = await prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { status: 'COMPLETED' } })
        break
      case 'assign':
        if (!assignedTo) return errorResponse(res, 'assignedTo required', 400)
        result = await prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { assignedTo } })
        break
      case 'delete':
        result = await prisma.task.deleteMany({ where: { id: { in: taskIds } } })
        break
      default:
        return errorResponse(res, 'Invalid action', 400)
    }
    return successResponse(res, { affected: result.count, message: `Bulk ${action} completed` })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
