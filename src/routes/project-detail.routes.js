import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

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
  mitigationPlan: z.string().optional(),
  impact: z.string().optional(),
})

const changeRequestSchema = z.object({
  projectId: z.string(),
  title: z.string().min(2),
  description: z.string().optional(),
  requestedBy: z.string(),
  reason: z.string().optional(),
  impact: z.string().optional(),
})

router.get('/:projectId', authenticateAdmin, async (req, res) => {
  try {
    const milestones = await prisma.milestone.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { dueDate: 'asc' },
    })
    return successResponse(res, { milestones })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch milestones', 500)
  }
})

router.post('/milestone', authenticateAdmin, validateBody(milestoneSchema), async (req, res) => {
  try {
    const milestone = await prisma.milestone.create({ data: req.body })
    return successResponse(res, { milestone }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create milestone', 500)
  }
})

router.patch('/milestone/:id', authenticateAdmin, async (req, res) => {
  try {
    const milestone = await prisma.milestone.update({
      where: { id: req.params.id },
      data: req.body,
    })
    return successResponse(res, { milestone })
  } catch (error) {
    return errorResponse(res, 'Failed to update milestone', 500)
  }
})

router.get('/:projectId/risks', authenticateAdmin, async (req, res) => {
  try {
    const risks = await prisma.risk.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { severity: 'desc' },
    })
    return successResponse(res, { risks })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch risks', 500)
  }
})

router.post('/risk', authenticateAdmin, validateBody(riskSchema), async (req, res) => {
  try {
    const risk = await prisma.risk.create({ data: req.body })
    await prisma.auditLog.create({
      data: { action: 'RISK_CREATED', target: risk.id, description: `Risk "${risk.title}" created`, actorEmail: req.admin?.email, result: 'SUCCESS' },
    })
    return successResponse(res, { risk }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create risk', 500)
  }
})

router.patch('/risk/:id', authenticateAdmin, async (req, res) => {
  try {
    const risk = await prisma.risk.update({
      where: { id: req.params.id },
      data: req.body,
    })
    return successResponse(res, { risk })
  } catch (error) {
    return errorResponse(res, 'Failed to update risk', 500)
  }
})

router.get('/:projectId/changes', authenticateAdmin, async (req, res) => {
  try {
    const changes = await prisma.changeRequest.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'desc' },
    })
    return successResponse(res, { changes })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch change requests', 500)
  }
})

router.post('/change', authenticateAdmin, validateBody(changeRequestSchema), async (req, res) => {
  try {
    const change = await prisma.changeRequest.create({ data: req.body })
    return successResponse(res, { change }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create change request', 500)
  }
})

router.patch('/change/:id', authenticateAdmin, async (req, res) => {
  try {
    const change = await prisma.changeRequest.update({
      where: { id: req.params.id },
      data: req.body,
    })
    await prisma.auditLog.create({
      data: { action: 'CHANGE_REQUEST_UPDATED', target: change.id, description: `Change request "${change.title}" updated to ${change.status}`, actorEmail: req.admin?.email, result: 'SUCCESS' },
    })
    return successResponse(res, { change })
  } catch (error) {
    return errorResponse(res, 'Failed to update change request', 500)
  }
})

export default router
