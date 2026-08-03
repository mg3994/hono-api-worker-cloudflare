import { IBloggerService, Blog } from '../domain/bloggerService';
import { CreateBlogRequest, UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class CreateSelfBlogUseCase {
  private bloggerService: IBloggerService;

  constructor(bloggerService: IBloggerService) {
    this.bloggerService = bloggerService;
  }

  async execute(caller: UserContext, accessToken: string, request: CreateBlogRequest): Promise<Blog> {
    const isSuperAdmin = caller.isSuperAdmin;
    const isOwner = (caller.claims?.o && caller.claims.o.length > 0) || false;
    const isManager = (caller.claims?.m && caller.claims.m.length > 0) || false;

    if (!isSuperAdmin && !isOwner && !isManager) {
      throw new PermissionDeniedError(
        'Permission denied: Only Super Admins, Business Owners, or Managers are authorized to create a self blog.'
      );
    }

    return this.bloggerService.createSelfBlog(accessToken, request.name, request.description);
  }
}
