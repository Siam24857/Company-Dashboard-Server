import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().min(10),
  category: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
})

const messageSchema = z.object({ content: z.string().min(1) })

router.get('/', authenticate, async (req, res) => {
  try {
    const { status, priority, search, page = 1, limit = 20 } = req.query
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(parseInt(limit) || 20, 50)
    const userId = req.user?.id
    const isAdmin = req.user?.role === 'ADMIN' || req.admin
    const where = {}
    if (!isAdmin) where.userId = userId
    if (status) where.status = status
    if (priority) where.priority = priority
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit) || 20,
        include: { _count: { select: { messages: true } } },
      }),
      prisma.supportTicket.count({ where }),
    ])
    return successResponse(res, {
      tickets,
      pagination: { page: parseInt(page) || 1, limit: parseInt(limit) || 20, total, pages: Math.ceil(total / (parseInt(limit) || 20)) },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const [total, open, inProgress, waiting, resolved, closed] = await Promise.all([
      prisma.supportTicket.count(),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.supportTicket.count({ where: { status: 'WAITING' } }),
      prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
      prisma.supportTicket.count({ where: { status: 'CLOSED' } }),
    ])
    return successResponse(res, { total, open, inProgress, waiting, resolved, closed })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/:id', authenticate, async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!ticket) return errorResponse(res, 'Ticket not found', 404)
    const userId = req.user?.id
    const isAdmin = req.user?.role === 'ADMIN' || req.admin
    if (!isAdmin && ticket.userId !== userId) return errorResponse(res, 'Access denied', 403)
    return successResponse(res, { ticket })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/', authenticate, validateBody(createTicketSchema), async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.create({
      data: { ...req.body, userId: req.user?.id || '' },
    })
    return successResponse(res, { ticket }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/:id/messages', authenticate, validateBody(messageSchema), async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } })
    if (!ticket) return errorResponse(res, 'Ticket not found', 404)
    const isAdmin = req.user?.role === 'ADMIN' || req.admin
    if (!isAdmin && ticket.userId !== req.user?.id) return errorResponse(res, 'Access denied', 403)
    const message = await prisma.ticketMessage.create({
      data: { ticketId: req.params.id, userId: req.user?.id || '', content: req.body.content, isStaff: !!isAdmin },
    })
    return successResponse(res, { message }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/assign', authenticateAdmin, async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { assignedTo: req.body.assignedTo, status: 'IN_PROGRESS' },
    })
    return successResponse(res, { ticket })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    })
    return successResponse(res, { ticket })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
