import { verifyToken } from '../utils/jwt.utils.js'
import { prisma } from '../utils/db.js'

const getToken = (req) => req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')

// Resolves an ADMIN identity from either token shape:
//  - Admin record token  -> { adminId, role: 'ADMIN' }
//  - User record token   -> { userId, role: 'ADMIN' } (User table role ADMIN)
const resolveAdminIdentity = async (decoded) => {
  if (!decoded || decoded.role !== 'ADMIN') return null

  if (decoded.adminId) {
    const admin = await prisma.admin.findUnique({ where: { id: decoded.adminId } })
    if (!admin) return null
    return { admin, user: null }
  }

  if (decoded.userId) {
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
    if (!user || user.status !== 'ACTIVE' || user.role !== 'ADMIN') return null
    return { admin: { id: user.id, email: user.email, role: user.role }, user }
  }

  return null
}

export const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const token = getToken(req)

      if (!token) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const decoded = verifyToken(token)

      if (!decoded || !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ message: 'Access denied' })
      }

      if (decoded.role === 'ADMIN') {
        const identity = await resolveAdminIdentity(decoded)
        if (!identity) {
          return res.status(401).json({ message: 'Admin not found' })
        }
        req.admin = identity.admin
        req.user = identity.user
        return next()
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      })

      if (!user || user.status !== 'ACTIVE') {
        return res.status(401).json({ message: 'User not found or not active' })
      }

      req.user = user
      next()
    } catch (error) {
      return res.status(401).json({ message: 'Authentication failed' })
    }
  }
}

export const requireAnyRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const token = getToken(req)

      if (!token) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const decoded = verifyToken(token)

      if (!decoded) {
        return res.status(401).json({ message: 'Invalid or expired token' })
      }

      const isAdmin = decoded.role === 'ADMIN'
      const hasAllowedRole = allowedRoles.includes(decoded.role)

      if (!isAdmin && !hasAllowedRole) {
        return res.status(403).json({ message: 'Access denied' })
      }

      if (isAdmin) {
        const identity = await resolveAdminIdentity(decoded)
        if (!identity) {
          return res.status(401).json({ message: 'Admin not found' })
        }
        req.admin = identity.admin
        req.user = identity.user
        return next()
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      })

      if (!user || user.status !== 'ACTIVE') {
        return res.status(401).json({ message: 'User not found or not active' })
      }

      req.user = user
      next()
    } catch (error) {
      return res.status(401).json({ message: 'Authentication failed' })
    }
  }
}

export const requireAdmin = async (req, res, next) => {
  try {
    const token = getToken(req)

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const decoded = verifyToken(token)

    if (!decoded || decoded.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' })
    }

    const identity = await resolveAdminIdentity(decoded)

    if (!identity) {
      return res.status(401).json({ message: 'Admin not found' })
    }

    req.admin = identity.admin
    req.user = identity.user
    next()
  } catch (error) {
    return res.status(401).json({ message: 'Admin authentication failed' })
  }
}

export const authenticateAdmin = requireAdmin