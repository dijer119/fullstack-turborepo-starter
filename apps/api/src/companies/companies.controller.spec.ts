import { Test, TestingModule } from '@nestjs/testing';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

describe('CompaniesController', () => {
  let controller: CompaniesController;
  let service: CompaniesService;

  const mockCompaniesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [
        {
          provide: CompaniesService,
          useValue: mockCompaniesService,
        },
      ],
    }).compile();

    controller = module.get<CompaniesController>(CompaniesController);
    service = module.get<CompaniesService>(CompaniesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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

      mockCompaniesService.create.mockResolvedValue(expectedCompany);

      const result = await controller.create(createCompanyDto);

      expect(result).toEqual(expectedCompany);
      expect(service.create).toHaveBeenCalledWith(createCompanyDto);
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
      ];

      mockCompaniesService.findAll.mockResolvedValue(expectedCompanies);

      const result = await controller.findAll();

      expect(result).toEqual(expectedCompanies);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single company', async () => {
      const expectedCompany = {
        id: 1,
        name: 'Test Company',
        description: 'Test Description',
        code: 'TEST001',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCompaniesService.findOne.mockResolvedValue(expectedCompany);

      const result = await controller.findOne(1);

      expect(result).toEqual(expectedCompany);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('should update a company', async () => {
      const updateCompanyDto = {
        name: 'Updated Company',
      };

      const expectedCompany = {
        id: 1,
        name: 'Updated Company',
        description: 'Test Description',
        code: 'TEST001',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCompaniesService.update.mockResolvedValue(expectedCompany);

      const result = await controller.update(1, updateCompanyDto);

      expect(result).toEqual(expectedCompany);
      expect(service.update).toHaveBeenCalledWith(1, updateCompanyDto);
    });
  });

  describe('remove', () => {
    it('should delete a company', async () => {
      const expectedCompany = {
        id: 1,
        name: 'Test Company',
        description: 'Test Description',
        code: 'TEST001',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCompaniesService.remove.mockResolvedValue(expectedCompany);

      const result = await controller.remove(1);

      expect(result).toEqual(expectedCompany);
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('count', () => {
    it('should return the count of companies', async () => {
      mockCompaniesService.count.mockResolvedValue(5);

      const result = await controller.count();

      expect(result).toBe(5);
      expect(service.count).toHaveBeenCalled();
    });
  });
});

