import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'

const router = Router()

router.get('/events', authenticateAdmin, async (req, res) => {
  try {
    const { eventType, severity, page = 1, limit = 50 } = req.query
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(parseInt(limit) || 50, 100)
    const where = {}
    if (eventType) where.eventType = eventType
    if (severity) where.severity = severity
    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) || 50 }),
      prisma.securityEvent.count({ where }),
    ])
    return successResponse(res, {
      events,
      pagination: { page: parseInt(page) || 1, limit: parseInt(limit) || 50, total, pages: Math.ceil(total / (parseInt(limit) || 50)) },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/summary', authenticateAdmin, async (req, res) => {
  try {
    const now = new Date()
    const last24h = new Date(now - 24 * 60 * 60 * 1000)
    const last7d = new Date(now - 7 * 86400000)
    const [totalEvents, recent24h, recent7d, bySeverity, byType, failedLogins] = await Promise.all([
      prisma.securityEvent.count(),
      prisma.securityEvent.count({ where: { createdAt: { gte: last24h } } }),
      prisma.securityEvent.count({ where: { createdAt: { gte: last7d } } }),
      prisma.securityEvent.groupBy({ by: ['severity'], _count: { _all: true } }),
      prisma.securityEvent.groupBy({ by: ['eventType'], _count: { _all: true } }),
      prisma.securityEvent.count({ where: { eventType: 'FAILED_LOGIN', createdAt: { gte: last24h } } }),
    ])
    return successResponse(res, {
      totalEvents, recent24h, recent7d, failedLogins,
      bySeverity: bySeverity.map(s => ({ severity: s.severity, count: s._count._all })),
      byType: byType.map(t => ({ type: t.eventType, count: t._count._all })),
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
