import { IBloggerService, BloggerPost } from '../domain/bloggerService';
import { CreateBlogPostRequest, UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class CreateBlogPostUseCase {
  private bloggerService: IBloggerService;

  constructor(bloggerService: IBloggerService) {
    this.bloggerService = bloggerService;
  }

  async execute(caller: UserContext, blogId: string, request: CreateBlogPostRequest): Promise<BloggerPost> {
    const isSuperAdmin = caller.isSuperAdmin;
    const isAssociated =
      caller.claims?.o?.includes(blogId) ||
      caller.claims?.m?.includes(blogId) ||
      false;

    if (!isSuperAdmin && !isAssociated) {
      throw new PermissionDeniedError('Permission denied: You can only manage Blogger posts for blogs you own or manage.');
    }

    return this.bloggerService.createPost(blogId, request.title, request.content, request.isDraft);
  }
}
