import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireAdmin } from '../middleware/role.middleware.js'
import { getAnnouncements, getAnnouncement, createAnnouncement, updateAnnouncement, deleteAnnouncement, markAsRead, getReadStatistics } from '../controllers/announcement.controller.js'
import { validateBody } from '../middleware/validate.middleware.js'
import { z } from 'zod'
import { createAuditLog } from '../services/audit.service.js'

const router = Router()

const createAnnouncementSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(1),
  priority: z.enum(['NORMAL', 'IMPORTANT', 'URGENT']).nullable().optional(),
  targetRole: z.enum(['ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER']).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
})

const updateAnnouncementSchema = createAnnouncementSchema.partial()

router.get('/', authenticate, getAnnouncements)
router.get('/:id', authenticate, getAnnouncement)
router.patch('/:id/read', authenticate, markAsRead)

router.post('/', requireAdmin, validateBody(createAnnouncementSchema), createAnnouncement)
router.patch('/:id', requireAdmin, validateBody(updateAnnouncementSchema), updateAnnouncement)
router.delete('/:id', requireAdmin, deleteAnnouncement)
router.get('/:id/read-statistics', requireAdmin, getReadStatistics)

export default router
