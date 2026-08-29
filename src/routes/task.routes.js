import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { requireAnyRole, requireAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'
import { createAuditLog } from '../services/audit.service.js'
import { createNotification } from '../services/notification.service.js'

const router = Router()

const taskSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'REJECTED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().optional(),
})

const getActor = (req) => ({
  id: req.user?.id || req.admin?.id || null,
  email: req.user?.email || req.admin?.email || null,
})

router.get('/:projectId/tasks', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } })
    if (!project) return errorResponse(res, 'Project not found', 404)

    const { assignedTo, status } = req.query
    const where = { projectId: req.params.projectId }
    if (assignedTo === 'me') where.assignedTo = req.user?.id || req.admin?.id
    else if (assignedTo) where.assignedTo = assignedTo
    if (status) where.status = status

    const tasks = await prisma.task.findMany({
      where,
      include: {
        submissions: {
          select: { id: true, userId: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(res, { tasks })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/:projectId/tasks', requireAdmin, validateBody(taskSchema), async (req, res) => {
  try {
    const { title, description, assignedTo, status, priority, dueDate } = req.body

    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } })
    if (!project) return errorResponse(res, 'Project not found', 404)

    if (assignedTo) {
      const assignee = await prisma.user.findUnique({ where: { id: assignedTo } })
      if (!assignee) return errorResponse(res, 'Assigned user not found', 400)
    }

    const task = await prisma.task.create({
      data: {
        projectId: req.params.projectId,
        title,
        description,
        assignedTo,
        status: status || 'TODO',
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    })

    if (assignedTo) {
      await createNotification(
        assignedTo,
        'New task assigned',
        `You have been assigned the task "${title}".`,
        'TASK'
      )
    }

    const actor = getActor(req)
    await createAuditLog('TASK_CREATED', task.id, `Task created: ${title}`, actor.id, actor.email, req.ip)

    return successResponse(res, { task }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:projectId/tasks/:taskId', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), validateBody(taskSchema.partial()), async (req, res) => {
  try {
    const { taskId } = req.params
    const { title, description, assignedTo, status, priority, dueDate } = req.body

    const existing = await prisma.task.findUnique({ where: { id: taskId } })
    if (!existing) return errorResponse(res, 'Task not found', 404)

    const isAdmin = !!req.admin || req.user?.role === 'ADMIN'
    const isAssignee = req.user?.id && req.user.id === existing.assignedTo

    if (!isAdmin && !isAssignee) {
      return errorResponse(res, 'Access denied', 403)
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        title,
        description,
        assignedTo,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
    })

    if (assignedTo && assignedTo !== existing.assignedTo) {
      const assignee = await prisma.user.findUnique({ where: { id: assignedTo }, select: { fullName: true } })
      if (assignee) {
        await createNotification(
          assignedTo,
          'Task assigned to you',
          `You have been assigned the task "${task.title}".`,
          'TASK'
        )
      }
    }

    return successResponse(res, { task })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:projectId/tasks/:taskId/status', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const { taskId } = req.params
    const { status } = req.body

    if (!['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'REJECTED'].includes(status)) {
      return errorResponse(res, 'Invalid task status', 400)
    }

    const existing = await prisma.task.findUnique({ where: { id: taskId } })
    if (!existing) return errorResponse(res, 'Task not found', 404)

    const isAdmin = !!req.admin || req.user?.role === 'ADMIN'
    const isAssignee = req.user?.id && req.user.id === existing.assignedTo

    if (!isAdmin && !isAssignee) {
      return errorResponse(res, 'Access denied', 403)
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status },
    })

    return successResponse(res, { task })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/:projectId/tasks/:taskId', requireAdmin, async (req, res) => {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.taskId } })
    if (!existing) return errorResponse(res, 'Task not found', 404)

    await prisma.task.delete({ where: { id: req.params.taskId } })
    return successResponse(res, { message: 'Task deleted successfully' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
