import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { sendEmail } from '../services/email.service.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const sendEmailSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  subject: z.string().min(1),
  body: z.string().min(1),
})

router.post('/send', authenticateAdmin, validateBody(sendEmailSchema), async (req, res) => {
  try {
    const { to, subject, body } = req.body
    const recipients = Array.isArray(to) ? to : [to]

    const results = []
    for (const recipient of recipients) {
      const result = await sendEmail(recipient, subject, body)
      results.push(result)

      await prisma.emailLog.create({
        data: {
          to: recipient,
          subject,
          body,
          status: result.success ? 'SENT' : 'FAILED',
        },
      })
    }

    return successResponse(res, { results })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/logs', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        orderBy: { sentAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.emailLog.count(),
    ])

    return successResponse(res, {
      logs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
