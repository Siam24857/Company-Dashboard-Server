import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { requireAnyRole } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'
import { createAuditLog } from '../services/audit.service.js'
import { createNotification, createBroadcast } from '../services/notification.service.js'

const router = Router()

const submissionSchema = z.object({
  summary: z.string().min(1),
  completedWork: z.string().min(1),
  problems: z.string().optional(),
  timeSpentMinutes: z.number().int().positive().optional(),
  screenshotUrl: z.string().optional(),
  screenshotPublicId: z.string().optional(),
})

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  adminFeedback: z.string().optional(),
})

const getActor = (req) => ({
  id: req.user?.id || req.admin?.id || null,
  email: req.user?.email || req.admin?.email || null,
})

router.get('/:taskId/submissions', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const { taskId } = req.params

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, assignedTo: true },
    })

    if (!task) {
      return errorResponse(res, 'Task not found', 404)
    }

    const isAdmin = !!req.admin || req.user?.role === 'ADMIN'
    const isAssignedUser = req.user?.id && req.user.id === task.assignedTo

    if (!isAdmin && !isAssignedUser) {
      return errorResponse(res, 'Access denied', 403)
    }

    const submissions = await prisma.taskSubmission.findMany({
      where: { taskId },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(res, { submissions })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.post('/:taskId/submit', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), validateBody(submissionSchema), async (req, res) => {
  try {
    const { taskId } = req.params

    let userId = req.user?.id
    let userName = req.user?.fullName || req.user?.email || 'Unknown'

    if (!userId && req.admin?.id) {
      const adminUser = await prisma.user.findUnique({
        where: { email: req.admin.email },
        select: { id: true, fullName: true, email: true },
      })
      if (adminUser) {
        userId = adminUser.id
        userName = adminUser.fullName || adminUser.email
      }
    }

    if (!userId) {
      return errorResponse(res, 'No user account found for this admin. Please use a regular user account to submit tasks.', 400)
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, assignedTo: true, status: true, projectId: true, title: true },
    })

    if (!task) {
      return errorResponse(res, 'Task not found', 404)
    }

    const isAdmin = req.user?.role === 'ADMIN' || !!req.admin
    if (task.assignedTo !== userId && !isAdmin) {
      return errorResponse(res, 'You are not assigned to this task', 403)
    }

    const submission = await prisma.taskSubmission.create({
      data: {
        taskId,
        userId,
        summary: req.body.summary,
        completedWork: req.body.completedWork,
        problems: req.body.problems || null,
        timeSpentMinutes: req.body.timeSpentMinutes || null,
        screenshotUrl: req.body.screenshotUrl || null,
        screenshotPublicId: req.body.screenshotPublicId || null,
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
        task: {
          select: { id: true, title: true },
        },
      },
    })

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'IN_REVIEW' },
    })

    const [adminUsers, projectMembers] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      }),
      prisma.userProject.findMany({
        where: { projectId: task.projectId },
        select: { userId: true },
      }),
    ])

    const recipientIds = new Set(adminUsers.map((u) => u.id))
    projectMembers.forEach((m) => recipientIds.add(m.userId))
    recipientIds.delete(userId)

    if (recipientIds.size > 0) {
      await createBroadcast(
        Array.from(recipientIds),
        'Task submitted for review',
        `${userName} submitted work for the task "${task.title}".`,
        'TASK'
      )
    }

    const actor = getActor(req)
    await createAuditLog('TASK_SUBMITTED', taskId, `Task submission created for task: ${task.title}`, actor.id, actor.email, req.ip)

    return successResponse(res, { submission }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.patch('/:id/review', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), validateBody(reviewSchema), async (req, res) => {
  try {
    const { id } = req.params
    const { status, adminFeedback } = req.body

    const submission = await prisma.taskSubmission.findUnique({
      where: { id },
      include: { task: true },
    })

    if (!submission) {
      return errorResponse(res, 'Submission not found', 404)
    }

    const isAdmin = !!req.admin || req.user?.role === 'ADMIN'
    if (!isAdmin) {
      return errorResponse(res, 'Only managers or admins can review submissions', 403)
    }

    const updatedSubmission = await prisma.taskSubmission.update({
      where: { id },
      data: {
        status,
        adminFeedback: adminFeedback || null,
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
        task: {
          select: { id: true, title: true },
        },
      },
    })

    if (status === 'APPROVED') {
      await prisma.task.update({
        where: { id: submission.taskId },
        data: { status: 'COMPLETED' },
      })
    } else if (status === 'REJECTED' || status === 'CHANGES_REQUESTED') {
      await prisma.task.update({
        where: { id: submission.taskId },
        data: { status: 'IN_PROGRESS' },
      })
    }

    const statusMessage = {
      APPROVED: 'approved',
      REJECTED: 'rejected',
      CHANGES_REQUESTED: 'requested changes on',
    }[status]

    await createNotification(
      submission.userId,
      `Submission ${status.toLowerCase()}`,
      `Your submission for "${submission.task.title}" was ${statusMessage}${adminFeedback ? `: ${adminFeedback}` : ''}.`,
      'TASK'
    )

    const actor = getActor(req)
    await createAuditLog('TASK_REVIEWED', submission.taskId, `Task submission reviewed: ${status}`, actor.id, actor.email, req.ip)

    return successResponse(res, { submission: updatedSubmission })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

router.get('/:id', requireAnyRole('ADMIN', 'BUSINESS_MANAGEMENT', 'SALES_MANAGEMENT', 'OPERATIONS_DEVELOPER'), async (req, res) => {
  try {
    const submission = await prisma.taskSubmission.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        task: {
          select: { id: true, title: true, description: true },
        },
      },
    })

    if (!submission) {
      return errorResponse(res, 'Submission not found', 404)
    }

    const isAdmin = !!req.admin || req.user?.role === 'ADMIN'
    const isOwner = req.user?.id && req.user.id === submission.userId

    if (!isAdmin && !isOwner) {
      return errorResponse(res, 'Access denied', 403)
    }

    return successResponse(res, { submission })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
})

export default router
