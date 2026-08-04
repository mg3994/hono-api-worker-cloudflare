import { IBloggerService, BloggerPostsResponse } from '../domain/bloggerService';
import { UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class ListBlogPostsUseCase {
  private bloggerService: IBloggerService;

  constructor(bloggerService: IBloggerService) {
    this.bloggerService = bloggerService;
  }

  async execute(
    caller: UserContext,
    blogId: string,
    options: {
      accessToken?: string;
      searchQuery?: string;
      status?: string;
      maxResults?: number;
      pageToken?: string;
    }
  ): Promise<BloggerPostsResponse> {
    const isSuperAdmin = caller.isSuperAdmin;
    const isAssociated =
      caller.claims?.o?.includes(blogId) ||
      caller.claims?.m?.includes(blogId) ||
      false;

    if (!isSuperAdmin && !isAssociated) {
      throw new PermissionDeniedError('Permission denied: You can only list Blogger posts for blogs you own or manage.');
    }

    return this.bloggerService.listPosts(blogId, options);
  }
}
