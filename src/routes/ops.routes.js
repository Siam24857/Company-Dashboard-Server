import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

router.get('/tasks', authenticate, async (req, res) => {
  try {
    const tasks = await prisma.opsTask.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse(res, { tasks })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/tasks', authenticate, validateBody(z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  dueDate: z.string().optional(),
})), async (req, res) => {
  try {
    const task = await prisma.opsTask.create({ data: { ...req.body, dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null } })
    return successResponse(res, { task }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/tasks/:id', authenticate, validateBody(z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  dueDate: z.string().optional(),
}).partial()), async (req, res) => {
  try {
    const task = await prisma.opsTask.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { task })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/tasks/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.opsTask.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Task deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/sops', authenticate, async (req, res) => {
  try {
    const sops = await prisma.opsSop.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse(res, { sops })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/sops', authenticateAdmin, validateBody(z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
})), async (req, res) => {
  try {
    const sop = await prisma.opsSop.create({ data: req.body })
    return successResponse(res, { sop }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/sops/:id', authenticateAdmin, validateBody(z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
}).partial()), async (req, res) => {
  try {
    const sop = await prisma.opsSop.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { sop })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/sops/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.opsSop.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'SOP deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/incidents', authenticate, async (req, res) => {
  try {
    const incidents = await prisma.opsIncident.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse(res, { incidents })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/incidents', authenticate, validateBody(z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.string().optional(),
})), async (req, res) => {
  try {
    const incident = await prisma.opsIncident.create({ data: req.body })
    return successResponse(res, { incident }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/incidents/:id', authenticateAdmin, validateBody(z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  severity: z.string().optional(),
  status: z.string().optional(),
  resolvedAt: z.string().optional(),
}).partial()), async (req, res) => {
  try {
    const incident = await prisma.opsIncident.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { incident })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/incidents/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.opsIncident.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Incident deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/resources', authenticate, async (req, res) => {
  try {
    const resources = await prisma.opsResource.findMany({ orderBy: { renewalDate: 'asc' } })
    return successResponse(res, { resources })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/resources', authenticateAdmin, validateBody(z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  renewalDate: z.string().optional(),
  assignedTo: z.string().optional(),
})), async (req, res) => {
  try {
    const resource = await prisma.opsResource.create({ data: { ...req.body, renewalDate: req.body.renewalDate ? new Date(req.body.renewalDate) : null } })
    return successResponse(res, { resource }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/resources/:id', authenticateAdmin, validateBody(z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  renewalDate: z.string().optional(),
  assignedTo: z.string().optional(),
}).partial()), async (req, res) => {
  try {
    const resource = await prisma.opsResource.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { resource })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/resources/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.opsResource.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Resource deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
