import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  eventType: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  allDay: z.boolean().optional(),
  projectId: z.string().optional(),
})

router.get('/', authenticate, async (req, res) => {
  try {
    const { month, year, eventType } = req.query
    const where = {}
    if (eventType) where.eventType = eventType
    if (month && year) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1)
      const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)
      where.startDate = { gte: start, lte: end }
    }
    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: { startDate: 'asc' },
      take: 100,
    })
    return successResponse(res, { events })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/', authenticateAdmin, validateBody(createEventSchema), async (req, res) => {
  try {
    const event = await prisma.calendarEvent.create({
      data: {
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        createdBy: req.admin?.id || req.user?.id || '',
      },
    })
    return successResponse(res, { event }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id', authenticateAdmin, async (req, res) => {
  try {
    const data = { ...req.body }
    if (data.startDate) data.startDate = new Date(data.startDate)
    if (data.endDate) data.endDate = new Date(data.endDate)
    const event = await prisma.calendarEvent.update({ where: { id: req.params.id }, data })
    return successResponse(res, { event })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.calendarEvent.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Event deleted' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
