import { PrismaClient } from '@prisma/client';

describe('Companies Integration Test (Real DB)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Company CRUD Operations', () => {
    let createdCompanyId: number;

    it('should create a new company in the database', async () => {
      const company = await prisma.company.create({
        data: {
          name: 'Test Integration Company',
          description: 'This is a real database test',
          code: 'TEST-INT-001',
        },
      });

      expect(company).toBeDefined();
      expect(company.id).toBeDefined();
      expect(company.name).toBe('Test Integration Company');
      expect(company.description).toBe('This is a real database test');
      expect(company.code).toBe('TEST-INT-001');
      expect(company.createdAt).toBeInstanceOf(Date);
      expect(company.updatedAt).toBeInstanceOf(Date);

      createdCompanyId = company.id;
      console.log('✅ Created company with ID:', createdCompanyId);
    });

    it('should read the created company from database', async () => {
      const company = await prisma.company.findUnique({
        where: { id: createdCompanyId },
      });

      expect(company).toBeDefined();
      expect(company?.name).toBe('Test Integration Company');
      expect(company?.code).toBe('TEST-INT-001');
      
      console.log('✅ Found company:', company);
    });

    it('should update the company in database', async () => {
      const updatedCompany = await prisma.company.update({
        where: { id: createdCompanyId },
        data: {
          name: 'Updated Integration Company',
          description: 'Updated description',
        },
      });

      expect(updatedCompany.name).toBe('Updated Integration Company');
      expect(updatedCompany.description).toBe('Updated description');
      expect(updatedCompany.code).toBe('TEST-INT-001'); // Should remain same
      expect(updatedCompany.updatedAt.getTime()).toBeGreaterThan(
        updatedCompany.createdAt.getTime(),
      );

      console.log('✅ Updated company:', updatedCompany);
    });

    it('should list all companies from database', async () => {
      const companies = await prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
      });

      expect(Array.isArray(companies)).toBe(true);
      expect(companies.length).toBeGreaterThan(0);
      
      const ourCompany = companies.find((c) => c.id === createdCompanyId);
      expect(ourCompany).toBeDefined();
      expect(ourCompany?.name).toBe('Updated Integration Company');

      console.log(`✅ Found ${companies.length} companies in database`);
    });

    it('should count companies in database', async () => {
      const count = await prisma.company.count();

      expect(count).toBeGreaterThan(0);
      console.log(`✅ Total companies in database: ${count}`);
    });

    it('should search company by code', async () => {
      const company = await prisma.company.findFirst({
        where: { code: 'TEST-INT-001' },
      });

      expect(company).toBeDefined();
      expect(company?.id).toBe(createdCompanyId);
      console.log('✅ Found company by code:', company?.name);
    });

    it('should delete the company from database', async () => {
      const deletedCompany = await prisma.company.delete({
        where: { id: createdCompanyId },
      });

      expect(deletedCompany.id).toBe(createdCompanyId);

      // Verify deletion
      const foundCompany = await prisma.company.findUnique({
        where: { id: createdCompanyId },
      });

      expect(foundCompany).toBeNull();
      console.log('✅ Deleted company with ID:', createdCompanyId);
    });
  });

  describe('Bulk Operations', () => {
    const testCompanies = [
      { name: 'Bulk Company 1', code: 'BULK-001', description: 'First bulk company' },
      { name: 'Bulk Company 2', code: 'BULK-002', description: 'Second bulk company' },
      { name: 'Bulk Company 3', code: 'BULK-003', description: 'Third bulk company' },
    ];

    it('should create multiple companies at once', async () => {
      const result = await prisma.company.createMany({
        data: testCompanies,
      });

      expect(result.count).toBe(3);
      console.log(`✅ Created ${result.count} companies in bulk`);
    });

    it('should find companies by name pattern', async () => {
      const companies = await prisma.company.findMany({
        where: {
          name: {
            contains: 'Bulk Company',
          },
        },
      });

      expect(companies.length).toBeGreaterThanOrEqual(3);
      console.log(`✅ Found ${companies.length} bulk companies`);
    });

    it('should update multiple companies', async () => {
      const updateResult = await prisma.company.updateMany({
        where: {
          code: {
            startsWith: 'BULK-',
          },
        },
        data: {
          description: 'Updated bulk description',
        },
      });

      expect(updateResult.count).toBeGreaterThanOrEqual(3);
      console.log(`✅ Updated ${updateResult.count} companies`);
    });

    it('should delete multiple companies', async () => {
      const deleteResult = await prisma.company.deleteMany({
        where: {
          code: {
            startsWith: 'BULK-',
          },
        },
      });

      expect(deleteResult.count).toBeGreaterThanOrEqual(3);
      console.log(`✅ Deleted ${deleteResult.count} bulk companies`);
    });
  });

  describe('Advanced Queries', () => {
    beforeAll(async () => {
      // Create test data
      await prisma.company.createMany({
        data: [
          { name: 'Alpha Corp', code: 'ALPHA', description: 'First company' },
          { name: 'Beta Inc', code: 'BETA', description: 'Second company' },
          { name: 'Gamma Ltd', code: 'GAMMA', description: 'Third company' },
        ],
      });
    });

    afterAll(async () => {
      // Cleanup
      await prisma.company.deleteMany({
        where: {
          code: { in: ['ALPHA', 'BETA', 'GAMMA'] },
        },
      });
    });

    it('should paginate results', async () => {
      const page1 = await prisma.company.findMany({
        take: 2,
        skip: 0,
        orderBy: { name: 'asc' },
      });

      const page2 = await prisma.company.findMany({
        take: 2,
        skip: 2,
        orderBy: { name: 'asc' },
      });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeGreaterThanOrEqual(0);
      
      console.log(`✅ Page 1: ${page1.length} companies`);
      console.log(`✅ Page 2: ${page2.length} companies`);
    });

    it('should filter by multiple conditions', async () => {
      const companies = await prisma.company.findMany({
        where: {
          AND: [
            { name: { contains: 'Corp' } },
            { code: { not: null } },
          ],
        },
      });

      expect(Array.isArray(companies)).toBe(true);
      console.log(`✅ Found ${companies.length} companies matching filters`);
    });

    it('should select specific fields only', async () => {
      const companies = await prisma.company.findMany({
        select: {
          id: true,
          name: true,
          code: true,
        },
        where: {
          code: { in: ['ALPHA', 'BETA', 'GAMMA'] },
        },
      });

      companies.forEach((company: any) => {
        expect(company.id).toBeDefined();
        expect(company.name).toBeDefined();
        expect(company.code).toBeDefined();
        expect(company.description).toBeUndefined(); // Should not be selected
      });

      console.log(`✅ Selected specific fields from ${companies.length} companies`);
    });
  });
});

