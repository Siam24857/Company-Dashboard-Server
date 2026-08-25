import { prisma } from '../utils/db.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { createBroadcast } from '../services/notification.service.js'

const createAnnouncementSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(1),
  priority: z.enum(['NORMAL', 'IMPORTANT', 'URGENT']).optional(),
  targetRole: z.enum(['ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER']).optional(),
  publishedAt: z.string().optional(),
  expiresAt: z.string().optional(),
})

const updateAnnouncementSchema = createAnnouncementSchema.partial()

export const getAnnouncements = async (req, res) => {
  try {
    const userRole = req.user?.role
    const userId = req.user?.id

    const where = {
      AND: [
        {
          OR: [
            { targetRole: null },
            { targetRole: userRole },
          ],
        },
        { publishedAt: { lte: new Date() } },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
      ],
    }

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: { priority: 'desc' },
      include: {
        reads: {
          where: { userId },
          select: { id: true },
        },
      },
    })

    const result = announcements.map((a) => ({
      ...a,
      isRead: a.reads.length > 0,
      reads: undefined,
    }))

    return successResponse(res, { announcements: result })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const getAnnouncement = async (req, res) => {
  try {
    const { id } = req.params
    const userRole = req.user?.role
    const userId = req.user?.id

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      include: {
        reads: {
          where: { userId },
          select: { id: true, readAt: true },
        },
      },
    })

    if (!announcement) {
      return errorResponse(res, 'Announcement not found', 404)
    }

    if (announcement.targetRole && announcement.targetRole !== userRole && userRole !== 'ADMIN') {
      return errorResponse(res, 'Access denied', 403)
    }

    return successResponse(res, { announcement })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const createAnnouncement = async (req, res) => {
  try {
    const { title, content, priority, targetRole, publishedAt, expiresAt } = req.body
    const createdBy = req.admin?.id || req.user?.id

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        priority: priority || 'NORMAL',
        targetRole: targetRole || null,
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: createdBy || '',
      },
    })

    const activeUsers = await prisma.user.findMany({
      where: targetRole
        ? { role: targetRole, status: 'ACTIVE' }
        : { status: 'ACTIVE' },
      select: { id: true },
    })

    if (activeUsers.length > 0) {
      const priorityLabel = priority === 'URGENT' ? 'URGENT' : priority === 'IMPORTANT' ? 'IMPORTANT' : ''
      const message = `${priorityLabel ? priorityLabel + ' announcement: ' : ''}${title}`
      await createBroadcast(activeUsers.map((u) => u.id), 'New announcement', message, 'ANNOUNCEMENT')
    }

    return successResponse(res, { announcement }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params
    const { title, content, priority, targetRole, publishedAt, expiresAt } = req.body

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        title,
        content,
        priority,
        targetRole,
        publishedAt: publishedAt ? new Date(publishedAt) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
    })

    return successResponse(res, { announcement })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params

    await prisma.announcement.delete({
      where: { id },
    })

    return successResponse(res, { message: 'Announcement deleted successfully' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user?.id

    if (!userId) {
      return errorResponse(res, 'Authentication required', 401)
    }

    const announcement = await prisma.announcement.findUnique({
      where: { id },
    })

    if (!announcement) {
      return errorResponse(res, 'Announcement not found', 404)
    }

    await prisma.announcementRead.upsert({
      where: {
        announcementId_userId: {
          announcementId: id,
          userId,
        },
      },
      update: { readAt: new Date() },
      create: {
        announcementId: id,
        userId,
        readAt: new Date(),
      },
    })

    return successResponse(res, { message: 'Marked as read' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const getReadStatistics = async (req, res) => {
  try {
    const { id } = req.params

    const announcement = await prisma.announcement.findUnique({
      where: { id },
    })

    if (!announcement) {
      return errorResponse(res, 'Announcement not found', 404)
    }

    const totalReads = await prisma.announcementRead.count({
      where: { announcementId: id },
    })

    const reads = await prisma.announcementRead.findMany({
      where: { announcementId: id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            department: true,
          },
        },
      },
      orderBy: { readAt: 'desc' },
    })

    return successResponse(res, { totalReads, reads })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}
