import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'
import { createAuditLog } from '../services/audit.service.js'

const router = Router()

const resolveUserId = async (req) => {
  if (req.user?.id) return req.user.id
  if (req.admin?.id) {
    const adminUser = await prisma.user.findUnique({
      where: { email: req.admin.email },
      select: { id: true },
    })
    return adminUser?.id || null
  }
  return null
}

router.get('/transactions', authenticate, async (req, res) => {
  try {
    const userId = await resolveUserId(req)
    if (!userId) return errorResponse(res, 'No user account linked', 400)

    const { type, status, category, search, startDate, endDate, page = 1, limit = 10, sort = 'desc' } = req.query
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(parseInt(limit) || 10, 50)

    const where = { userId }
    if (type) where.type = type
    if (status) where.status = status
    if (category) where.category = category
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`)
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
        skip,
        take: parseInt(limit) || 10,
      }),
      prisma.transaction.count({ where }),
    ])

    return successResponse(res, {
      transactions,
      pagination: {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        total,
        pages: Math.ceil(total / (parseInt(limit) || 10)),
      },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/transactions/:id', authenticate, async (req, res) => {
  try {
    const userId = await resolveUserId(req)
    if (!userId) return errorResponse(res, 'No user account linked', 400)

    const transaction = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId },
    })

    if (!transaction) return errorResponse(res, 'Transaction not found', 404)

    return successResponse(res, { transaction })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/overview', authenticate, async (req, res) => {
  try {
    const userId = await resolveUserId(req)
    if (!userId) return errorResponse(res, 'No user account linked', 400)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true, totalEarnings: true, totalSpent: true },
    })

    if (!user) return errorResponse(res, 'User not found', 404)

    const [income, expense, pending, completed, recent] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId, type: 'INCOME', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { userId, type: 'EXPENSE', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { userId, status: 'PENDING' },
        _sum: { amount: true },
      }),
      prisma.transaction.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ])

    return successResponse(res, {
      balance: user.balance,
      totalEarnings: user.totalEarnings,
      totalSpent: user.totalSpent,
      income: Math.round((income._sum.amount || 0) * 100) / 100,
      expenses: Math.round((expense._sum.amount || 0) * 100) / 100,
      pending: Math.round((pending._sum.amount || 0) * 100) / 100,
      completedCount: completed,
      recent,
      currency: 'USD',
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

const transactionSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.string().min(2).max(60),
  description: z.string().min(1).max(300),
  amount: z.number().positive(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).default('COMPLETED'),
  userId: z.string().optional(),
})

router.post('/transactions', authenticateAdmin, validateBody(transactionSchema), async (req, res) => {
  try {
    const { type, category, description, amount, status, userId } = req.body

    let targetUserId = userId

    if (!targetUserId && req.admin?.id) {
      const adminUser = await prisma.user.findUnique({
        where: { email: req.admin.email },
        select: { id: true },
      })
      targetUserId = adminUser?.id
    }

    if (!targetUserId) return errorResponse(res, 'A userId is required', 400)

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } })
    if (!targetUser) return errorResponse(res, 'User not found', 404)

    const reference = `TXN-${Date.now().toString(36).toUpperCase()}`

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: { userId: targetUserId, type, category, description, amount, status, reference },
      })

      if (status === 'COMPLETED') {
        const delta = type === 'INCOME' ? amount : -amount
        await tx.user.update({
          where: { id: targetUserId },
          data: {
            balance: { increment: delta },
            totalEarnings: type === 'INCOME' ? { increment: amount } : undefined,
            totalSpent: type === 'EXPENSE' ? { increment: amount } : undefined,
          },
        })

        await tx.notification.create({
          data: {
            userId: targetUserId,
            title: type === 'INCOME' ? 'Income received' : 'Expense recorded',
            message: `${type === 'INCOME' ? 'Credit' : 'Debit'} of ${amount} (${category}) ${type === 'INCOME' ? 'added to' : 'applied to'} your balance.`,
            type: 'TRANSACTION',
          },
        })
      }

      return created
    })

    await createAuditLog('TRANSACTION_CREATED', transaction.id, `${type} transaction created for ${targetUserId}`, req.admin?.id, req.admin?.email, req.ip)

    return successResponse(res, { transaction }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router