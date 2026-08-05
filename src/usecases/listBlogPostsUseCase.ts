import { IBloggerService, BloggerPost } from '../domain/bloggerService';
import { UserContext } from '../domain/types';

export class ListBlogPostsUseCase {
  private bloggerService: IBloggerService;

  constructor(bloggerService: IBloggerService) {
    this.bloggerService = bloggerService;
  }

  public async execute(
    caller: UserContext,
    blogId: string,
    options?: {
      searchQuery?: string;
      status?: string;
    }
  ): Promise<BloggerPost[]> {
    if (!blogId) {
      throw new Error('Blog ID is required.');
    }
    return this.bloggerService.listPosts(blogId, {
      searchQuery: options?.searchQuery,
      status: options?.status,
    });
  }
}
