import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    return this.prisma.company.create({
      data: createCompanyDto,
    });
  }

  async findAll(): Promise<Company[]> {
    return this.prisma.company.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number): Promise<Company> {
    const company = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }

    return company;
  }

  async findByCode(code: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: { code },
    });
  }

  async update(id: number, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    await this.findOne(id); // Check if company exists

    return this.prisma.company.update({
      where: { id },
      data: updateCompanyDto,
    });
  }

  async remove(id: number): Promise<Company> {
    await this.findOne(id); // Check if company exists

    return this.prisma.company.delete({
      where: { id },
    });
  }

  async count(): Promise<number> {
    return this.prisma.company.count();
  }
}

