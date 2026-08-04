import { IBloggerService, BloggerPost } from '../domain/bloggerService';
import { UpdateBlogPostRequest, UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class UpdateBlogPostUseCase {
  private bloggerService: IBloggerService;

  constructor(bloggerService: IBloggerService) {
    this.bloggerService = bloggerService;
  }

  async execute(
    caller: UserContext,
    blogId: string,
    postId: string,
    accessToken: string,
    request: UpdateBlogPostRequest
  ): Promise<BloggerPost> {
    const isSuperAdmin = caller.isSuperAdmin;
    const isAssociated =
      caller.claims?.o?.includes(blogId) ||
      caller.claims?.m?.includes(blogId) ||
      false;

    if (!isSuperAdmin && !isAssociated) {
      throw new PermissionDeniedError('Permission denied: You can only manage Blogger posts for blogs you own or manage.');
    }

    return this.bloggerService.updatePost(blogId, postId, accessToken, {
      title: request.title || '',
      content: request.content || '',
      labels: request.labels,
      isDraft: request.isDraft,
      publishDate: request.publishDate,
    });
  }
}
