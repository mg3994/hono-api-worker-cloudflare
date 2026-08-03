import { describe, it, expect, vi } from 'vitest';
import { CreateBlogPostUseCase } from '../usecases/createBlogPostUseCase';
import { UpdateBlogPostUseCase } from '../usecases/updateBlogPostUseCase';
import { GetBlogPostUseCase } from '../usecases/getBlogPostUseCase';
import { DeleteBlogPostUseCase } from '../usecases/deleteBlogPostUseCase';
import { CreateSelfBlogUseCase } from '../usecases/createSelfBlogUseCase';
import { IBloggerService, BloggerPost, Blog } from '../domain/bloggerService';
import { UserContext } from '../domain/types';
import { PermissionDeniedError, ValidationError } from '../domain/errors';
import app from '../index';
import { mockEnv } from './testUtils';

describe('Blogger Use Cases Unit Tests', () => {
  const mockBloggerService = (): IBloggerService => ({
    getSelfBlogs: vi.fn(),
    getBlogById: vi.fn(),
    createSelfBlog: vi.fn(),
    listPosts: vi.fn(),
    createPost: vi.fn(),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
    listComments: vi.fn(),
    createComment: vi.fn(),
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

      const result = await useCase.execute(caller, 'biz_123', 'oauth_token', {
        title: 'Title',
        content: 'Content',
        isDraft: false,
      });

      expect(result).toEqual(mockPost);
      expect(service.createPost).toHaveBeenCalledWith('biz_123', 'oauth_token', {
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

      const result = await useCase.execute(caller, 'any_blog', 'oauth_token', {
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
        useCase.execute(caller, 'biz_123', 'oauth_token', {
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

      const result = await useCase.execute(caller, 'biz_123', 'post_abc', 'oauth_token', {
        title: 'New Title',
      });

      expect(result).toEqual(mockPost);
      expect(service.updatePost).toHaveBeenCalledWith('biz_123', 'post_abc', 'oauth_token', {
        title: 'New Title',
        content: '',
        labels: undefined,
        isDraft: undefined,
      });
    });
  });

  describe('CreateSelfBlogUseCase Unit Tests', () => {
    it('should successfully create self blog if caller is Owner or Manager', async () => {
      const service = mockBloggerService();
      const useCase = new CreateSelfBlogUseCase(service);

      const caller: UserContext = {
        uid: 'user_owner',
        email: 'owner@example.com',
        isSuperAdmin: false,
        claims: { o: ['any_biz'], m: [], s: [] },
      };

      const mockBlog: Blog = {
        id: 'blog_123',
        name: 'New Blog Name',
        description: 'New Description',
        url: 'https://newblog.blogspot.com',
        published: '',
        updated: '',
      };
      vi.spyOn(service, 'createSelfBlog').mockResolvedValue(mockBlog);

      const result = await useCase.execute(caller, 'oauth_token', {
        name: 'New Blog Name',
        description: 'New Description',
      });

      expect(result).toEqual(mockBlog);
      expect(service.createSelfBlog).toHaveBeenCalledWith('oauth_token', 'New Blog Name', 'New Description');
    });

    it('should deny standard Business Staff from creating a self-blog', async () => {
      const service = mockBloggerService();
      const useCase = new CreateSelfBlogUseCase(service);

      const caller: UserContext = {
        uid: 'staff',
        email: 'staff@example.com',
        isSuperAdmin: false,
        claims: { o: [], m: [], s: ['any_biz'] }, // only has staff claims
      };

      await expect(
        useCase.execute(caller, 'oauth_token', {
          name: 'Staff Blog',
          description: 'Desc',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });
});

describe('Blogger Hono Routes Integration Tests', () => {
  it('should block POST /api/blogs with 401 Unauthorized if request is unauthenticated', async () => {
    const payload = {
      name: 'New Blog',
      description: 'A new blog description',
    };

    const response = await app.request('/api/blogs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(401);
  });

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
});
