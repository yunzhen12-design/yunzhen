import 'dotenv/config'
import { prisma } from '../server/db'
import { seedIfEmpty } from '../server/seed'

async function main() {
  await seedIfEmpty()
}

main()
  .catch((err) => {
    console.error('[seed] 写入默认数据失败:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
