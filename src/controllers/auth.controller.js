import { prisma } from '../utils/db.js'
import { hashPassword, comparePassword, validatePassword } from '../utils/hash.utils.js'
import { generateToken } from '../utils/jwt.utils.js'
import { successResponse, errorResponse } from '../utils/response.utils.js'
import { welcomePending, welcomeApproved, adminNewUserEmail } from '../services/email.service.js'
import { sendEmail } from '../services/email.service.js'
import { createAuditLog } from '../services/audit.service.js'

export const register = async (req, res) => {
  try {
    const { fullName, email, password, phone, role, department } = req.body

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return errorResponse(res, 'User with this email already exists', 400)
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        password: hashedPassword,
        phone,
        role,
        department,
        status: 'ACTIVE',
      },
    })

    await sendEmail(email, ...Object.values(welcomePending(fullName)))
    await sendEmail(process.env.ADMIN_EMAIL, ...Object.values(adminNewUserEmail(fullName, email, `${process.env.FRONTEND_URL}/admin/users`)))

    await createAuditLog('USER_REGISTERED', null, `New user registered: ${fullName}`, user.id, user.email, req.ip)

    const { password: _, ...userWithoutPassword } = user
    return successResponse(res, { user: userWithoutPassword, message: 'Registration successful. Awaiting admin approval.' }, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      const admin = await prisma.admin.findUnique({ where: { email } })

      if (!admin) {
        return errorResponse(res, 'Invalid email or password', 401)
      }

      const isValidAdmin = await comparePassword(password, admin.password)
      if (!isValidAdmin) {
        return errorResponse(res, 'Invalid email or password', 401)
      }

      const token = generateToken({ adminId: admin.id, role: 'ADMIN' })

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
      })

      return successResponse(res, {
        user: { id: admin.id, email: admin.email, role: 'ADMIN', status: 'ACTIVE', fullName: 'Administrator' },
        token,
      })
    }

    if (user.status === 'PENDING') {
      return errorResponse(res, 'Account pending approval', 403)
    }
    if (user.status === 'SUSPENDED') {
      return errorResponse(res, 'Account suspended. Contact admin.', 403)
    }

    const isValid = await comparePassword(password, user.password)
    if (!isValid) {
      return errorResponse(res, 'Invalid email or password', 401)
    }

    const token = generateToken({ userId: user.id, role: user.role, department: user.department, email: user.email })

    const { password: _, ...userWithoutPassword } = user

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
    })

    return successResponse(res, { user: userWithoutPassword, token })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return errorResponse(res, 'User not found', 404)
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000)

    await prisma.user.update({
      where: { id: user.id },
      data: { otp, otpExpiry },
    })

    await sendEmail(email, ...Object.values(otpEmail(user.fullName, otp)))

    return successResponse(res, { message: 'OTP sent to your email' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return errorResponse(res, 'User not found', 404)
    }

    if (user.otp !== otp || !user.otpExpiry || user.otpExpiry < new Date()) {
      return errorResponse(res, 'Invalid or expired OTP', 400)
    }

    const hashedPassword = await hashPassword(newPassword)

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, otp: null, otpExpiry: null },
    })

    return successResponse(res, { message: 'Password reset successful' })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

export const logout = (req, res) => {
  res.clearCookie('token')
  return successResponse(res, { message: 'Logged out successfully' })
}

export const getMe = async (req, res) => {
  try {
    const { password: _, ...userWithoutPassword } = req.user
    return successResponse(res, { user: userWithoutPassword })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}
