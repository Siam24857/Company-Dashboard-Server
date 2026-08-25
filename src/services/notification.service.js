import { prisma } from '../utils/db.js'

export const createNotification = async (userId, title, message, type = 'SYSTEM') => {
  try {
    await prisma.notification.create({
      data: { userId, title, message, type },
    })
  } catch (error) {
    console.error('Error creating notification:', error)
  }
}

export const createBroadcast = async (userIds, title, message, type = 'SYSTEM') => {
  try {
    const notifications = userIds.map((userId) => ({
      userId,
      title,
      message,
      type,
    }))

    await prisma.notification.createMany({ data: notifications })
  } catch (error) {
    console.error('Error creating broadcast:', error)
  }
}
