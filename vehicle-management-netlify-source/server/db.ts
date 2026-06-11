import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

// Prisma 负责表结构迁移；启动时仅验证数据库连接。
export async function initSchema() {
  await prisma.$connect()
}
