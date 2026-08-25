import jwt from 'jsonwebtoken'
import { prisma } from './db.js'

export const generateToken = (payload, expiresIn = '8h') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn })
}

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch (error) {
    return null
  }
}
