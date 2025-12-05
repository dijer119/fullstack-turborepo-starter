import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from './models/user.model';
import { UsersService } from './users.service';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => [User], { name: 'users', description: '모든 사용자 조회' })
  async findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Query(() => User, { name: 'user', description: 'ID로 사용자 조회' })
  async findOne(@Args('id', { type: () => Int }) id: number): Promise<User> {
    return this.usersService.findOne(id);
  }

  @Query(() => User, {
    name: 'userByEmail',
    nullable: true,
    description: '이메일로 사용자 조회',
  })
  async findByEmail(@Args('email') email: string): Promise<User | null> {
    return this.usersService.findByEmail(email);
  }

  @Query(() => Int, { name: 'usersCount', description: '사용자 수 조회' })
  async count(): Promise<number> {
    return this.usersService.count();
  }

  @Mutation(() => User, { description: '새 사용자 생성' })
  async createUser(@Args('input') input: CreateUserInput): Promise<User> {
    return this.usersService.create(input);
  }

  @Mutation(() => User, { description: '사용자 정보 수정' })
  async updateUser(@Args('input') input: UpdateUserInput): Promise<User> {
    const { id, ...data } = input;
    return this.usersService.update(id, data);
  }

  @Mutation(() => User, { description: '사용자 삭제' })
  async deleteUser(@Args('id', { type: () => Int }) id: number): Promise<User> {
    return this.usersService.remove(id);
  }
}

