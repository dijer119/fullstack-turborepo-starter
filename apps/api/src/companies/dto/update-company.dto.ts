import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  code?: string;
}

