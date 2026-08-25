import { verifyToken } from '../utils/jwt.utils.js'
import { prisma } from '../utils/db.js'

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const decoded = verifyToken(token)

    if (!decoded) {
      return res.status(401).json({ message: 'Invalid or expired token' })
    }

    if (decoded.role === 'ADMIN') {
      if (decoded.adminId) {
        const admin = await prisma.admin.findUnique({
          where: { id: decoded.adminId },
        })
        if (!admin) {
          return res.status(401).json({ message: 'Admin not found' })
        }
        req.admin = { id: admin.id, email: admin.email, role: 'ADMIN' }
        req.user = null
        return next()
      }

      if (decoded.userId) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
        })
        if (!user || user.status !== 'ACTIVE') {
          return res.status(401).json({ message: 'User not found or not active' })
        }
        req.admin = { id: user.id, email: user.email, role: user.role }
        req.user = user
        return next()
      }
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
