import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTodoDto {
  @ApiPropertyOptional({
    description: 'The title of the todo',
    example: 'Buy milk',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'The completion status of the todo',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  completed?: boolean;
}
