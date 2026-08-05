import { IBloggerService, BlogComment } from '../domain/bloggerService';
import { UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class ListCommentsUseCase {
  private bloggerService: IBloggerService;

  constructor(bloggerService: IBloggerService) {
    this.bloggerService = bloggerService;
  }

  /**
   * Lists comments for a specific blog post.
   * Access Controls: Super Admins, or any caller associated with the business/blog.
   */
  async execute(
    caller: UserContext,
    blogId: string,
    postId: string,
    limit?: number,
    offset?: number
  ): Promise<BlogComment[]> {
    const isSuperAdmin = caller.isSuperAdmin;
    const isAssociated =
      caller.claims?.o?.includes(blogId) ||
      caller.claims?.m?.includes(blogId) ||
      caller.claims?.s?.includes(blogId) ||
      false;

    if (!isSuperAdmin && !isAssociated) {
      throw new PermissionDeniedError('Permission denied: You must have a role in this business to view comments.');
    }

    const comments = await this.bloggerService.listComments(blogId, postId);

    // Apply pagination in memory if limit/offset are provided
    let paginated = [...comments];
    if (offset !== undefined) {
      paginated = paginated.slice(offset);
    }
    if (limit !== undefined) {
      paginated = paginated.slice(0, limit);
    }

    return paginated;
  }
}
