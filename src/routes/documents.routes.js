import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const createDocSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  category: z.string().optional(),
  projectId: z.string().optional(),
})

router.get('/', authenticate, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(parseInt(limit) || 20, 50)
    const where = {}
    if (category) where.category = category
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit) || 20,
      }),
      prisma.document.count({ where }),
    ])
    return successResponse(res, {
      documents,
      pagination: { page: parseInt(page) || 1, limit: parseInt(limit) || 20, total, pages: Math.ceil(total / (parseInt(limit) || 20)) },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!doc) return errorResponse(res, 'Document not found', 404)
    return successResponse(res, { document: doc })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/', authenticateAdmin, validateBody(createDocSchema), async (req, res) => {
  try {
    const doc = await prisma.document.create({
      data: { ...req.body, uploadedBy: req.admin?.id || req.user?.id || '' },
    })
    return successResponse(res, { document: doc }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.document.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Document deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
