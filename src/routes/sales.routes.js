import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

router.get('/calls', authenticate, async (req, res) => {
  try {
    const calls = await prisma.salesCall.findMany({ orderBy: { callDate: 'desc' } })
    return successResponse(res, { calls })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/calls', authenticate, validateBody(z.object({
  company: z.string().min(1),
  contact: z.string().min(1),
  callDate: z.string(),
  duration: z.number().optional(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
})), async (req, res) => {
  try {
    const call = await prisma.salesCall.create({ data: { ...req.body, callDate: new Date(req.body.callDate) } })
    return successResponse(res, { call }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/calls/:id', authenticate, validateBody(z.object({
  company: z.string().optional(),
  contact: z.string().optional(),
  duration: z.number().optional(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
}).partial()), async (req, res) => {
  try {
    const call = await prisma.salesCall.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { call })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/calls/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.salesCall.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Call log deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/pipeline', authenticate, async (req, res) => {
  try {
    const pipeline = await prisma.salesPipeline.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse(res, { pipeline })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/pipeline', authenticate, validateBody(z.object({
  company: z.string().min(1),
  value: z.number().optional(),
  stage: z.string().optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
})), async (req, res) => {
  try {
    const deal = await prisma.salesPipeline.create({ data: req.body })
    return successResponse(res, { deal }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/pipeline/:id', authenticate, validateBody(z.object({
  company: z.string().optional(),
  value: z.number().optional(),
  stage: z.string().optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
}).partial()), async (req, res) => {
  try {
    const deal = await prisma.salesPipeline.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { deal })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/pipeline/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.salesPipeline.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Pipeline item deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/followups', authenticate, async (req, res) => {
  try {
    const followups = await prisma.salesFollowUp.findMany({ orderBy: { dueDate: 'asc' } })
    return successResponse(res, { followups })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/followups', authenticate, validateBody(z.object({
  contact: z.string().min(1),
  company: z.string().min(1),
  dueDate: z.string(),
  time: z.string().optional(),
  notes: z.string().optional(),
})), async (req, res) => {
  try {
    const followup = await prisma.salesFollowUp.create({ data: { ...req.body, dueDate: new Date(req.body.dueDate) } })
    return successResponse(res, { followup }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/followups/:id/done', authenticate, async (req, res) => {
  try {
    const followup = await prisma.salesFollowUp.update({ where: { id: req.params.id }, data: { done: true } })
    return successResponse(res, { followup })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/followups/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.salesFollowUp.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Follow-up deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/reports', authenticate, async (req, res) => {
  try {
    const calls = await prisma.salesCall.count()
    const wonDeals = await prisma.salesPipeline.count({ where: { stage: 'CLOSED_WON' } })

    return successResponse(res, { calls, wonDeals })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
