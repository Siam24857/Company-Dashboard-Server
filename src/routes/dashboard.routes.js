import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'

const router = Router()

const startOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

const todayDate = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return new Date(`${y}-${m}-${day}T00:00:00.000Z`)
}

router.get('/overview', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return errorResponse(res, 'User account required', 400)
    }

    const today = new Date()

    const [
      attendance,
      projects,
      tasks,
      messages,
      notifications,
      announcements,
      leave,
      user,
    ] = await Promise.all([
      prisma.attendance.findMany({
        where: { userId, date: { gte: startOfMonth() } },
        orderBy: { date: 'desc' },
      }),
      prisma.project.findMany({
        where: {
          OR: [
            { members: { some: { userId } } },
            { department: req.user.department },
            { tasks: { some: { assignedTo: userId } } },
          ],
        },
        include: { _count: { select: { tasks: true } } },
      }),
      prisma.task.findMany({
        where: { assignedTo: userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.message.count({
        where: { receiverId: userId, isRead: false },
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.announcement.findMany({
        where: {
          AND: [
            { OR: [{ targetRole: null }, { targetRole: req.user.role }] },
            { publishedAt: { lte: today } },
            { OR: [{ expiresAt: null }, { expiresAt: { gte: today } }] },
          ],
        },
        include: { reads: { where: { userId }, select: { id: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      prisma.leaveRequest.count({
        where: { userId, status: 'PENDING' },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          fullName: true,
          email: true,
          role: true,
          department: true,
          status: true,
          avatarUrl: true,
        },
      }),
    ])

    const presentDays = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length
    const attendanceRate = attendance.length
      ? Math.round((presentDays / attendance.length) * 100)
      : 0

    const totalTasks = tasks.length
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length

    const unreadAnnouncements = announcements.filter((a) => a.reads.length === 0).length

    return successResponse(res, {
      user,
      attendance: {
        total: attendance.length,
        present: presentDays,
        rate: attendanceRate,
      },
      projects: {
        total: projects.length,
        active: projects.filter((p) => p.status === 'IN_PROGRESS').length,
        completed: projects.filter((p) => p.status === 'COMPLETED').length,
        planning: projects.filter((p) => p.status === 'PLANNING').length,
        onHold: projects.filter((p) => p.status === 'ON_HOLD').length,
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: totalTasks - completedTasks,
        todo: tasks.filter((t) => t.status === 'TODO').length,
        inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
        inReview: tasks.filter((t) => t.status === 'IN_REVIEW').length,
      },
      messages: { unread: messages },
      notifications: {
        recent: notifications,
        unreadCount: notifications.filter((n) => !n.isRead).length,
      },
      announcements: {
        recent: announcements,
        unread: unreadAnnouncements,
      },
      leave: { pending: leave },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/admin', authenticateAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      totalProjects,
      projectsByStatus,
      totalTasks,
      pendingTasks,
      completedTasks,
      totalAttendanceToday,
      attendanceToday,
      pendingLeave,
      totalAnnouncements,
      publishedAnnouncements,
      bdLeads,
      bdProposals,
      salesPipeline,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.project.count(),
      prisma.project.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.task.count(),
      prisma.task.count({ where: { status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW'] } } }),
      prisma.task.count({ where: { status: 'COMPLETED' } }),
      prisma.attendance.count({ where: { date: todayDate() } }),
      prisma.attendance.groupBy({ by: ['status'], where: { date: todayDate() }, _count: { status: true } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.announcement.count(),
      prisma.announcement.count({ where: { publishedAt: { lte: new Date() } } }),
      prisma.bdLead.count(),
      prisma.bdProposal.count(),
      prisma.salesPipeline.count(),
    ])

    const projectByStatus = {}
    projectsByStatus.forEach((p) => (projectByStatus[p.status] = p._count.status))

    const attendanceByStatus = {}
    attendanceToday.forEach((a) => (attendanceByStatus[a.status] = a._count.status))

    return successResponse(res, {
      users: { total: totalUsers, active: activeUsers, pending: pendingUsers, suspended: suspendedUsers },
      projects: { total: totalProjects, byStatus: projectByStatus },
      tasks: { total: totalTasks, pending: pendingTasks, completed: completedTasks },
      attendance: { today: totalAttendanceToday, byStatus: attendanceByStatus },
      leave: { pending: pendingLeave },
      announcements: { total: totalAnnouncements, published: publishedAnnouncements },
      pipeline: {
        leads: bdLeads,
        proposals: bdProposals,
        activeDeals: salesPipeline,
      },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router