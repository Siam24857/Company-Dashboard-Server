import { Router } from 'express'
import { authenticateAdmin } from '../middleware/role.middleware.js'
import { generateToken } from '../utils/jwt.utils.js'
import { prisma } from '../utils/db.js'
import bcrypt from 'bcryptjs'

const router = Router()

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    const admin = await prisma.admin.findUnique({ where: { email } })
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const isValid = await bcrypt.compare(password, admin.password)
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const token = generateToken({ adminId: admin.id, role: 'ADMIN' })

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
    })

    return res.json({ admin: { id: admin.id, email: admin.email, role: 'ADMIN', fullName: 'Administrator' }, token })
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
})

router.get('/verify', authenticateAdmin, (req, res) => {
  return res.json({ admin: { id: req.admin.id, email: req.admin.email } })
})

export default router
