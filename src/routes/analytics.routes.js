import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'

const router = Router()

const dateRange = (period) => {
  const now = new Date()
  const ranges = {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    '7d': new Date(now - 7 * 86400000),
    '30d': new Date(now - 30 * 86400000),
    '90d': new Date(now - 90 * 86400000),
    '6m': new Date(now - 180 * 86400000),
    '1y': new Date(now - 365 * 86400000),
    all: new Date(0),
  }
  return ranges[period] || ranges['30d']
}

const prevRange = (period) => {
  const now = new Date()
  const d = dateRange(period)
  const diff = now - d
  return new Date(d - diff)
}

const pctChange = (current, previous) => {
  if (!previous || previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

// ── COMMAND CENTER ───────────────────────────────────────────────
router.get('/command-center', authenticateAdmin, async (req, res) => {
  try {
    const since = dateRange(req.query.period || '30d')
    const prevSince = prevRange(req.query.period || '30d')

    const [
      totalUsers, activeUsers, pendingUsers, suspendedUsers,
      totalProjects, activeProjects, completedProjects, planningProjects,
      onHoldProjects, cancelledProjects,
      allTasks, pendingTasks, completedTasks, inProgressTasks, inReviewTasks,
      totalAnnouncements, publishedAnnouncements,
      pendingLeaves,
      totalTransactions, pendingTransactions,
      unreadMessages,
      unreadNotifications,
      recentUsers, recentProjects,
      todayAttendance,
      totalBdLeads, totalProposals, totalSalesPipeline,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.project.count(),
      prisma.project.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.project.count({ where: { status: 'COMPLETED' } }),
      prisma.project.count({ where: { status: 'PLANNING' } }),
      prisma.project.count({ where: { status: 'ON_HOLD' } }),
      prisma.project.count({ where: { status: 'CANCELLED' } }),
      prisma.task.count(),
      prisma.task.count({ where: { status: 'TODO' } }),
      prisma.task.count({ where: { status: 'COMPLETED' } }),
      prisma.task.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.task.count({ where: { status: 'IN_REVIEW' } }),
      prisma.announcement.count(),
      prisma.announcement.count({ where: { publishedAt: { not: null } } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: 'PENDING' } }),
      prisma.message.count({ where: { isRead: false } }),
      prisma.notification.count({ where: { isRead: false } }),
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, fullName: true, email: true, role: true, status: true, avatarUrl: true, createdAt: true } }),
      prisma.project.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, status: true, priority: true, department: true, createdAt: true, dueDate: true } }),
      prisma.attendance.findMany({ where: { date: new Date(new Date().setHours(0, 0, 0, 0)) }, select: { status: true } }),
      prisma.bdLead.count(),
      prisma.bdProposal.count(),
      prisma.salesPipeline.count(),
    ])

    const revenueAgg = await prisma.transaction.aggregate({
      where: { type: 'INCOME', status: 'COMPLETED' },
      _sum: { amount: true },
    })
    const expenseAgg = await prisma.transaction.aggregate({
      where: { type: 'EXPENSE', status: 'COMPLETED' },
      _sum: { amount: true },
    })

    const totalRevenue = revenueAgg._sum.amount || 0
    const totalExpenses = expenseAgg._sum.amount || 0
    const netRevenue = totalRevenue - totalExpenses

    const prevRevenueAgg = await prisma.transaction.aggregate({
      where: { type: 'INCOME', status: 'COMPLETED', createdAt: { gte: prevSince } },
      _sum: { amount: true },
    })
    const prevExpenseAgg = await prisma.transaction.aggregate({
      where: { type: 'EXPENSE', status: 'COMPLETED', createdAt: { gte: prevSince } },
      _sum: { amount: true },
    })
    const prevUsers = await prisma.user.count({ where: { createdAt: { gte: prevSince } } })
    const currentUsers = await prisma.user.count({ where: { createdAt: { gte: since } } })

    const prevRev = prevRevenueAgg._sum.amount || 0
    const prevExp = prevExpenseAgg._sum.amount || 0
    const currentRev = await prisma.transaction.aggregate({
      where: { type: 'INCOME', status: 'COMPLETED', createdAt: { gte: since } },
      _sum: { amount: true },
    })
    const currentExp = await prisma.transaction.aggregate({
      where: { type: 'EXPENSE', status: 'COMPLETED', createdAt: { gte: since } },
      _sum: { amount: true },
    })

    const attendanceCount = todayAttendance.length
    const attendancePresent = todayAttendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length
    const attendanceRate = attendanceCount > 0 ? Math.round((attendancePresent / attendanceCount) * 100) : 0

    const taskCompletionRate = allTasks > 0 ? Math.round((completedTasks / allTasks) * 100) : 0
    const projectCompletionRate = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0

    return successResponse(res, {
      kpis: {
        users: { total: totalUsers, active: activeUsers, pending: pendingUsers, suspended: suspendedUsers, change: pctChange(currentUsers, prevUsers) },
        projects: { total: totalProjects, active: activeProjects, completed: completedProjects, planning: planningProjects, onHold: onHoldProjects, cancelled: cancelledProjects, completionRate: projectCompletionRate },
        tasks: { total: allTasks, pending: pendingTasks, completed: completedTasks, inProgress: inProgressTasks, inReview: inReviewTasks, completionRate: taskCompletionRate },
        finance: { totalRevenue, totalExpenses, netRevenue, pendingTransactions, revenueChange: pctChange((currentRev._sum.amount || 0), prevRev), expenseChange: pctChange((currentExp._sum.amount || 0), prevExp) },
        communication: { unreadMessages, unreadNotifications, totalAnnouncements, publishedAnnouncements },
        operations: { pendingLeaves, attendanceRate, totalBdLeads, totalProposals, totalSalesPipeline },
      },
      recentUsers,
      recentProjects,
    })
  } catch (error) {
    console.error('Command center error:', error)
    return errorResponse(res, 'Failed to load command center data', 500)
  }
})

// ── REVENUE ANALYTICS ───────────────────────────────────────────
router.get('/revenue', authenticateAdmin, async (req, res) => {
  try {
    const period = req.query.period || '1y'
    const since = dateRange(period)

    const transactions = await prisma.transaction.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { type: true, amount: true, status: true, createdAt: true, category: true },
    })

    const monthly = {}
    transactions.forEach(t => {
      const key = t.createdAt.toISOString().slice(0, 7)
      if (!monthly[key]) monthly[key] = { revenue: 0, expenses: 0 }
      if (t.status === 'COMPLETED') {
        if (t.type === 'INCOME') monthly[key].revenue += t.amount
        else monthly[key].expenses += t.amount
      }
    })

    const byCategory = {}
    transactions.filter(t => t.status === 'COMPLETED' && t.type === 'INCOME').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount
    })

    const completedIncome = transactions.filter(t => t.type === 'INCOME' && t.status === 'COMPLETED')
    const totalRevenue = completedIncome.reduce((s, t) => s + t.amount, 0)
    const months = Object.keys(monthly).length || 1
    const avgMonthly = totalRevenue / months
    const amounts = completedIncome.map(t => t.amount)
    const highestMonth = Math.max(...Object.values(monthly).map(m => m.revenue), 0)
    const lowestMonth = Math.min(...Object.values(monthly).filter(m => m.revenue > 0).map(m => m.revenue), 0)

    const firstHalf = totalRevenue / 2
    let growthRate = 0
    if (firstHalf > 0) growthRate = Math.round(((totalRevenue - firstHalf) / firstHalf) * 100)

    return successResponse(res, {
      monthly: Object.entries(monthly).map(([month, data]) => ({ month, ...data })),
      byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
      summary: { totalRevenue, avgMonthly: Math.round(avgMonthly * 100) / 100, highestMonth, lowestMonth, growthRate },
    })
  } catch (error) {
    console.error('Revenue analytics error:', error)
    return errorResponse(res, 'Failed to load revenue analytics', 500)
  }
})

// ── USER ANALYTICS ──────────────────────────────────────────────
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const period = req.query.period || '30d'
    const since = dateRange(period)

    const [total, active, pending, suspended] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
    ])

    const byRole = await prisma.user.groupBy({ by: ['role'], _count: { _all: true } })
    const byDepartment = await prisma.user.groupBy({ by: ['department'], _count: { _all: true } })

    const recentRegistrations = await prisma.user.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fullName: true, email: true, role: true, department: true, status: true, createdAt: true },
    })

    const prevSince = prevRange(period)
    const prevCount = await prisma.user.count({ where: { createdAt: { gte: prevSince } } })
    const currentCount = await prisma.user.count({ where: { createdAt: { gte: since } } })

    return successResponse(res, {
      summary: { total, active, pending, suspended, growth: pctChange(currentCount, prevCount) },
      byRole: byRole.map(r => ({ role: r.role, count: r._count._all })),
      byDepartment: byDepartment.map(d => ({ department: d.department, count: d._count._all })),
      recentRegistrations,
    })
  } catch (error) {
    console.error('User analytics error:', error)
    return errorResponse(res, 'Failed to load user analytics', 500)
  }
})

// ── PROJECT ANALYTICS ───────────────────────────────────────────
router.get('/projects', authenticateAdmin, async (req, res) => {
  try {
    const [total, byStatus, byDepartment, overdueTasks] = await Promise.all([
      prisma.project.count(),
      prisma.project.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.project.groupBy({ by: ['department'], _count: { _all: true } }),
      prisma.task.count({ where: { status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { lt: new Date() } } }),
    ])

    const tasksByStatus = await prisma.task.groupBy({ by: ['status'], _count: { _all: true } })
    const totalTasks = tasksByStatus.reduce((s, t) => s + t._count._all, 0)
    const completedTasks = tasksByStatus.find(t => t.status === 'COMPLETED')?._count._all || 0
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, status: true, priority: true, department: true,
        startDate: true, dueDate: true, completedAt: true,
        _count: { select: { tasks: true, members: true } },
      },
    })

    return successResponse(res, {
      summary: { total, overdueTasks, completionRate },
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count._all })),
      byDepartment: byDepartment.map(d => ({ department: d.department, count: d._count._all })),
      tasksByStatus: tasksByStatus.map(t => ({ status: t.status, count: t._count._all })),
      projects,
    })
  } catch (error) {
    console.error('Project analytics error:', error)
    return errorResponse(res, 'Failed to load project analytics', 500)
  }
})

// ── TASK ANALYTICS ──────────────────────────────────────────────
router.get('/tasks', authenticateAdmin, async (req, res) => {
  try {
    const [total, byStatus, byPriority, overdueTasks] = await Promise.all([
      prisma.task.count(),
      prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.task.groupBy({ by: ['priority'], _count: { _all: true } }),
      prisma.task.count({ where: { dueDate: { lt: new Date() }, status: { not: 'COMPLETED' } } }),
    ])

    const completed = byStatus.find(s => s.status === 'COMPLETED')?._count._all || 0
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    return successResponse(res, {
      summary: { total, overdueTasks, completionRate },
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count._all })),
      byPriority: byPriority.map(p => ({ priority: p.priority, count: p._count._all })),
    })
  } catch (error) {
    console.error('Task analytics error:', error)
    return errorResponse(res, 'Failed to load task analytics', 500)
  }
})

// ── TEAM/EMPLOYEE ANALYTICS ─────────────────────────────────────
router.get('/employees', authenticateAdmin, async (req, res) => {
  try {
    const [total, byStatus, byDepartment, byRole] = await Promise.all([
      prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
      prisma.user.groupBy({ by: ['status'], _count: { _all: true }, where: { role: { not: 'ADMIN' } } }),
      prisma.user.groupBy({ by: ['department'], _count: { _all: true }, where: { role: { not: 'ADMIN' } } }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true }, where: { role: { not: 'ADMIN' } } }),
    ])

    const active = byStatus.find(s => s.status === 'ACTIVE')?._count._all || 0
    const inactive = total - active

    const taskCounts = await prisma.user.findMany({
      where: { role: { not: 'ADMIN' }, status: 'ACTIVE' },
      select: {
        id: true, fullName: true, email: true, role: true, department: true, avatarUrl: true,
        _count: { select: { taskSubmissions: true } },
      },
      orderBy: { fullName: 'asc' },
    })

    return successResponse(res, {
      summary: { total, active, inactive },
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count._all })),
      byDepartment: byDepartment.map(d => ({ department: d.department, count: d._count._all })),
      byRole: byRole.map(r => ({ role: r.role, count: r._count._all })),
      employees: taskCounts,
    })
  } catch (error) {
    console.error('Employee analytics error:', error)
    return errorResponse(res, 'Failed to load employee analytics', 500)
  }
})

// ── WORKLOAD ────────────────────────────────────────────────────
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

    const tasksPerEmployee = await prisma.task.groupBy({
      by: ['assignedTo'],
      _count: { _all: true },
      where: { assignedTo: { not: null } },
    })
    const taskMap = {}
    tasksPerEmployee.forEach(t => { taskMap[t.assignedTo] = t._count._all })

    const completedPerEmployee = await prisma.task.groupBy({
      by: ['assignedTo'],
      _count: { _all: true },
      where: { assignedTo: { not: null }, status: 'COMPLETED' },
    })
    const completedMap = {}
    completedPerEmployee.forEach(t => { completedMap[t.assignedTo] = t._count._all })

    const workload = employees.map(emp => {
      const assignedTasks = taskMap[emp.id] || 0
      const completedTasks = completedMap[emp.id] || 0
      const pendingTasks = assignedTasks - completedTasks
      const activeProjects = emp.projects.filter(p => p.project.status === 'IN_PROGRESS').length
      const totalProjects = emp.projects.length
      const workloadPct = assignedTasks > 0 ? Math.round((pendingTasks / Math.max(assignedTasks, 1)) * 100) : 0
      const level = workloadPct >= 80 ? 'CRITICAL' : workloadPct >= 60 ? 'HIGH' : workloadPct >= 30 ? 'NORMAL' : 'LOW'

      return {
        id: emp.id, fullName: emp.fullName, department: emp.department, avatarUrl: emp.avatarUrl,
        assignedTasks, completedTasks, pendingTasks, activeProjects, totalProjects,
        workloadPct, level,
      }
    })

    const departments = {}
    workload.forEach(w => {
      if (!departments[w.department]) departments[w.department] = { count: 0, totalPct: 0 }
      departments[w.department].count++
      departments[w.department].totalPct += w.workloadPct
    })
    const deptWorkload = Object.entries(departments).map(([dept, data]) => ({
      department: dept,
      memberCount: data.count,
      avgWorkload: Math.round(data.totalPct / data.count),
      level: data.totalPct / data.count >= 80 ? 'CRITICAL' : data.totalPct / data.count >= 60 ? 'HIGH' : data.totalPct / data.count >= 30 ? 'NORMAL' : 'LOW',
    }))

    return successResponse(res, { employees: workload, departments: deptWorkload })
  } catch (error) {
    console.error('Workload error:', error)
    return errorResponse(res, 'Failed to load workload data', 500)
  }
})

// ── SYSTEM HEALTH ───────────────────────────────────────────────
router.get('/system-health', authenticateAdmin, async (req, res) => {
  try {
    const dbCheck = await prisma.$queryRaw`SELECT 1`.then(() => 'OK').catch(() => 'ERROR')
    const uptime = process.uptime()
    const memUsage = process.memoryUsage()
    const totalMessages = await prisma.message.count()
    const totalNotifications = await prisma.notification.count()
    const recentErrors = await prisma.auditLog.count({ where: { action: { contains: 'ERROR' } } })

    return successResponse(res, {
      api: { status: 'OPERATIONAL', uptime: Math.floor(uptime) },
      database: { status: dbCheck === 'OK' ? 'OPERATIONAL' : 'ERROR' },
      auth: { status: 'OPERATIONAL' },
      storage: { status: 'OPERATIONAL' },
      memory: { used: Math.round(memUsage.heapUsed / 1024 / 1024), total: Math.round(memUsage.heapTotal / 1024 / 1024) },
      stats: { totalMessages, totalNotifications, recentErrors },
    })
  } catch (error) {
    console.error('System health error:', error)
    return errorResponse(res, 'Failed to load system health', 500)
  }
})

// ── GLOBAL SEARCH ───────────────────────────────────────────────
router.get('/search', authenticateAdmin, async (req, res) => {
  try {
    const q = req.query.q?.trim()
    if (!q || q.length < 2) return successResponse(res, { results: {} })

    const pattern = `%${q}%`

    const [users, projects, tasks, announcements] = await Promise.all([
      prisma.user.findMany({
        where: { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
        take: 5, select: { id: true, fullName: true, email: true, role: true, status: true, avatarUrl: true },
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
    ])

    return successResponse(res, { results: { users, projects, tasks, announcements } })
  } catch (error) {
    console.error('Search error:', error)
    return errorResponse(res, 'Failed to search', 500)
  }
})

// ── INSIGHTS ────────────────────────────────────────────────────
router.get('/insights', authenticateAdmin, async (req, res) => {
  try {
    const insights = []
    const now = new Date()

    const approachingDeadlines = await prisma.project.count({
      where: { status: { in: ['IN_PROGRESS', 'PLANNING'] }, dueDate: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) } },
    })
    if (approachingDeadlines > 0) {
      insights.push({ type: 'warning', text: `${approachingDeadlines} project${approachingDeadlines > 1 ? 's' : ''} approaching their deadlines within 7 days.` })
    }

    const overdueTasks = await prisma.task.count({
      where: { dueDate: { lt: now }, status: { not: 'COMPLETED' } },
    })
    if (overdueTasks > 0) {
      insights.push({ type: 'critical', text: `${overdueTasks} task${overdueTasks > 1 ? 's' : ''} are overdue.` })
    }

    const pendingUsers = await prisma.user.count({ where: { status: 'PENDING' } })
    if (pendingUsers > 0) {
      insights.push({ type: 'info', text: `${pendingUsers} user${pendingUsers > 1 ? 's' : ''} awaiting approval.` })
    }

    const pendingLeaves = await prisma.leaveRequest.count({ where: { status: 'PENDING' } })
    if (pendingLeaves > 0) {
      insights.push({ type: 'info', text: `${pendingLeaves} leave request${pendingLeaves > 1 ? 's' : ''} pending review.` })
    }

    const highWorkloadUsers = await prisma.task.groupBy({
      by: ['assignedTo'],
      _count: { _all: true },
      where: { assignedTo: { not: null }, status: { in: ['TODO', 'IN_PROGRESS'] } },
    })
    const highWorkloadCount = highWorkloadUsers.filter(g => g._count._all >= 5).length
    if (highWorkloadCount > 0) {
      insights.push({ type: 'warning', text: `${highWorkloadCount} employee${highWorkloadCount > 1 ? 's' : ''} have 5+ active tasks.` })
    }

    const totalTasks = await prisma.task.count()
    const completedTasks = await prisma.task.count({ where: { status: 'COMPLETED' } })
    if (totalTasks > 0) {
      const rate = Math.round((completedTasks / totalTasks) * 100)
      insights.push({ type: 'success', text: `Task completion rate is ${rate}% (${completedTasks}/${totalTasks}).` })
    }

    return successResponse(res, { insights })
  } catch (error) {
    console.error('Insights error:', error)
    return errorResponse(res, 'Failed to load insights', 500)
  }
})

// ── TEAM ANALYTICS ──────────────────────────────────────────────
router.get('/teams', authenticateAdmin, async (req, res) => {
  try {
    const departments = Object.values({ BUSINESS_MANAGEMENT: 'BUSINESS_MANAGEMENT', SALES_MANAGEMENT: 'SALES_MANAGEMENT', OPERATIONS_DEVELOPER: 'OPERATIONS_DEVELOPER' })

    const teamData = await Promise.all(departments.map(async (dept) => {
      const members = await prisma.user.findMany({
        where: { department: dept, status: 'ACTIVE', role: { not: 'ADMIN' } },
        select: { id: true, fullName: true, role: true, department: true, avatarUrl: true },
      })
      const memberIds = members.map(m => m.id)
      const [projects, tasks, completedTasks, overdueTasks] = await Promise.all([
        prisma.project.count({ where: { department: dept } }),
        prisma.task.count({ where: { assignedTo: { in: memberIds } } }),
        prisma.task.count({ where: { assignedTo: { in: memberIds }, status: 'COMPLETED' } }),
        prisma.task.count({ where: { assignedTo: { in: memberIds }, status: { not: 'COMPLETED' }, dueDate: { lt: new Date() } } }),
      ])
      const pendingTasks = tasks - completedTasks
      const completionRate = tasks > 0 ? Math.round((completedTasks / tasks) * 100) : 0
      const workloadPct = tasks > 0 ? Math.round((pendingTasks / Math.max(tasks, 1)) * 100) : 0

      return {
        department: dept,
        memberCount: members.length,
        members,
        totalProjects: projects,
        totalTasks: tasks,
        completedTasks,
        pendingTasks,
        overdueTasks,
        completionRate,
        workloadPct,
        productivity: completionRate,
      }
    }))

    return successResponse(res, { teams: teamData })
  } catch (error) {
    console.error('Team analytics error:', error)
    return errorResponse(res, 'Failed to load team analytics', 500)
  }
})

// ── PRODUCTIVITY ────────────────────────────────────────────────
router.get('/productivity', authenticateAdmin, async (req, res) => {
  try {
    const now = new Date()
    const last7d = new Date(now - 7 * 86400000)
    const last30d = new Date(now - 30 * 86400000)
    const prev30d = new Date(now - 60 * 86400000)

    const [totalTasks, completedTasks, recentCompleted, prevCompleted, overdueTasks, activeProjects, completedProjects] = await Promise.all([
      prisma.task.count(),
      prisma.task.count({ where: { status: 'COMPLETED' } }),
      prisma.task.count({ where: { status: 'COMPLETED', updatedAt: { gte: last7d } } }),
      prisma.task.count({ where: { status: 'COMPLETED', updatedAt: { gte: prev30d }, updatedAt: { lt: last30d } } }),
      prisma.task.count({ where: { status: { not: 'COMPLETED' }, dueDate: { lt: now } } }),
      prisma.project.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.project.count({ where: { status: 'COMPLETED' } }),
    ])

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    const projectCompletionRate = (activeProjects + completedProjects) > 0 ? Math.round((completedProjects / (activeProjects + completedProjects)) * 100) : 0
    const weeklyVelocity = recentCompleted
    const productivityChange = prevCompleted > 0 ? Math.round(((recentCompleted * 4 - prevCompleted) / prevCompleted) * 100) : 0

    return successResponse(res, {
      completionRate,
      projectCompletionRate,
      weeklyVelocity,
      overdueTasks,
      productivityChange,
      totalTasks,
      completedTasks,
      activeProjects,
      completedProjects,
    })
  } catch (error) {
    console.error('Productivity error:', error)
    return errorResponse(res, 'Failed to load productivity data', 500)
  }
})

// ── USER ACTIVITY ───────────────────────────────────────────────
router.get('/user-activity', authenticateAdmin, async (req, res) => {
  try {
    const now = new Date()
    const last7d = new Date(now - 7 * 86400000)
    const last30d = new Date(now - 30 * 86400000)

    const [recentUsers, recentTasks, recentMessages, recentAttendance, recentProjects] = await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, fullName: true, email: true, role: true, status: true, createdAt: true } }),
      prisma.task.findMany({ where: { updatedAt: { gte: last7d } }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, title: true, status: true, updatedAt: true } }),
      prisma.message.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, content: true, createdAt: true, isRead: true } }),
      prisma.attendance.findMany({ orderBy: { date: 'desc' }, take: 20, select: { id: true, status: true, date: true, checkIn: true } }),
      prisma.project.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, title: true, status: true, createdAt: true } }),
    ])

    const activities = [
      ...recentUsers.map(u => ({ type: 'user_joined', actor: u.fullName, action: 'registered', target: u.email, timestamp: u.createdAt, status: u.status })),
      ...recentTasks.map(t => ({ type: 'task_updated', actor: 'System', action: `Task "${t.title}" updated`, target: t.status, timestamp: t.updatedAt })),
      ...recentMessages.map(m => ({ type: 'message_sent', actor: 'User', action: 'Sent a message', target: m.content?.slice(0, 50), timestamp: m.createdAt })),
      ...recentAttendance.map(a => ({ type: 'attendance', actor: 'User', action: `Attendance: ${a.status}`, target: a.date?.toISOString()?.slice(0, 10), timestamp: a.date })),
      ...recentProjects.map(p => ({ type: 'project_created', actor: 'Admin', action: `Project "${p.title}" created`, target: p.status, timestamp: p.createdAt })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50)

    return successResponse(res, { activities })
  } catch (error) {
    console.error('User activity error:', error)
    return errorResponse(res, 'Failed to load user activity', 500)
  }
})

export default router
