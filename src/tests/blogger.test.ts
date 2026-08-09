import { describe, it, expect, vi } from 'vitest';
import { CreateBlogPostUseCase } from '../usecases/createBlogPostUseCase';
import { UpdateBlogPostUseCase } from '../usecases/updateBlogPostUseCase';
import { GetBlogPostUseCase } from '../usecases/getBlogPostUseCase';
import { DeleteBlogPostUseCase } from '../usecases/deleteBlogPostUseCase';
import { IBloggerService, BloggerPost } from '../domain/bloggerService';
import { BloggerService } from '../services/bloggerService';
import { UserContext } from '../domain/types';
import { PermissionDeniedError, ValidationError } from '../domain/errors';
import app from '../index';
import { mockEnv } from './testUtils';

describe('Blogger Use Cases Unit Tests', () => {
  const mockBloggerService = (): any => ({
    getSelfBlogs: vi.fn(),
    getBlogById: vi.fn(),
    getBlogByUrl: vi.fn(),
    createSelfBlog: vi.fn(),
    listPosts: vi.fn(),
    createPost: vi.fn(),
    updatePost: vi.fn(),
    patchPost: vi.fn(),
    publishPost: vi.fn(),
    revertPost: vi.fn(),
    deletePost: vi.fn(),
    listComments: vi.fn(),
    getComment: vi.fn(),
    createComment: vi.fn(),
    deleteComment: vi.fn(),
    listPages: vi.fn(),
    getPage: vi.fn(),
    createPage: vi.fn(),
    updatePage: vi.fn(),
    deletePage: vi.fn(),
  });

  describe('CreateBlogPostUseCase', () => {
    it('should successfully create a blog post if caller owns or manages the blogId', async () => {
      const service = mockBloggerService();
      const useCase = new CreateBlogPostUseCase(service);

      const caller: UserContext = {
        uid: 'user_owner',
        email: 'owner@example.com',
        isSuperAdmin: false,
        claims: { o: ['biz_123'], m: [], s: [] },
      };

      const mockPost: BloggerPost = {
        id: 'post_abc',
        blog: { id: 'biz_123' },
        title: 'Title',
        content: 'Content',
        status: 'LIVE',
      };
      vi.spyOn(service, 'createPost').mockResolvedValue(mockPost);

      const result = await useCase.execute(caller, 'biz_123', {
        title: 'Title',
        content: 'Content',
        isDraft: false,
      });

      expect(result).toEqual(mockPost);
      expect(service.createPost).toHaveBeenCalledWith('biz_123', '', {
        title: 'Title',
        content: 'Content',
        labels: undefined,
        isDraft: false,
      });
    });

    it('should allow Super Admin to create a blog post under any blogId', async () => {
      const service = mockBloggerService();
      const useCase = new CreateBlogPostUseCase(service);

      const caller: UserContext = {
        uid: 'admin_1',
        email: 'admin@test.com',
        isSuperAdmin: true,
        claims: { o: [], m: [], s: [] },
      };

      const mockPost: BloggerPost = {
        id: 'post_abc',
        blog: { id: 'any_blog' },
        title: 'Admin Title',
        content: 'Content',
        status: 'DRAFT',
      };
      vi.spyOn(service, 'createPost').mockResolvedValue(mockPost);

      const result = await useCase.execute(caller, 'any_blog', {
        title: 'Admin Title',
        content: 'Content',
        isDraft: true,
      });

      expect(result).toEqual(mockPost);
    });

    it('should block non-associated owners or managers with PermissionDeniedError', async () => {
      const service = mockBloggerService();
      const useCase = new CreateBlogPostUseCase(service);

      const caller: UserContext = {
        uid: 'user_intruder',
        email: 'intruder@example.com',
        isSuperAdmin: false,
        claims: { o: ['another_biz'], m: [], s: [] }, // does not own biz_123
      };

      await expect(
        useCase.execute(caller, 'biz_123', {
          title: 'Title',
          content: 'Content',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('UpdateBlogPostUseCase', () => {
    it('should allow associated manager to update a blog post', async () => {
      const service = mockBloggerService();
      const useCase = new UpdateBlogPostUseCase(service);

      const caller: UserContext = {
        uid: 'user_manager',
        email: 'manager@example.com',
        isSuperAdmin: false,
        claims: { o: [], m: ['biz_123'], s: [] },
      };

      const mockPost: BloggerPost = {
        id: 'post_abc',
        blog: { id: 'biz_123' },
        title: 'New Title',
        content: 'Content',
        status: 'LIVE',
      };
      vi.spyOn(service, 'updatePost').mockResolvedValue(mockPost);

      const result = await useCase.execute(caller, 'biz_123', 'post_abc', {
        title: 'New Title',
      });

      expect(result).toEqual(mockPost);
      expect(service.updatePost).toHaveBeenCalledWith('biz_123', 'post_abc', '', {
        title: 'New Title',
        content: '',
        labels: undefined,
        isDraft: undefined,
      });
    });
  });

  describe('GetBlogPostUseCase & DeleteBlogPostUseCase', () => {
    it('should assert associated manager can delete a blog post', async () => {
      const service = mockBloggerService();
      const useCase = new DeleteBlogPostUseCase(service);

      const caller: UserContext = {
        uid: 'user_manager',
        email: 'manager@example.com',
        isSuperAdmin: false,
        claims: { o: [], m: ['biz_123'], s: [] },
      };

      vi.spyOn(service, 'deletePost').mockResolvedValue();

      await useCase.execute(caller, 'biz_123', 'post_abc');
      expect(service.deletePost).toHaveBeenCalledWith('biz_123', 'post_abc', '');
    });
  });
});

describe('BloggerService Concrete Class Unit Tests', () => {
    it('should support full Blogger v3 operations through the fallback mock store', async () => {
      const service = new BloggerService('mock_api_key');

      // 1. Blogs
      const blog = await service.getBlogById('mock-blog-id');
      expect(blog.name).toBe('Gautam Retail Store Blog');

      const selfBlogs = await service.getSelfBlogs('token');
      expect(selfBlogs.length).toBeGreaterThan(0);

      const blogByUrl = await service.getBlogByUrl('https://gautamretail.blogspot.com');
      expect(blogByUrl.id).toBe('mock-blog-id');

      // 2. Posts
      const post = await service.createPost('mock-blog-id', 'token', {
        title: 'Fresh Bread Offer',
        content: 'Yummy and soft bread',
        isDraft: false,
      });
      expect(post.title).toBe('Fresh Bread Offer');
      expect(post.status).toBe('LIVE');

      const patchedPost = await service.patchPost('mock-blog-id', post.id, 'token', {
        title: 'Super Fresh Bread Offer',
      });
      expect(patchedPost.title).toBe('Super Fresh Bread Offer');

      const revertedPost = await service.revertPost('mock-blog-id', post.id, 'token');
      expect(revertedPost.status).toBe('DRAFT');

      const publishedPost = await service.publishPost('mock-blog-id', post.id, 'token');
      expect(publishedPost.status).toBe('LIVE');

      // 3. Comments
      const comments = await service.listComments('mock-blog-id', 'post_1');
      expect(comments.length).toBeGreaterThan(0);

      const createdComment = await service.createComment('mock-blog-id', 'post_1', 'token', 'Tastes good!');
      expect(createdComment.content).toBe('Tastes good!');

      const commentMatch = await service.getComment('mock-blog-id', 'post_1', createdComment.id);
      expect(commentMatch.content).toBe('Tastes good!');

      // 4. Pages
      const pages = await service.listPages('mock-blog-id');
      expect(pages.length).toBe(1);

      const page = await service.createPage('mock-blog-id', 'token', 'Contact Us', '<p>Call us at 123</p>');
      expect(page.title).toBe('Contact Us');

      const updatedPage = await service.updatePage('mock-blog-id', page.id, 'token', 'Contact Us Today', '<p>Call us at 123-456</p>');
      expect(updatedPage.title).toBe('Contact Us Today');

      const fetchedPage = await service.getPage('mock-blog-id', page.id);
      expect(fetchedPage.title).toBe('Contact Us Today');

      await service.deletePage('mock-blog-id', page.id, 'token');
      const pagesAfterDelete = await service.listPages('mock-blog-id');
      expect(pagesAfterDelete.length).toBe(1);
    });
});

describe('Blogger Hono Routes Integration Tests', () => {
  it('should block POST /api/blogs/:blogId/posts with 401 Unauthorized if request is unauthenticated', async () => {
    const payload = {
      title: 'Title',
      content: 'Content',
    };

    const response = await app.request('/api/blogs/biz_123/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(401);
  });

  it('should block PUT /api/blogs/:blogId/posts/:postId with 401 Unauthorized if request is unauthenticated', async () => {
    const payload = {
      title: 'New Title',
    };

    const response = await app.request('/api/blogs/biz_123/posts/post_abc', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(401);
  });

  it('should block GET /api/blogs/:blogId/posts/:postId with 401 Unauthorized if request is unauthenticated', async () => {
    const response = await app.request('/api/blogs/biz_123/posts/post_abc', undefined, mockEnv);
    expect(response.status).toBe(401);
  });

  it('should block DELETE /api/blogs/:blogId/posts/:postId with 401 Unauthorized if request is unauthenticated', async () => {
    const response = await app.request('/api/blogs/biz_123/posts/post_abc', {
      method: 'DELETE',
    }, mockEnv);
    expect(response.status).toBe(401);
  });

  it('should block GET /api/blogs/:blogId/posts/:postId/comments with 401 Unauthorized if request is unauthenticated', async () => {
    const response = await app.request('/api/blogs/biz_123/posts/post_abc/comments', undefined, mockEnv);
    expect(response.status).toBe(401);
  });

  it('should block POST /api/blogs/:blogId/posts/:postId/comments with 401 Unauthorized if request is unauthenticated', async () => {
    const payload = {
      content: 'This is an unauthorized comment',
    };
    const response = await app.request('/api/blogs/biz_123/posts/post_abc/comments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);
    expect(response.status).toBe(401);
  });
});
