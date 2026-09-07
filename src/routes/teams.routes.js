import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const teamSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  department: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
})

const memberSchema = z.object({
  teamId: z.string(),
  userId: z.string(),
  role: z.string().optional(),
})

const milestoneSchema = z.object({
  projectId: z.string(),
  title: z.string().min(2),
  description: z.string().optional(),
  dueDate: z.string(),
})

const riskSchema = z.object({
  projectId: z.string(),
  title: z.string().min(2),
  description: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  probability: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  owner: z.string().optional(),
  deadline: z.string().optional(),
})

const changeRequestSchema = z.object({
  projectId: z.string(),
  title: z.string().min(2),
  description: z.string().optional(),
  requestedBy: z.string(),
  reason: z.string().optional(),
  impact: z.string().optional(),
})

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { q, department, page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const where = {}

    if (q) where.name = { contains: q, mode: 'insensitive' }
    if (department) where.department = department

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        include: { members: { include: { user: true } }, _count: { select: { members: true } } },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.team.count({ where }),
    ])

    return successResponse(res, { teams, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) })
  } catch (error) {
    console.error('Teams error:', error)
    return errorResponse(res, 'Failed to fetch teams', 500)
  }
})

router.post('/', authenticateAdmin, validateBody(teamSchema), async (req, res) => {
  try {
    const team = await prisma.team.create({ data: req.body })
    await prisma.auditLog.create({
      data: { action: 'TEAM_CREATED', target: team.id, description: `Team "${team.name}" created`, actorEmail: req.admin?.email, result: 'SUCCESS' },
    })
    return successResponse(res, { team }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create team', 500)
  }
})

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: { members: { include: { user: true } }, _count: { select: { members: true } } },
    })
    if (!team) return errorResponse(res, 'Team not found', 404)
    return successResponse(res, { team })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch team', 500)
  }
})

router.post('/:id/members', authenticateAdmin, async (req, res) => {
  try {
    const { userId, role } = req.body
    const member = await prisma.teamMember.create({
      data: { teamId: req.params.id, userId, role: role || 'MEMBER' },
      include: { user: true },
    })
    await prisma.auditLog.create({
      data: { action: 'TEAM_MEMBER_ADDED', target: req.params.id, description: `User ${userId} added to team`, actorEmail: req.admin?.email, result: 'SUCCESS' },
    })
    return successResponse(res, { member }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to add member', 500)
  }
})

router.delete('/:id/members/:userId', authenticateAdmin, async (req, res) => {
  try {
    await prisma.teamMember.deleteMany({
      where: { teamId: req.params.id, userId: req.params.userId },
    })
    return successResponse(res, { message: 'Member removed' })
  } catch (error) {
    return errorResponse(res, 'Failed to remove member', 500)
  }
})

export default router
