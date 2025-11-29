import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testConnection() {
  console.log('🔌 Testing database connection...\n');

  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Database connection successful!\n');

    // Test Company table
    console.log('🏢 Testing Company operations...');
    
    // Create
    const company = await prisma.company.create({
      data: {
        name: 'Test Company',
        description: 'Testing database connection',
        code: 'TEST-DB-' + Date.now(),
      },
    });
    console.log('✅ Created company:', company);

    // Read
    const foundCompany = await prisma.company.findUnique({
      where: { id: company.id },
    });
    console.log('✅ Found company:', foundCompany);

    // Update
    const updatedCompany = await prisma.company.update({
      where: { id: company.id },
      data: { name: 'Updated Test Company' },
    });
    console.log('✅ Updated company:', updatedCompany);

    // Count
    const count = await prisma.company.count();
    console.log('✅ Total companies:', count);

    // Delete
    await prisma.company.delete({
      where: { id: company.id },
    });
    console.log('✅ Deleted test company\n');

    console.log('🎉 All database operations successful!');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testConnection();

