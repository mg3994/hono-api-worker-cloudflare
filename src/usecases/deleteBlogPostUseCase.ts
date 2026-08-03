import { IBloggerService } from '../domain/bloggerService';
import { UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class DeleteBlogPostUseCase {
  private bloggerService: IBloggerService;

  constructor(bloggerService: IBloggerService) {
    this.bloggerService = bloggerService;
  }

  async execute(caller: UserContext, blogId: string, postId: string, accessToken: string): Promise<void> {
    const isSuperAdmin = caller.isSuperAdmin;
    const isAssociated =
      caller.claims?.o?.includes(blogId) ||
      caller.claims?.m?.includes(blogId) ||
      false;

    if (!isSuperAdmin && !isAssociated) {
      throw new PermissionDeniedError('Permission denied: You can only manage Blogger posts for blogs you own or manage.');
    }

    await this.bloggerService.deletePost(blogId, postId, accessToken);
  }
}
