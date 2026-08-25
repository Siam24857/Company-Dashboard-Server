import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { requireAnyRole, authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const messageSchema = z.object({
  receiverId: z.string(),
  content: z.string().min(1),
})

router.get('/conversations', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const conversations = await prisma.message.findMany({
      where: {
        OR: [{ senderId: req.user.id }, { receiverId: req.user.id }],
      },
      include: {
        sender: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        receiver: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const conversationMap = new Map()

    conversations.forEach((msg) => {
      const otherUser = msg.senderId === req.user.id ? msg.receiver : msg.sender
      const key = otherUser.id

      if (!conversationMap.has(key) || conversationMap.get(key).createdAt < msg.createdAt) {
        conversationMap.set(key, {
          user: otherUser,
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unreadCount: msg.receiverId === req.user.id && !msg.isRead ? 1 : 0,
        })
      }
    })

    const conversationList = Array.from(conversationMap.values()).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))

    return successResponse(res, { conversations: conversationList })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/:userId', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: req.user.id, receiverId: req.params.userId },
          { senderId: req.params.userId, receiverId: req.user.id },
        ],
      },
      include: {
        sender: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        receiver: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    await prisma.message.updateMany({
      where: { senderId: req.params.userId, receiverId: req.user.id, isRead: false },
      data: { isRead: true },
    })

    return successResponse(res, { messages })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), validateBody(messageSchema), async (req, res) => {
  try {
    const { receiverId, content } = req.body

    const message = await prisma.message.create({
      data: {
        senderId: req.user.id,
        receiverId,
        content,
      },
      include: {
        sender: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        receiver: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
    })

    return successResponse(res, { message }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/read', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    await prisma.message.update({
      where: { id: req.params.id },
      data: { isRead: true },
    })

    return successResponse(res, { message: 'Marked as read' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/broadcast', authenticateAdmin, async (req, res) => {
  try {
    const { content, userIds } = req.body

    const messages = await prisma.$transaction(
      userIds.map((userId) =>
        prisma.message.create({
          data: { senderId: req.user.id, receiverId: userId, content },
        })
      )
    )

    return successResponse(res, { messages }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
