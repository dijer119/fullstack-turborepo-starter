import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addDividendYieldColumn() {
  try {
    console.log('📊 Adding dividend_yield column to stocks table...');

    // SQL을 실행하여 컬럼 추가
    await prisma.$executeRaw`
      ALTER TABLE stocks
      ADD COLUMN IF NOT EXISTS dividend_yield DECIMAL(10,2)
    `;

    console.log('✅ dividend_yield column added successfully (or already exists)');
  } catch (error) {
    console.error('❌ Error adding dividend_yield column:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addDividendYieldColumn();