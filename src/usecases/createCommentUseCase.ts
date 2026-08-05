import { IBloggerService, BlogComment } from '../domain/bloggerService';
import { CreateBlogCommentRequest, UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class CreateCommentUseCase {
  private bloggerService: IBloggerService;

  constructor(bloggerService: IBloggerService) {
    this.bloggerService = bloggerService;
  }

  /**
   * Submits a new comment to a blog post.
   * Access Controls: Super Admins, or Owners/Managers of the business/blog.
   */
  async execute(
    caller: UserContext,
    blogId: string,
    postId: string,
    request: CreateBlogCommentRequest,
    accessToken?: string
  ): Promise<BlogComment> {
    const isSuperAdmin = caller.isSuperAdmin;
    const isOwnerOrManager =
      caller.claims?.o?.includes(blogId) ||
      caller.claims?.m?.includes(blogId) ||
      false;

    if (!isSuperAdmin && !isOwnerOrManager) {
      throw new PermissionDeniedError('Permission denied: Only Super Admins, Owners, or Managers can post comments.');
    }

    return this.bloggerService.createComment(blogId, postId, accessToken || '', request.content);
  }
}
