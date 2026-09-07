import { Router } from 'express'
import { randomBytes } from 'crypto'
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

const broadcastSchema = z.object({
  content: z.string().min(1),
  userIds: z.array(z.string()).optional(),
})

const USER_SELECT = { id: true, fullName: true, avatarUrl: true }

// The authenticated user record — admin-table identities have no User row here.
const requireUserRecord = (req) => (req.user?.id ? req.user : null)

// Resolve a real User record the admin can send messages from. Admin-table
// logins have no User row, so resolve by email/role or provision an anchor.
const resolveSenderUser = async (req) => {
  if (req.user?.id) return req.user

  const email = req.admin?.email
  if (email) {
    const byEmail = await prisma.user.findUnique({ where: { email } })
    if (byEmail) return byEmail
  }

  const active = await prisma.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } })
  if (active) return active

  const anyAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (anyAdmin) return anyAdmin

  if (email) {
    const password = randomBytes(24).toString('hex')
    try {
      return await prisma.user.create({
        data: {
          fullName: email.split('@')[0] || 'Admin',
          email,
          password,
          role: 'ADMIN',
          department: 'BUSINESS_MANAGEMENT',
          status: 'ACTIVE',
        },
      })
    } catch (error) {
      if (error.code === 'P2002') {
        const again = await prisma.user.findUnique({ where: { email } })
        if (again) return again
      }
    }
  }

  return null
}

// Global broadcasts = admin-authored messages delivered to more than one receiver.
const buildBroadcastKeys = async (adminIds) => {
  const grouped = await prisma.message.groupBy({
    by: ['senderId', 'content'],
    where: { senderId: { in: adminIds } },
    _count: { _all: true },
  })
  const keys = new Set()
  grouped.forEach((g) => {
    if (g._count._all > 1) keys.add(`${g.senderId}:${g.content}`)
  })
  return keys
}

// Global communication feed — every role can read; only admin can POST (/broadcast).
router.get('/global', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const me = requireUserRecord(req)
    if (!me) return successResponse(res, { posts: [] })

    const adminIds = (await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })).map((u) => u.id)
    const keys = await buildBroadcastKeys(adminIds)

    const messages = await prisma.message.findMany({
      where: { senderId: { in: adminIds }, receiverId: me.id },
      include: { sender: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    const seen = new Set()
    const posts = []
    messages.forEach((m) => {
      const key = `${m.senderId}:${m.content}`
      if (!keys.has(key) || seen.has(key)) return
      seen.add(key)
      posts.push({
        id: m.id,
        sender: m.sender,
        content: m.content,
        createdAt: m.createdAt,
      })
    })

    return successResponse(res, { posts })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/conversations', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const me = requireUserRecord(req)
    if (!me) {
      return successResponse(res, { conversations: [], notice: 'No user account linked to your admin login.' })
    }

    const adminIds = (await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })).map((u) => u.id)
    const broadcastKeys = await buildBroadcastKeys(adminIds)

    const conversations = await prisma.message.findMany({
      where: {
        OR: [{ senderId: me.id }, { receiverId: me.id }],
      },
      include: {
        sender: { select: { ...USER_SELECT, email: true } },
        receiver: { select: { ...USER_SELECT, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const conversationMap = new Map()

    conversations.forEach((msg) => {
      if (broadcastKeys.has(`${msg.senderId}:${msg.content}`)) return
      const otherUser = msg.senderId === me.id ? msg.receiver : msg.sender
      if (!otherUser) return
      const key = otherUser.id

      if (!conversationMap.has(key) || conversationMap.get(key).lastMessageAt < msg.createdAt) {
        conversationMap.set(key, {
          user: otherUser,
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unreadCount: msg.receiverId === me.id && !msg.isRead ? 1 : 0,
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
    const me = requireUserRecord(req)
    if (!me) {
      return successResponse(res, { messages: [], notice: 'No user account linked to your admin login.' })
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: me.id, receiverId: req.params.userId },
          { senderId: req.params.userId, receiverId: me.id },
        ],
      },
      include: {
        sender: { select: { ...USER_SELECT, email: true } },
        receiver: { select: { ...USER_SELECT, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    await prisma.message.updateMany({
      where: { senderId: req.params.userId, receiverId: me.id, isRead: false },
      data: { isRead: true },
    })

    return successResponse(res, { messages })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), validateBody(messageSchema), async (req, res) => {
  try {
    const senderUser = await resolveSenderUser(req)
    if (!senderUser?.id) {
      return errorResponse(res, 'No user account available to send from.', 400)
    }

    const { receiverId, content } = req.body

    const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true, status: true } })
    if (!receiver || receiver.status !== 'ACTIVE') {
      return errorResponse(res, 'Receiver not found', 404)
    }

    const message = await prisma.message.create({
      data: { senderId: senderUser.id, receiverId, content },
      include: {
        sender: { select: { ...USER_SELECT, email: true } },
        receiver: { select: { ...USER_SELECT, email: true } },
      },
    })

    return successResponse(res, { message }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/read', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const me = requireUserRecord(req)
    if (!me) return successResponse(res, { message: 'No user account linked' })

    await prisma.message.updateMany({
      where: { id: req.params.id, OR: [{ senderId: me.id }, { receiverId: me.id }] },
      data: { isRead: true },
    })

    return successResponse(res, { message: 'Marked as read' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

// Global broadcast — ADMIN ONLY. Delivers one message into every active user's inbox.
router.post('/broadcast', authenticateAdmin, validateBody(broadcastSchema), async (req, res) => {
  try {
    const { content, userIds } = req.body

    const targets = userIds && userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds }, status: 'ACTIVE' }, select: { id: true } })
      : await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })

    if (targets.length === 0) {
      return errorResponse(res, 'No active users to broadcast to', 400)
    }

    const senderUser = await resolveSenderUser(req)
    if (!senderUser?.id) {
      return errorResponse(res, 'No user account available to broadcast from.', 400)
    }

    let sentTo = 0
    const BATCH = 90
    for (let i = 0; i < targets.length; i += BATCH) {
      const chunk = targets.slice(i, i + BATCH)
      await prisma.$transaction(
        chunk.map((t) =>
          prisma.message.create({ data: { senderId: senderUser.id, receiverId: t.id, content } })
        )
      )
      sentTo += chunk.length
    }

    return successResponse(res, { sentTo }, 201)
  } catch (error) {
    console.error('Broadcast error:', error)
    return errorResponse(res, 'Failed to send broadcast. Please try again.', 500)
  }
})

export default router