import { describe, it, expect, vi } from 'vitest';
import { CreateBlogPostUseCase } from '../usecases/createBlogPostUseCase';
import { UpdateBlogPostUseCase } from '../usecases/updateBlogPostUseCase';
import { GetBlogPostUseCase } from '../usecases/getBlogPostUseCase';
import { DeleteBlogPostUseCase } from '../usecases/deleteBlogPostUseCase';
import { IBloggerService, BloggerPost } from '../domain/bloggerService';
import { UserContext } from '../domain/types';
import { PermissionDeniedError, ValidationError } from '../domain/errors';
import app from '../index';
import { mockEnv } from './testUtils';

describe('Blogger Use Cases Unit Tests', () => {
  const mockBloggerService = (): IBloggerService => ({
    createPost: vi.fn(),
    updatePost: vi.fn(),
    getPost: vi.fn(),
    deletePost: vi.fn(),
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
      expect(service.createPost).toHaveBeenCalledWith('biz_123', 'Title', 'Content', false);
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
      expect(service.updatePost).toHaveBeenCalledWith('biz_123', 'post_abc', 'New Title', undefined, undefined);
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
      expect(service.deletePost).toHaveBeenCalledWith('biz_123', 'post_abc');
    });
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
});
