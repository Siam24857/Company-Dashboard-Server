import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const employeeSchema = z.object({
  userId: z.string(),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  availability: z.string().optional(),
  skills: z.string().array().optional(),
})

const employeeProfileSchema = z.object({
  userId: z.string(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  availability: z.string().optional(),
  skills: z.string().array().optional(),
})

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { q, department, page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const where = {}

    if (q) where['user.fullName'] = { contains: q, mode: 'insensitive' }
    if (department) where.department = department

    const [employees, total] = await Promise.all([
      prisma.user.findMany({
        where: { role: { not: 'ADMIN' }, ...where },
        include: { employeeProfile: true, _count: { select: { taskSubmissions: true } } },
        skip,
        take: Number(limit),
        orderBy: { fullName: 'asc' },
      }),
      prisma.user.count({ where: { role: { not: 'ADMIN' }, ...where } }),
    ])

    return successResponse(res, { employees, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) })
  } catch (error) {
    console.error('Employees error:', error)
    return errorResponse(res, 'Failed to fetch employees', 500)
  }
})

router.get('/:userId', authenticateAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: {
        employeeProfile: true,
        _count: { select: { taskSubmissions: true, projects: true } },
        projects: { include: { project: true } },
        attendances: { orderBy: { date: 'desc' }, take: 30 },
      },
    })
    if (!user) return errorResponse(res, 'Employee not found', 404)

    const taskCounts = await prisma.task.groupBy({
      by: ['assignedTo'],
      _count: { _all: true },
      where: { assignedTo: req.params.userId },
    })
    const completedTasks = await prisma.task.count({ where: { assignedTo: req.params.userId, status: 'COMPLETED' } })
    const overdueTasks = await prisma.task.count({ where: { assignedTo: req.params.userId, status: { not: 'COMPLETED' }, dueDate: { lt: new Date() } } })
    const assignedTasks = taskCounts[0]?._count._all || 0

    return successResponse(res, {
      user,
      workload: {
        assignedTasks,
        completedTasks,
        pendingTasks: assignedTasks - completedTasks,
        overdueTasks,
        capacity: assignedTasks > 0 ? Math.round((completedTasks / assignedTasks) * 100) : 0,
      },
    })
  } catch (error) {
    console.error('Employee profile error:', error)
    return errorResponse(res, 'Failed to fetch employee profile', 500)
  }
})

router.patch('/:userId/profile', authenticateAdmin, async (req, res) => {
  try {
    const profile = await prisma.employeeProfile.upsert({
      where: { userId: req.params.userId },
      update: req.body,
      create: { userId: req.params.userId, ...req.body },
    })
    await prisma.auditLog.create({
      data: { action: 'EMPLOYEE_PROFILE_UPDATED', target: req.params.userId, description: 'Employee profile updated', actorEmail: req.admin?.email, result: 'SUCCESS' },
    })
    return successResponse(res, { profile })
  } catch (error) {
    return errorResponse(res, 'Failed to update employee profile', 500)
  }
})

router.get('/:userId/workload', authenticateAdmin, async (req, res) => {
  try {
    const [entries, totalHours] = await Promise.all([
      prisma.workloadEntry.findMany({
        where: { employeeId: req.params.userId },
        orderBy: { date: 'desc' },
        take: 30,
      }),
      prisma.workloadEntry.aggregate({
        where: { employeeId: req.params.userId },
        _sum: { hoursLogged: true },
      }),
    ])

    return successResponse(res, {
      entries,
      totalHours: totalHours._sum.hoursLogged || 0,
    })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch workload', 500)
  }
})

export default router
