import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

router.get('/leads', authenticate, async (req, res) => {
  try {
    const leads = await prisma.bdLead.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse(res, { leads })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/leads', authenticate, validateBody(z.object({
  company: z.string().min(1),
  contact: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  value: z.number().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  assignedTo: z.string().optional(),
  lastContact: z.string().optional(),
})), async (req, res) => {
  try {
    const lead = await prisma.bdLead.create({ data: req.body })
    return successResponse(res, { lead }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/leads/:id', authenticate, validateBody(z.object({
  company: z.string().optional(),
  contact: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  value: z.number().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  assignedTo: z.string().optional(),
  lastContact: z.string().optional(),
}).partial()), async (req, res) => {
  try {
    const lead = await prisma.bdLead.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { lead })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/leads/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.bdLead.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Lead deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/proposals', authenticate, async (req, res) => {
  try {
    const proposals = await prisma.bdProposal.findMany({ orderBy: { sentDate: 'desc' } })
    return successResponse(res, { proposals })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/proposals', authenticate, validateBody(z.object({
  company: z.string().min(1),
  value: z.number().optional(),
  sentDate: z.string(),
  status: z.string().optional(),
  notes: z.string().optional(),
})), async (req, res) => {
  try {
    const proposal = await prisma.bdProposal.create({ data: { ...req.body, sentDate: new Date(req.body.sentDate) } })
    return successResponse(res, { proposal }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/proposals/:id', authenticate, validateBody(z.object({
  company: z.string().optional(),
  value: z.number().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
}).partial()), async (req, res) => {
  try {
    const proposal = await prisma.bdProposal.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { proposal })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/proposals/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.bdProposal.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Proposal deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/reports', authenticate, async (req, res) => {
  try {
    const leads = await prisma.bdLead.count()
    const proposals = await prisma.bdProposal.count()
    const closedDeals = await prisma.bdLead.count({ where: { status: 'CLOSED' } })

    return successResponse(res, { leads, proposals, closedDeals })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
