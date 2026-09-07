import { Router } from 'express'
import { prisma } from '../utils/db.js'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.middleware.js'

const router = Router()

const webhookSchema = z.object({
  name: z.string().min(2),
  url: z.string().url(),
  events: z.string().array().optional(),
})

const approvalSchema = z.object({
  type: z.string(),
  title: z.string().min(2),
  description: z.string().optional(),
  requesterId: z.string(),
})

const automationSchema = z.object({
  name: z.string().min(2),
  trigger: z.string(),
  conditions: z.string().optional(),
  actions: z.string(),
})

const incidentSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  affectedService: z.string(),
  owner: z.string().optional(),
})

const jobSchema = z.object({
  name: z.string().min(2),
  type: z.string(),
})

const featureFlagSchema = z.object({
  name: z.string().min(2),
  key: z.string().min(2),
  enabled: z.boolean().optional(),
  targetAudience: z.string().optional(),
  rolloutPercentage: z.number().optional(),
})

const customKPISchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  dataSource: z.string(),
  calculation: z.string(),
  target: z.number().optional(),
  warningThreshold: z.number().optional(),
  criticalThreshold: z.number().optional(),
  displayType: z.string().optional(),
})

router.get('/webhooks', authenticateAdmin, async (req, res) => {
  try {
    const webhooks = await prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse(res, { webhooks })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch webhooks', 500)
  }
})

router.post('/webhooks', authenticateAdmin, validateBody(webhookSchema), async (req, res) => {
  try {
    const webhook = await prisma.webhook.create({ data: req.body, createdById: req.admin?.id || 'system' })
    return successResponse(res, { webhook }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create webhook', 500)
  }
})

router.patch('/webhooks/:id', authenticateAdmin, async (req, res) => {
  try {
    const webhook = await prisma.webhook.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { webhook })
  } catch (error) {
    return errorResponse(res, 'Failed to update webhook', 500)
  }
})

router.delete('/webhooks/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.webhook.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Webhook deleted' })
  } catch (error) {
    return errorResponse(res, 'Failed to delete webhook', 500)
  }
})

router.get('/webhooks/:id/delivery-log', authenticateAdmin, async (req, res) => {
  try {
    const logs = await prisma.webhookDeliveryLog.findMany({
      where: { webhookId: req.params.id },
      orderBy: { deliveredAt: 'desc' },
      take: 50,
    })
    return successResponse(res, { deliveryLogs: logs })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch delivery logs', 500)
  }
})

router.get('/approvals', authenticateAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const where = {}
    if (status) where.status = status

    const [approvals, total] = await Promise.all([
      prisma.approval.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      prisma.approval.count({ where }),
    ])
    return successResponse(res, { approvals, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch approvals', 500)
  }
})

router.post('/approvals', authenticateAdmin, validateBody(approvalSchema), async (req, res) => {
  try {
    const approval = await prisma.approval.create({ data: req.body })
    return successResponse(res, { approval }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create approval', 500)
  }
})

router.patch('/approvals/:id', authenticateAdmin, async (req, res) => {
  try {
    const approval = await prisma.approval.update({
      where: { id: req.params.id },
      data: { ...req.body, updatedAt: new Date() },
    })
    await prisma.auditLog.create({
      data: { action: 'APPROVAL_UPDATED', target: req.params.id, description: `Approval ${approval.title} ${approval.status}`, actorEmail: req.admin?.email, result: 'SUCCESS' },
    })
    return successResponse(res, { approval })
  } catch (error) {
    return errorResponse(res, 'Failed to update approval', 500)
  }
})

router.get('/automation', authenticateAdmin, async (req, res) => {
  try {
    const rules = await prisma.automationRule.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse(res, { rules })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch automation rules', 500)
  }
})

router.post('/automation', authenticateAdmin, validateBody(automationSchema), async (req, res) => {
  try {
    const rule = await prisma.automationRule.create({ data: req.body, createdById: req.admin?.id || 'system' })
    return successResponse(res, { rule }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create automation rule', 500)
  }
})

router.patch('/automation/:id', authenticateAdmin, async (req, res) => {
  try {
    const rule = await prisma.automationRule.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { rule })
  } catch (error) {
    return errorResponse(res, 'Failed to update automation rule', 500)
  }
})

router.delete('/automation/:id', authenticateAdmin, async (req, res) => {
  try {
    await prisma.automationRule.delete({ where: { id: req.params.id } })
    return successResponse(res, { message: 'Automation rule deleted' })
  } catch (error) {
    return errorResponse(res, 'Failed to delete automation rule', 500)
  }
})

router.get('/automation/:id/logs', authenticateAdmin, async (req, res) => {
  try {
    const logs = await prisma.automationExecutionLog.findMany({
      where: { ruleId: req.params.id },
      orderBy: { executedAt: 'desc' },
      take: 50,
    })
    return successResponse(res, { executionLogs: logs })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch execution logs', 500)
  }
})

router.get('/incidents', authenticateAdmin, async (req, res) => {
  try {
    const { status, severity, page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const where = {}
    if (status) where.status = status
    if (severity) where.severity = severity

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      prisma.incident.count({ where }),
    ])
    return successResponse(res, { incidents, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch incidents', 500)
  }
})

router.post('/incidents', authenticateAdmin, validateBody(incidentSchema), async (req, res) => {
  try {
    const incident = await prisma.incident.create({ data: req.body })
    return successResponse(res, { incident }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create incident', 500)
  }
})

router.patch('/incidents/:id', authenticateAdmin, async (req, res) => {
  try {
    const incident = await prisma.incident.update({
      where: { id: req.params.id },
      data: { ...req.body, updatedAt: new Date() },
    })
    return successResponse(res, { incident })
  } catch (error) {
    return errorResponse(res, 'Failed to update incident', 500)
  }
})

router.get('/jobs', authenticateAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const where = {}
    if (status) where.status = status

    const [jobs, total] = await Promise.all([
      prisma.backgroundJob.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      prisma.backgroundJob.count({ where }),
    ])
    return successResponse(res, { jobs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch jobs', 500)
  }
})

router.patch('/jobs/:id/retry', authenticateAdmin, async (req, res) => {
  try {
    const job = await prisma.backgroundJob.update({
      where: { id: req.params.id },
      data: { status: 'QUEUED', retryCount: { increment: 1 }, error: null, startedAt: null, completedAt: null },
    })
    return successResponse(res, { job })
  } catch (error) {
    return errorResponse(res, 'Failed to retry job', 500)
  }
})

router.get('/feature-flags', authenticateAdmin, async (req, res) => {
  try {
    const flags = await prisma.featureFlag.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse(res, { flags })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch feature flags', 500)
  }
})

router.post('/feature-flags', authenticateAdmin, validateBody(featureFlagSchema), async (req, res) => {
  try {
    const flag = await prisma.featureFlag.create({ data: req.body })
    return successResponse(res, { flag }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create feature flag', 500)
  }
})

router.patch('/feature-flags/:id', authenticateAdmin, async (req, res) => {
  try {
    const flag = await prisma.featureFlag.update({ where: { id: req.params.id }, data: req.body })
    return successResponse(res, { flag })
  } catch (error) {
    return errorResponse(res, 'Failed to update feature flag', 500)
  }
})

router.get('/kpis', authenticateAdmin, async (req, res) => {
  try {
    const kpis = await prisma.customKPI.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse(res, { kpis })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch KPIs', 500)
  }
})

router.post('/kpis', authenticateAdmin, validateBody(customKPISchema), async (req, res) => {
  try {
    const kpi = await prisma.customKPI.create({ data: req.body, createdById: req.admin?.id || 'system' })
    return successResponse(res, { kpi }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create KPI', 500)
  }
})

router.get('/dashboard-layouts', authenticateAdmin, async (req, res) => {
  try {
    const layouts = await prisma.dashboardLayout.findMany({
      where: { adminId: req.admin?.id },
      orderBy: { createdAt: 'desc' },
    })
    return successResponse(res, { layouts })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch dashboard layouts', 500)
  }
})

router.post('/dashboard-layouts', authenticateAdmin, async (req, res) => {
  try {
    const layout = await prisma.dashboardLayout.create({
      data: { ...req.body, adminId: req.admin?.id },
    })
    return successResponse(res, { layout }, 201)
  } catch (error) {
    return errorResponse(res, 'Failed to create dashboard layout', 500)
  }
})

router.put('/dashboard-layouts/:id', authenticateAdmin, async (req, res) => {
  try {
    const layout = await prisma.dashboardLayout.update({
      where: { id: req.params.id, adminId: req.admin?.id },
      data: req.body,
    })
    return successResponse(res, { layout })
  } catch (error) {
    return errorResponse(res, 'Failed to update dashboard layout', 500)
  }
})

router.get('/data-quality', authenticateAdmin, async (req, res) => {
  try {
    const issues = await prisma.dataQualityIssue.findMany({ orderBy: { detectedAt: 'desc' }, take: 100 })
    const totalIssues = await prisma.dataQualityIssue.count()
    const resolvedIssues = await prisma.dataQualityIssue.count({ where: { isResolved: true } })
    const healthScore = totalIssues > 0 ? Math.round(((totalIssues - resolvedIssues) / totalIssues) * 100) : 100

    return successResponse(res, {
      issues,
      stats: { totalIssues, resolvedIssues, unresolvedIssues: totalIssues - resolvedIssues, healthScore },
    })
  } catch (error) {
    return errorResponse(res, 'Failed to fetch data quality', 500)
  }
})

export default router
