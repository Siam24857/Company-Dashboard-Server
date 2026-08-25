import cron from 'node-cron'
import { prisma } from '../utils/db.js'
import { attendanceReminderEmail } from './email.service.js'
import { sendEmail } from './email.service.js'
import { createNotification } from './notification.service.js'

export const startCronJobs = () => {
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily attendance reminder job')
    try {
      const activeUsers = await prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { email: true, fullName: true },
      })

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      for (const user of activeUsers) {
        const attendance = await prisma.attendance.findFirst({
          where: { userId: user.id, date: today },
        })

        if (!attendance) {
          await sendEmail(user.email, ...Object.values(attendanceReminderEmail()))
        }
      }

      console.log(`Attendance reminders sent to ${activeUsers.length} users`)
    } catch (error) {
      console.error('Error sending attendance reminders:', error)
    }
  })

  cron.schedule('0 23 * * *', async () => {
    console.log('Running daily attendance auto-mark absent job')
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const activeUsers = await prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      })

      const dayOfWeek = today.getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

      if (!isWeekend) {
        for (const user of activeUsers) {
          const existing = await prisma.attendance.findFirst({
            where: { userId: user.id, date: today },
          })

          if (!existing) {
            await prisma.attendance.create({
              data: { userId: user.id, date: today, status: 'ABSENT' },
            })
            await createNotification(
              user.id,
              'Attendance marked absent',
              'You did not mark your attendance today and have been marked absent.',
              'ATTENDANCE'
            )
          }
        }
      }

      console.log('Auto-mark absent job completed')
    } catch (error) {
      console.error('Error auto-marking absent:', error)
    }
  })
}
