import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@ideon.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456'
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12)

  const existing = await prisma.admin.findUnique({
    where: { email: adminEmail },
  })

  if (!existing) {
    await prisma.admin.create({
      data: {
        email: adminEmail,
        password: adminPasswordHash,
      },
    })
    console.log('Admin account seeded successfully')
    console.log('Email:', adminEmail)
    console.log('Password:', adminPassword)
  } else {
    console.log('Admin account already exists')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
