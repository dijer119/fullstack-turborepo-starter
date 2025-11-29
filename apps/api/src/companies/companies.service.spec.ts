import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../persistence/prisma/prisma.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    company: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new company', async () => {
      const createCompanyDto = {
        name: 'Test Company',
        description: 'Test Description',
        code: 'TEST001',
      };

      const expectedCompany = {
        id: 1,
        ...createCompanyDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.company.create.mockResolvedValue(expectedCompany);

      const result = await service.create(createCompanyDto);

      expect(result).toEqual(expectedCompany);
      expect(mockPrismaService.company.create).toHaveBeenCalledWith({
        data: createCompanyDto,
      });
    });
  });

  describe('findAll', () => {
    it('should return an array of companies', async () => {
      const expectedCompanies = [
        {
          id: 1,
          name: 'Company 1',
          description: 'Description 1',
          code: 'C001',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          name: 'Company 2',
          description: 'Description 2',
          code: 'C002',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.company.findMany.mockResolvedValue(expectedCompanies);

      const result = await service.findAll();

      expect(result).toEqual(expectedCompanies);
      expect(mockPrismaService.company.findMany).toHaveBeenCalledWith({
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return a company by id', async () => {
      const expectedCompany = {
        id: 1,
        name: 'Test Company',
        description: 'Test Description',
        code: 'TEST001',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.company.findUnique.mockResolvedValue(expectedCompany);

      const result = await service.findOne(1);

      expect(result).toEqual(expectedCompany);
      expect(mockPrismaService.company.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw NotFoundException if company not found', async () => {
      mockPrismaService.company.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow(
        'Company with ID 999 not found',
      );
    });
  });

  describe('findByCode', () => {
    it('should return a company by code', async () => {
      const expectedCompany = {
        id: 1,
        name: 'Test Company',
        description: 'Test Description',
        code: 'TEST001',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.company.findFirst.mockResolvedValue(expectedCompany);

      const result = await service.findByCode('TEST001');

      expect(result).toEqual(expectedCompany);
      expect(mockPrismaService.company.findFirst).toHaveBeenCalledWith({
        where: { code: 'TEST001' },
      });
    });

    it('should return null if company not found', async () => {
      mockPrismaService.company.findFirst.mockResolvedValue(null);

      const result = await service.findByCode('NOTFOUND');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a company', async () => {
      const updateCompanyDto = {
        name: 'Updated Company',
      };

      const existingCompany = {
        id: 1,
        name: 'Test Company',
        description: 'Test Description',
        code: 'TEST001',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedCompany = {
        ...existingCompany,
        ...updateCompanyDto,
        updatedAt: new Date(),
      };

      mockPrismaService.company.findUnique.mockResolvedValue(existingCompany);
      mockPrismaService.company.update.mockResolvedValue(updatedCompany);

      const result = await service.update(1, updateCompanyDto);

      expect(result).toEqual(updatedCompany);
      expect(mockPrismaService.company.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updateCompanyDto,
      });
    });

    it('should throw NotFoundException if company not found', async () => {
      mockPrismaService.company.findUnique.mockResolvedValue(null);

      await expect(
        service.update(999, { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a company', async () => {
      const existingCompany = {
        id: 1,
        name: 'Test Company',
        description: 'Test Description',
        code: 'TEST001',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.company.findUnique.mockResolvedValue(existingCompany);
      mockPrismaService.company.delete.mockResolvedValue(existingCompany);

      const result = await service.remove(1);

      expect(result).toEqual(existingCompany);
      expect(mockPrismaService.company.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw NotFoundException if company not found', async () => {
      mockPrismaService.company.findUnique.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('count', () => {
    it('should return the count of companies', async () => {
      mockPrismaService.company.count.mockResolvedValue(10);

      const result = await service.count();

      expect(result).toBe(10);
      expect(mockPrismaService.company.count).toHaveBeenCalled();
    });
  });
});

