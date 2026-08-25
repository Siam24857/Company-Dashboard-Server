import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { leaveApprovedEmail, leaveRejectedEmail } from '../services/email.service.js'
import { sendEmail } from '../services/email.service.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const leaveSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().min(1),
})

router.post('/', authenticate, validateBody(leaveSchema), async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: req.user.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
      },
    })

    return successResponse(res, { leaveRequest }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/me', authenticate, async (req, res) => {
  try {
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(res, { leaveRequests })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const leaveRequests = await prisma.leaveRequest.findMany({
      include: {
        user: { select: { fullName: true, email: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(res, { leaveRequests })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status, reason } = req.body

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    })

    if (!leaveRequest) return errorResponse(res, 'Leave request not found', 404)

    const updated = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status, reviewedBy: req.user.id },
    })

    const dates = `${leaveRequest.startDate.toISOString().split('T')[0]} - ${leaveRequest.endDate.toISOString().split('T')[0]}`

    if (status === 'APPROVED') {
      await sendEmail(leaveRequest.user.email, ...Object.values(leaveApprovedEmail(leaveRequest.user.fullName, dates)))
    } else if (status === 'REJECTED') {
      await sendEmail(leaveRequest.user.email, ...Object.values(leaveRejectedEmail(leaveRequest.user.fullName, dates, reason || 'No reason provided')))
    }

    return successResponse(res, { leaveRequest: updated })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
