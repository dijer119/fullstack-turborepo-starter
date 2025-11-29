import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/persistence/prisma/prisma.service';

describe('Users (e2e)', () => {
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
    // Clean up users table before each test
    await prismaService.user.deleteMany({});
  });

  describe('/users (POST)', () => {
    it('should create a new user', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({
          email: 'test@example.com',
          name: 'Test User',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.email).toBe('test@example.com');
          expect(res.body.name).toBe('Test User');
          expect(res.body).toHaveProperty('createdAt');
          expect(res.body).toHaveProperty('updatedAt');
        });
    });

    it('should fail with invalid email', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({
          email: 'invalid-email',
          name: 'Test User',
        })
        .expect(400);
    });

    it('should create user without name', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({
          email: 'test2@example.com',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.email).toBe('test2@example.com');
          expect(res.body.name).toBeNull();
        });
    });
  });

  describe('/users (GET)', () => {
    it('should return empty array when no users', () => {
      return request(app.getHttpServer())
        .get('/users')
        .expect(200)
        .expect([]);
    });

    it('should return all users', async () => {
      // Create test users
      await prismaService.user.createMany({
        data: [
          { email: 'user1@example.com', name: 'User 1' },
          { email: 'user2@example.com', name: 'User 2' },
        ],
      });

      return request(app.getHttpServer())
        .get('/users')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(2);
          expect(res.body[0]).toHaveProperty('id');
          expect(res.body[0]).toHaveProperty('email');
        });
    });
  });

  describe('/users/count (GET)', () => {
    it('should return count of users', async () => {
      await prismaService.user.createMany({
        data: [
          { email: 'user1@example.com', name: 'User 1' },
          { email: 'user2@example.com', name: 'User 2' },
          { email: 'user3@example.com', name: 'User 3' },
        ],
      });

      return request(app.getHttpServer())
        .get('/users/count')
        .expect(200)
        .expect('3');
    });
  });

  describe('/users/:id (GET)', () => {
    it('should return a user by id', async () => {
      const user = await prismaService.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      return request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(user.id);
          expect(res.body.email).toBe('test@example.com');
        });
    });

    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer()).get('/users/9999').expect(404);
    });
  });

  describe('/users/:id (PATCH)', () => {
    it('should update a user', async () => {
      const user = await prismaService.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      return request(app.getHttpServer())
        .patch(`/users/${user.id}`)
        .send({
          name: 'Updated Name',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(user.id);
          expect(res.body.name).toBe('Updated Name');
          expect(res.body.email).toBe('test@example.com');
        });
    });

    it('should return 404 when updating non-existent user', () => {
      return request(app.getHttpServer())
        .patch('/users/9999')
        .send({
          name: 'Updated Name',
        })
        .expect(404);
    });
  });

  describe('/users/:id (DELETE)', () => {
    it('should delete a user', async () => {
      const user = await prismaService.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      await request(app.getHttpServer())
        .delete(`/users/${user.id}`)
        .expect(204);

      // Verify user is deleted
      const deletedUser = await prismaService.user.findUnique({
        where: { id: user.id },
      });
      expect(deletedUser).toBeNull();
    });

    it('should return 404 when deleting non-existent user', () => {
      return request(app.getHttpServer()).delete('/users/9999').expect(404);
    });
  });
});

