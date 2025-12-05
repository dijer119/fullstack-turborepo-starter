import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
  @Query(() => String, { description: 'Health check query' })
  health(): string {
    return 'OK';
  }

  @Query(() => String, { description: 'Returns server version' })
  version(): string {
    return '1.0.0';
  }
}

