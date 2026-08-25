import { prisma } from '../utils/db.js'

export const createAuditLog = async (action, target, description, actorId, actorEmail, ip) => {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        target: target || null,
        description: description || null,
        actorId: actorId || null,
        actorEmail: actorEmail || null,
        ip: ip || null,
      },
    })
  } catch (error) {
    console.error('Audit log creation failed:', error)
  }
}
