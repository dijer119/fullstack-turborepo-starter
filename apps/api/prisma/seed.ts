import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data (optional - 개발 환경에서만)
  console.log('🗑️  Cleaning existing data...');
  await prisma.company.deleteMany({});
  await prisma.user.deleteMany({});

  // Seed Users
  console.log('👥 Seeding users...');
  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'john@example.com',
        name: 'John Doe',
      },
    }),
    prisma.user.create({
      data: {
        email: 'jane@example.com',
        name: 'Jane Smith',
      },
    }),
    prisma.user.create({
      data: {
        email: 'admin@example.com',
        name: 'Admin User',
      },
    }),
  ]);
  console.log(`✅ Created ${users.length} users`);

  // Seed Companies
  console.log('🏢 Seeding companies...');
  const companies = await Promise.all([
    prisma.company.create({
      data: {
        name: 'Acme Corporation',
        description: 'A leading technology company specializing in innovative solutions',
        code: 'ACME001',
      },
    }),
    prisma.company.create({
      data: {
        name: 'TechStart Inc',
        description: 'Startup focused on AI and machine learning',
        code: 'TECH002',
      },
    }),
    prisma.company.create({
      data: {
        name: 'Global Solutions Ltd',
        description: 'Enterprise software solutions provider',
        code: 'GLOB003',
      },
    }),
    prisma.company.create({
      data: {
        name: 'Digital Innovations',
        description: 'Digital transformation consulting',
        code: 'DIGI004',
      },
    }),
    prisma.company.create({
      data: {
        name: 'CloudFirst Systems',
        description: 'Cloud infrastructure and services',
        code: 'CLOU005',
      },
    }),
  ]);
  console.log(`✅ Created ${companies.length} companies`);

  // Display created data
  console.log('\n📊 Seed Summary:');
  console.log('================');
  console.log(`Users: ${users.length}`);
  users.forEach((user) => {
    console.log(`  - ${user.name} (${user.email})`);
  });

  console.log(`\nCompanies: ${companies.length}`);
  companies.forEach((company) => {
    console.log(`  - ${company.name} [${company.code}]`);
  });

  console.log('\n✨ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

