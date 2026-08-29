import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin, requireAnyRole } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const projectSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  status: z.enum(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  department: z.enum(['BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER']),
  startDate: z.string(),
  dueDate: z.string().optional(),
})

router.get('/', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const { department } = req.query
    const where = {}

    if (department) where.department = department

    if (req.user && req.user.role !== 'ADMIN') {
      const userProjects = await prisma.userProject.findMany({
        where: { userId: req.user.id },
        select: { projectId: true },
      })
      const assignedTaskProjects = await prisma.task.findMany({
        where: { assignedTo: req.user.id },
        select: { projectId: true },
      })
      where.OR = [
        { id: { in: userProjects.map((p) => p.projectId) } },
        { department: req.user.department },
        { id: { in: assignedTaskProjects.map((t) => t.projectId) } },
      ]
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        members: { include: { user: { select: { fullName: true, email: true, role: true, avatarUrl: true } } } },
        tasks: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(res, { projects })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/:id', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { fullName: true, email: true, role: true, avatarUrl: true } } } },
        tasks: true,
      },
    })

    if (!project) return errorResponse(res, 'Project not found', 404)

    return successResponse(res, { project })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/', authenticateAdmin, validateBody(projectSchema), async (req, res) => {
  try {
    const { title, description, status, priority, department, startDate, dueDate, members } = req.body

    const project = await prisma.project.create({
      data: {
        title,
        description,
        status: status || 'PLANNING',
        priority: priority || 'MEDIUM',
        department,
        startDate: new Date(startDate),
        dueDate: dueDate ? new Date(dueDate) : null,
        members: members?.length > 0 ? { create: members.map((m) => ({ userId: m.userId, role: m.role || 'Member' })) } : undefined,
      },
      include: { members: { include: { user: true } } },
    })

    return successResponse(res, { project }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id', authenticateAdmin, validateBody(projectSchema.partial()), async (req, res) => {
  try {
    const { title, description, status, priority, department, startDate, dueDate, members } = req.body

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        status,
        priority,
        department,
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        ...(members && { members: { deleteMany: {}, create: members.map((m) => ({ userId: m.userId, role: m.role || 'Member' })) } }),
      },
      include: { members: { include: { user: true } } },
    })

    return successResponse(res, { project })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Project deleted successfully' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/:id/members', authenticateAdmin, async (req, res) => {
  try {
    const { userId, role } = req.body

    await prisma.userProject.create({
      data: { userId, projectId: req.params.id, role: role || 'Member' },
    })

    return successResponse(res, { message: 'Member added successfully' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/:id/members/:userId', authenticateAdmin, async (req, res) => {
  try {
    await prisma.userProject.delete({
      where: { userId_projectId: { userId: req.params.userId, projectId: req.params.id } },
    })

    return successResponse(res, { message: 'Member removed successfully' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
