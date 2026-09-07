import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'

const router = Router()

router.get('/command-center', authenticateAdmin, async (req, res) => {
  try {
    const period = req.query.period || '30d'
    const now = new Date()
    const ranges = {
      today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      '7d': new Date(now - 7 * 86400000),
      '30d': new Date(now - 30 * 86400000),
      '90d': new Date(now - 90 * 86400000),
    }
    const since = ranges[period] || ranges['30d']
    const prevSince = new Date(since.getTime() - (now.getTime() - since.getTime()))

    const [
      totalUsers, activeUsers, suspendedUsers, newUsersToday, newUsersWeek,
      totalProjects, activeProjects, completedProjects,
      allTasks, completedTasks, overdueTasks,
      totalRevenue, totalExpenses,
      pendingTransactions, unreadMessages, unreadNotifications,
      pendingLeaves, totalBdLeads,
      activeSessions, totalTransactions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
      prisma.user.count({ where: { createdAt: { gte: new Date(now - 7 * 86400000) } } }),
      prisma.project.count(),
      prisma.project.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.project.count({ where: { status: 'COMPLETED' } }),
      prisma.task.count(),
      prisma.task.count({ where: { status: 'COMPLETED' } }),
      prisma.task.count({ where: { status: { not: 'COMPLETED' }, dueDate: { lt: now } } }),
      prisma.transaction.aggregate({ where: { type: 'INCOME', status: 'COMPLETED' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'EXPENSE', status: 'COMPLETED' }, _sum: { amount: true } }),
      prisma.transaction.count({ where: { status: 'PENDING' } }),
      prisma.message.count({ where: { isRead: false } }),
      prisma.notification.count({ where: { isRead: false } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.bdLead.count(),
      prisma.session.count({ where: { isActive: true } }),
      prisma.transaction.count(),
    ])

    const netRevenue = (totalRevenue._sum.amount || 0) - (totalExpenses._sum.amount || 0)

    const prevUsers = await prisma.user.count({ where: { createdAt: { gte: prevSince } } })
    const currentUsers = await prisma.user.count({ where: { createdAt: { gte: since } } })
    const userGrowth = prevUsers > 0 ? Math.round(((currentUsers - prevUsers) / prevUsers) * 100) : 0

    const prevRevenue = await prisma.transaction.aggregate({
      where: { type: 'INCOME', status: 'COMPLETED', createdAt: { gte: prevSince } },
      _sum: { amount: true },
    })
    const revenueChange = (prevRevenue._sum.amount || 0) > 0
      ? Math.round((((totalRevenue._sum.amount || 0) - (prevRevenue._sum.amount || 0)) / (prevRevenue._sum.amount || 0)) * 100)
      : 0

    const taskCompletionRate = allTasks > 0 ? Math.round((completedTasks / allTasks) * 100) : 0
    const projectCompletionRate = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0

    const insights = []
    if (overdueTasks > 0) insights.push({ type: 'critical', text: `${overdueTasks} task${overdueTasks > 1 ? 's' : ''} are overdue.` })
    if (activeProjects > 0) insights.push({ type: 'info', text: `${activeProjects} active project${activeProjects > 1 ? 's' : ''} in progress.` })
    if (suspendedUsers > 0) insights.push({ type: 'warning', text: `${suspendedUsers} user${suspendedUsers > 1 ? 's' : ''} suspended.` })
    if (unreadMessages > 0) insights.push({ type: 'info', text: `${unreadMessages} unread message${unreadMessages > 1 ? 's' : ''}.` })
    if (pendingLeaves > 0) insights.push({ type: 'info', text: `${pendingLeaves} leave request${pendingLeaves > 1 ? 's' : ''} pending.` })
    if (revenueChange < 0) insights.push({ type: 'critical', text: `Revenue dropped ${Math.abs(revenueChange)}% this period.` })

    return successResponse(res, {
      kpis: {
        users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, newToday: newUsersToday, newWeek: newUsersWeek, change: userGrowth },
        projects: { total: totalProjects, active: activeProjects, completed: completedProjects },
        tasks: { total: allTasks, completed: completedTasks, overdue: overdueTasks, completionRate: taskCompletionRate },
        finance: { revenue: totalRevenue._sum.amount || 0, expenses: totalExpenses._sum.amount || 0, net: netRevenue, pendingTransactions, revenueChange },
        communication: { unreadMessages, unreadNotifications, pendingLeaves },
        operations: { totalBdLeads, activeSessions },
        overall: { totalTransactions, taskCompletionRate, projectCompletionRate },
      },
      insights,
    })
  } catch (error) {
    console.error('Command center error:', error)
    return errorResponse(res, 'Failed to load command center', 500)
  }
})

router.get('/operations', authenticateAdmin, async (req, res) => {
  try {
    const [recentUsers, recentTasks, recentProjects, recentTransactions, recentTickets] = await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, fullName: true, email: true, role: true, status: true, createdAt: true } }),
      prisma.task.findMany({ where: { updatedAt: { gte: new Date(Date.now() - 24 * 3600000) } }, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, title: true, status: true, assignedTo: true, updatedAt: true } }),
      prisma.project.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, title: true, status: true, department: true, createdAt: true } }),
      prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, type: true, amount: true, status: true, createdAt: true } }),
      prisma.supportTicket.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, subject: true, priority: true, status: true, createdAt: true } }),
    ])

    const activities = [
      ...recentUsers.map(u => ({ type: 'user_created', actor: u.fullName, action: 'registered', timestamp: u.createdAt })),
      ...recentTasks.map(t => ({ type: 'task_updated', actor: 'System', action: `${t.title} → ${t.status}`, timestamp: t.updatedAt })),
      ...recentProjects.map(p => ({ type: 'project_created', actor: 'Admin', action: `${p.title} created`, timestamp: p.createdAt })),
      ...recentTransactions.map(t => ({ type: 'transaction', actor: 'System', action: `${t.type}: $${t.amount}`, timestamp: t.createdAt })),
      ...recentTickets.map(t => ({ type: 'ticket_created', actor: 'User', action: t.subject, timestamp: t.createdAt })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50)

    return successResponse(res, { activities, recent: { users: recentUsers, tasks: recentTasks, projects: recentProjects } })
  } catch (error) {
    console.error('Operations error:', error)
    return errorResponse(res, 'Failed to load operations', 500)
  }
})

router.get('/user-intelligence', authenticateAdmin, async (req, res) => {
  try {
    const period = req.query.period || '30d'
    const now = new Date()
    const since = new Date(now - parseInt(period) * 86400000)

    const [total, active, pending, suspended, archived] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { status: 'ARCHIVED' } }),
    ])

    const byRole = await prisma.user.groupBy({ by: ['role'], _count: { _all: true } })
    const byDepartment = await prisma.user.groupBy({ by: ['department'], _count: { _all: true } })

    const recentRegistrations = await prisma.user.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fullName: true, email: true, role: true, department: true, status: true, createdAt: true },
    })

    const loginFrequencies = await prisma.activityLog.groupBy({
      by: ['userId'],
      _count: { _all: true },
      where: { createdAt: { gte: since } },
      orderBy: { _count: { _all: 'desc' } },
      take: 20,
    })

    return successResponse(res, {
      summary: { total, active, pending, suspended, archived, growth: Math.round(((total - (await prisma.user.count({ where: { createdAt: { gte: new Date(now - 30 * 86400000) } }))) / (await prisma.user.count({ where: { createdAt: { gte: new Date(now - 60 * 86400000) } }))) * 100)) },
      byRole: byRole.map(r => ({ role: r.role, count: r._count._all })),
      byDepartment: byDepartment.map(d => ({ department: d.department, count: d._count._all })),
      recentRegistrations,
      loginFrequencies,
    })
  } catch (error) {
    console.error('User intelligence error:', error)
    return errorResponse(res, 'Failed to load user intelligence', 500)
  }
})

router.get('/user/:userId/profile', authenticateAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: {
        employeeProfile: true,
        _count: { select: { taskSubmissions: true, projects: true, notifications: true, messages: true, auditLogs: true } },
        projects: { include: { project: true } },
        attendances: { orderBy: { date: 'desc' }, take: 30 },
        notifications: { orderBy: { createdAt: 'desc' }, take: 20 },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!user) return errorResponse(res, 'User not found', 404)

    const loginHistory = await prisma.securityEvent.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, eventType: true, description: true, ipAddress: true, severity: true, createdAt: true },
    })

    return successResponse(res, { user, loginHistory })
  } catch (error) {
    console.error('User profile error:', error)
    return errorResponse(res, 'Failed to load user profile', 500)
  }
})

router.get('/audit-logs', authenticateAdmin, async (req, res) => {
  try {
    const { action, page = 1, limit = 50 } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const where = {}
    if (action) where.action = { contains: action as string, mode: 'insensitive' as const }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ])
    return successResponse(res, { logs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch audit logs', 500)
  }
})

router.get('/system-health', authenticateAdmin, async (req, res) => {
  try {
    const dbCheck = await prisma.$queryRaw`SELECT 1`.then(() => 'OK').catch(() => 'ERROR')
    const uptime = process.uptime()
    const memUsage = process.memoryUsage()
    const totalMessages = await prisma.message.count()
    const totalNotifications = await prisma.notification.count()
    const totalAuditLogs = await prisma.auditLog.count()
    const totalTasks = await prisma.task.count()
    const totalProjects = await prisma.project.count()
    const totalUsers = await prisma.user.count()

    return successResponse(res, {
      api: { status: 'OPERATIONAL', uptime: Math.floor(uptime) },
      database: { status: dbCheck === 'OK' ? 'OPERATIONAL' : 'ERROR' },
      auth: { status: 'OPERATIONAL' },
      storage: { status: 'OPERATIONAL' },
      memory: { used: Math.round(memUsage.heapUsed / 1024 / 1024), total: Math.round(memUsage.heapTotal / 1024 / 1024) },
      stats: { totalUsers, totalProjects, totalTasks, totalMessages, totalNotifications, totalAuditLogs },
    })
  } catch (error) {
    console.error('System health error:', error)
    return errorResponse(res, 'Failed to load system health', 500)
  }
})

router.get('/search', authenticateAdmin, async (req, res) => {
  try {
    const q = req.query.q?.trim()
    if (!q || q.length < 2) return successResponse(res, { results: {} })

    const pattern = `%${q}%`
    const [users, projects, tasks, announcements, tickets, documents] = await Promise.all([
      prisma.user.findMany({
        where: { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
        take: 5, select: { id: true, fullName: true, email: true, role: true, status: true },
      }),
      prisma.project.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        take: 5, select: { id: true, title: true, status: true, department: true },
      }),
      prisma.task.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        take: 5, select: { id: true, title: true, status: true, priority: true },
      }),
      prisma.announcement.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        take: 5, select: { id: true, title: true, priority: true, createdAt: true },
      }),
      prisma.supportTicket.findMany({
        where: { subject: { contains: q, mode: 'insensitive' } },
        take: 5, select: { id: true, subject: true, status: true, priority: true },
      }),
      prisma.document.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        take: 5, select: { id: true, title: true, category: true, createdAt: true },
      }),
    ])

    return successResponse(res, { results: { users, projects, tasks, announcements, tickets, documents } })
  } catch (error) {
    console.error('Search error:', error)
    return errorResponse(res, 'Failed to search', 500)
  }
})

router.get('/workload', authenticateAdmin, async (req, res) => {
  try {
    const employees = await prisma.user.findMany({
      where: { status: 'ACTIVE', role: { not: 'ADMIN' } },
      select: {
        id: true, fullName: true, department: true, avatarUrl: true,
        _count: { select: { taskSubmissions: true } },
        projects: { select: { id: true, project: { select: { id: true, title: true, status: true } } } },
      },
    })

    const taskCounts = await prisma.task.groupBy({
      by: ['assignedTo'],
      _count: { _all: true },
      where: { assignedTo: { not: null } },
    })
    const taskMap = {}
    taskCounts.forEach(t => { taskMap[t.assignedTo] = t._count._all })

    const completedCounts = await prisma.task.groupBy({
      by: ['assignedTo'],
      _count: { _all: true },
      where: { assignedTo: { not: null }, status: 'COMPLETED' },
    })
    const completedMap = {}
    completedCounts.forEach(t => { completedMap[t.assignedTo] = t._count._all })

    const workload = employees.map(emp => {
      const assigned = taskMap[emp.id] || 0
      const completed = completedMap[emp.id] || 0
      const pending = assigned - completed
      const activeProjects = emp.projects.filter(p => p.project.status === 'IN_PROGRESS').length
      const level = assigned >= 10 ? 'CRITICAL' : assigned >= 6 ? 'HIGH' : assigned >= 3 ? 'NORMAL' : 'LOW'

      return {
        id: emp.id, fullName: emp.fullName, department: emp.department, avatarUrl: emp.avatarUrl,
        assignedTasks: assigned, completedTasks: completed, pendingTasks: pending,
        activeProjects, totalProjects: emp.projects.length,
        capacity: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
        level,
      }
    })

    return successResponse(res, { employees: workload })
  } catch (error) {
    console.error('Workload error:', error)
    return errorResponse(res, 'Failed to load workload', 500)
  }
})

export default router
