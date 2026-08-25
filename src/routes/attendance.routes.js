import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'
import { createAuditLog } from '../services/audit.service.js'

const router = Router()

const attendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE']),
  taskTitle: z.string().optional(),
  taskDescription: z.string().optional(),
  workCompleted: z.string().optional(),
  taskStatus: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'REJECTED']).optional(),
  timeSpentMinutes: z.number().int().positive().optional(),
  screenshotUrl: z.string().optional(),
  screenshotPublicId: z.string().optional(),
  notes: z.string().optional(),
})

const toLocalDateString = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const toDate = (dateString) => new Date(`${dateString}T00:00:00.000Z`)

const normalizeTimestamp = (value, dateString) => {
  if (!value) return null
  const trimmed = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed)
    if (isNaN(d.getTime())) return null
    return d
  }
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const d = new Date(`${dateString}T${trimmed}Z`)
    if (isNaN(d.getTime())) return null
    return d
  }
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) return null
  return d
}

const resolveDate = (req, bodyDate) => {
  if (bodyDate) return bodyDate
  return toLocalDateString(new Date())
}

router.post('/', authenticate, validateBody(attendanceSchema), async (req, res) => {
  try {
    let userId = req.user?.id

    if (!userId && req.admin?.id) {
      const adminUser = await prisma.user.findUnique({
        where: { email: req.admin.email },
        select: { id: true },
      })
      if (adminUser) {
        userId = adminUser.id
      }
    }

    if (!userId) {
      return errorResponse(res, 'No user account found. Please use a regular user account.', 400)
    }
    const {
      date: rawDate,
      checkIn: rawCheckIn,
      checkOut: rawCheckOut,
      status,
      taskTitle,
      taskDescription,
      workCompleted,
      taskStatus,
      timeSpentMinutes,
      screenshotUrl,
      screenshotPublicId,
      notes,
    } = req.body

    const dateString = resolveDate(req, rawDate)
    const date = toDate(dateString)

    if (date > toDate(toLocalDateString(new Date()))) {
      return errorResponse(res, 'Attendance cannot be recorded for a future date', 400)
    }

    const checkInDate = normalizeTimestamp(rawCheckIn, dateString)
    const checkOutDate = normalizeTimestamp(rawCheckOut, dateString)

    if (checkOutDate && checkInDate && checkOutDate < checkInDate) {
      return errorResponse(res, 'Check-out time cannot be before check-in time', 400)
    }

    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId, date } },
    })

    if (existing && existing.checkIn && checkInDate) {
      return errorResponse(res, 'You have already checked in today', 400)
    }

    if (existing && existing.checkOut && checkOutDate) {
      return errorResponse(res, 'You have already checked out today', 400)
    }

    const attendance = await prisma.attendance.upsert({
      where: { userId_date: { userId, date } },
      update: {
        checkIn: checkInDate || undefined,
        checkOut: checkOutDate || undefined,
        status,
        taskTitle: taskTitle || undefined,
        taskDescription: taskDescription || undefined,
        workCompleted: workCompleted || undefined,
        taskStatus: taskStatus || undefined,
        timeSpentMinutes: timeSpentMinutes || undefined,
        screenshotUrl: screenshotUrl || undefined,
        screenshotPublicId: screenshotPublicId || undefined,
        notes: notes || undefined,
      },
      create: {
        userId,
        date,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        status,
        taskTitle,
        taskDescription,
        workCompleted,
        taskStatus,
        timeSpentMinutes,
        screenshotUrl,
        screenshotPublicId,
        notes,
      },
    })

    await createAuditLog('ATTENDANCE_SUBMITTED', attendance.id, `Attendance submitted for ${dateString}`, userId, req.user.email, req.ip)

    return successResponse(res, { attendance })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/me', authenticate, async (req, res) => {
  try {
    let userId = req.user?.id

    if (!userId && req.admin?.id) {
      const adminUser = await prisma.user.findUnique({
        where: { email: req.admin.email },
        select: { id: true },
      })
      if (adminUser) {
        userId = adminUser.id
      }
    }

    if (!userId) {
      return errorResponse(res, 'No user account found', 400)
    }

    const { startDate, endDate, date } = req.query
    const where = { userId }

    if (date) {
      where.date = toDate(date)
    } else if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = toDate(startDate)
      if (endDate) where.date.lte = toDate(endDate)
    }

    const attendances = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
    })

    return successResponse(res, { attendances })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/checkout', authenticate, async (req, res) => {
  try {
    const { checkOut } = req.body

    if (!checkOut) {
      return errorResponse(res, 'Check-out time is required', 400)
    }

    let userId = req.user?.id
    if (!userId && req.admin?.id) {
      const adminUser = await prisma.user.findUnique({
        where: { email: req.admin.email },
        select: { id: true },
      })
      if (adminUser) {
        userId = adminUser.id
      }
    }

    if (!userId) {
      return errorResponse(res, 'No user account found', 400)
    }

    const attendance = await prisma.attendance.findFirst({
      where: { id: req.params.id, userId },
    })

    if (!attendance) return errorResponse(res, 'Attendance record not found', 404)

    if (attendance.checkOut) {
      return errorResponse(res, 'You have already checked out for this record', 400)
    }

    const dateString = toLocalDateString(attendance.date)
    const checkOutDate = normalizeTimestamp(checkOut, dateString)

    if (!checkOutDate) {
      return errorResponse(res, 'Invalid check-out time', 400)
    }

    if (attendance.checkIn && checkOutDate < attendance.checkIn) {
      return errorResponse(res, 'Check-out time cannot be before check-in time', 400)
    }

    const updated = await prisma.attendance.update({
      where: { id: req.params.id },
      data: { checkOut: checkOutDate },
    })

    return successResponse(res, { attendance: updated })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate, department, userId, status } = req.query

    const where = {}
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = toDate(startDate)
      if (endDate) where.date.lte = toDate(endDate)
    }
    if (userId) where.userId = userId
    if (status) where.status = status
    if (department) {
      where.user = { department }
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            department: true,
            role: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 100,
    })

    return successResponse(res, { attendances })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { checkIn, checkOut, status, notes, taskTitle, taskDescription, workCompleted, taskStatus, timeSpentMinutes, screenshotUrl, screenshotPublicId } = req.body

    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } })
    if (!existing) return errorResponse(res, 'Attendance not found', 404)

    const dateString = toLocalDateString(existing.date)
    const updated = await prisma.attendance.update({
      where: { id: req.params.id },
      data: {
        checkIn: checkIn ? normalizeTimestamp(checkIn, dateString) : undefined,
        checkOut: checkOut ? normalizeTimestamp(checkOut, dateString) : undefined,
        status,
        notes,
        taskTitle,
        taskDescription,
        workCompleted,
        taskStatus,
        timeSpentMinutes,
        screenshotUrl,
        screenshotPublicId,
      },
    })

    await createAuditLog('ATTENDANCE_UPDATED', updated.id, `Attendance updated for user ${updated.userId}`, req.admin.id, req.admin.email, req.ip)

    return successResponse(res, { attendance: updated })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/manual', authenticateAdmin, async (req, res) => {
  try {
    const { userId, date, checkIn, checkOut, status, notes } = req.body

    if (!userId || !date || !status) {
      return errorResponse(res, 'userId, date and status are required', 400)
    }

    const dateString = date.match(/^\d{4}-\d{2}-\d{2}$/) ? date : toLocalDateString(new Date(date))
    const attendanceDate = toDate(dateString)

    const attendance = await prisma.attendance.upsert({
      where: { userId_date: { userId, date: attendanceDate } },
      update: { checkIn: checkIn ? normalizeTimestamp(checkIn, dateString) : undefined, checkOut: checkOut ? normalizeTimestamp(checkOut, dateString) : undefined, status, notes },
      create: { userId, date: attendanceDate, checkIn: checkIn ? normalizeTimestamp(checkIn, dateString) : null, checkOut: checkOut ? normalizeTimestamp(checkOut, dateString) : null, status, notes },
    })

    await createAuditLog('ATTENDANCE_MANUAL', attendance.id, `Manual attendance created for user ${userId}`, req.admin.id, req.admin.email, req.ip)

    return successResponse(res, { attendance })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/summary', authenticateAdmin, async (req, res) => {
  try {
    const today = toDate(toLocalDateString(new Date()))

    const summary = await prisma.attendance.groupBy({
      by: ['status'],
      where: { date: today },
      _count: { status: true },
    })

    const totalUsers = await prisma.user.count({ where: { status: 'ACTIVE' } })

    return successResponse(res, { summary, totalUsers })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/statistics', authenticateAdmin, async (req, res) => {
  try {
    const today = toDate(toLocalDateString(new Date()))

    const totalUsers = await prisma.user.count({ where: { status: 'ACTIVE' } })

    const todaySummary = await prisma.attendance.groupBy({
      by: ['status'],
      where: { date: today },
      _count: { status: true },
    })

    const pendingReports = await prisma.attendance.count({
      where: {
        date: today,
        workCompleted: null,
        status: { not: 'ABSENT' },
      },
    })

    const completedReports = await prisma.attendance.count({
      where: {
        date: today,
        workCompleted: { not: null },
      },
    })

    return successResponse(res, {
      totalUsers,
      todaySummary,
      pendingReports,
      completedReports,
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/export', authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const where = {}
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = toDate(startDate)
      if (endDate) where.date.lte = toDate(endDate)
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: { user: { select: { fullName: true, email: true, department: true, role: true } } },
      orderBy: { date: 'desc' },
    })

    const headers = ['Name', 'Email', 'Department', 'Role', 'Date', 'Check-In', 'Check-Out', 'Status', 'Task', 'Task Status', 'Screenshot', 'Notes']
    const rows = attendances.map((a) => [
      a.user.fullName,
      a.user.email,
      a.user.department,
      a.user.role,
      toLocalDateString(a.date),
      a.checkIn ? a.checkIn.toISOString() : '',
      a.checkOut ? a.checkOut.toISOString() : '',
      a.status,
      a.taskTitle || '',
      a.taskStatus || '',
      a.screenshotUrl || '',
      a.notes || '',
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => (typeof cell === 'string' && /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv')
    res.send(csv)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
