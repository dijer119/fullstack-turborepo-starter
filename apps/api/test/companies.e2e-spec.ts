import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/persistence/prisma/prisma.service';

describe('Companies (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    prismaService = app.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up companies table before each test
    await prismaService.company.deleteMany({});
  });

  describe('/companies (POST)', () => {
    it('should create a new company', () => {
      return request(app.getHttpServer())
        .post('/companies')
        .send({
          name: 'Test Company',
          description: 'Test Description',
          code: 'TEST001',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('Test Company');
          expect(res.body.description).toBe('Test Description');
          expect(res.body.code).toBe('TEST001');
          expect(res.body).toHaveProperty('createdAt');
          expect(res.body).toHaveProperty('updatedAt');
        });
    });

    it('should fail with invalid name (too short)', () => {
      return request(app.getHttpServer())
        .post('/companies')
        .send({
          name: 'A',
          description: 'Test Description',
        })
        .expect(400);
    });

    it('should create company with only required fields', () => {
      return request(app.getHttpServer())
        .post('/companies')
        .send({
          name: 'Minimal Company',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.name).toBe('Minimal Company');
          expect(res.body.description).toBeNull();
          expect(res.body.code).toBeNull();
        });
    });

    it('should fail without name', () => {
      return request(app.getHttpServer())
        .post('/companies')
        .send({
          description: 'Test Description',
        })
        .expect(400);
    });
  });

  describe('/companies (GET)', () => {
    it('should return empty array when no companies', () => {
      return request(app.getHttpServer())
        .get('/companies')
        .expect(200)
        .expect([]);
    });

    it('should return all companies', async () => {
      // Create test companies
      await prismaService.company.createMany({
        data: [
          { name: 'Company 1', description: 'Desc 1', code: 'C001' },
          { name: 'Company 2', description: 'Desc 2', code: 'C002' },
        ],
      });

      return request(app.getHttpServer())
        .get('/companies')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(2);
          expect(res.body[0]).toHaveProperty('id');
          expect(res.body[0]).toHaveProperty('name');
        });
    });
  });

  describe('/companies/count (GET)', () => {
    it('should return count of companies', async () => {
      await prismaService.company.createMany({
        data: [
          { name: 'Company 1', code: 'C001' },
          { name: 'Company 2', code: 'C002' },
          { name: 'Company 3', code: 'C003' },
        ],
      });

      return request(app.getHttpServer())
        .get('/companies/count')
        .expect(200)
        .expect('3');
    });
  });

  describe('/companies/:id (GET)', () => {
    it('should return a company by id', async () => {
      const company = await prismaService.company.create({
        data: {
          name: 'Test Company',
          description: 'Test Description',
          code: 'TEST001',
        },
      });

      return request(app.getHttpServer())
        .get(`/companies/${company.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(company.id);
          expect(res.body.name).toBe('Test Company');
        });
    });

    it('should return 404 for non-existent company', () => {
      return request(app.getHttpServer()).get('/companies/9999').expect(404);
    });
  });

  describe('/companies/:id (PATCH)', () => {
    it('should update a company', async () => {
      const company = await prismaService.company.create({
        data: {
          name: 'Test Company',
          description: 'Test Description',
          code: 'TEST001',
        },
      });

      return request(app.getHttpServer())
        .patch(`/companies/${company.id}`)
        .send({
          name: 'Updated Company',
          description: 'Updated Description',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(company.id);
          expect(res.body.name).toBe('Updated Company');
          expect(res.body.description).toBe('Updated Description');
          expect(res.body.code).toBe('TEST001');
        });
    });

    it('should update only specified fields', async () => {
      const company = await prismaService.company.create({
        data: {
          name: 'Test Company',
          description: 'Test Description',
          code: 'TEST001',
        },
      });

      return request(app.getHttpServer())
        .patch(`/companies/${company.id}`)
        .send({
          name: 'Only Name Updated',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Only Name Updated');
          expect(res.body.description).toBe('Test Description');
          expect(res.body.code).toBe('TEST001');
        });
    });

    it('should return 404 when updating non-existent company', () => {
      return request(app.getHttpServer())
        .patch('/companies/9999')
        .send({
          name: 'Updated Name',
        })
        .expect(404);
    });
  });

  describe('/companies/:id (DELETE)', () => {
    it('should delete a company', async () => {
      const company = await prismaService.company.create({
        data: {
          name: 'Test Company',
          description: 'Test Description',
          code: 'TEST001',
        },
      });

      await request(app.getHttpServer())
        .delete(`/companies/${company.id}`)
        .expect(204);

      // Verify company is deleted
      const deletedCompany = await prismaService.company.findUnique({
        where: { id: company.id },
      });
      expect(deletedCompany).toBeNull();
    });

    it('should return 404 when deleting non-existent company', () => {
      return request(app.getHttpServer())
        .delete('/companies/9999')
        .expect(404);
    });
  });
});

