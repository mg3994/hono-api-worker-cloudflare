import { IBloggerService, Blog, BloggerPost, BlogComment } from '../domain/bloggerService';

export class BloggerService implements IBloggerService {
  private bloggerApiKey: string;
  private mockBlogs: Blog[] = [];
  private mockPosts: Map<string, BloggerPost[]> = new Map();
  private mockComments: Map<string, BlogComment[]> = new Map();

  constructor(bloggerApiKey: string) {
    this.bloggerApiKey = bloggerApiKey;
    this.initializeMockData();
  }

  private _getHeaders(accessToken?: string): HeadersInit {
    const headers: Record<string, string> = {
      'accept': 'application/json',
    };
    if (accessToken && accessToken.trim() !== '') {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return headers;
  }

  private _getQueryParams(accessToken?: string, extraParams?: Record<string, any>): Record<string, string> {
    const params: Record<string, string> = {};
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        if (value !== undefined && value !== null) {
          params[key] = String(value);
        }
      }
    }
    if (!accessToken || accessToken.trim() === '') {
      params['key'] = this.bloggerApiKey;
    }
    return params;
  }

  private async fetchBlogger<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    accessToken?: string,
    body?: any,
    extraParams?: Record<string, any>
  ): Promise<T | null> {
    const queryParams = this._getQueryParams(accessToken, extraParams);
    const queryString = new URLSearchParams(queryParams).toString();
    const url = `https://www.googleapis.com/blogger/v3${path}${queryString ? '?' + queryString : ''}`;

    try {
      const response = await fetch(url, {
        method,
        headers: this._getHeaders(accessToken),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5000), // 5s timeout safeguard
      });

      if (response.ok) {
        if (method === 'DELETE') return true as any;
        return (await response.json()) as T;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  public async getSelfBlogs(accessToken: string): Promise<Blog[]> {
    const result = await this.fetchBlogger<{ items?: any[] }>(
      '/users/self/blogs',
      'GET',
      accessToken
    );

    if (result && result.items) {
      return result.items.map((item) => this.mapToBlog(item));
    }

    // Fallback mock
    return this.mockBlogs;
  }

  public async createSelfBlog(accessToken: string, name: string, description: string): Promise<Blog> {
    const payload = {
      kind: 'blogger#blog',
      name,
      description,
    };

    const result = await this.fetchBlogger<any>(
      '/users/self/blogs',
      'POST',
      accessToken,
      payload
    );

    if (result) {
      return this.mapToBlog(result);
    }

    // Fallback Mock operations
    const mockBlog: Blog = {
      id: `blog_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      name,
      description,
      url: `https://${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.blogspot.com`,
      published: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    this.mockBlogs.push(mockBlog);
    return mockBlog;
  }

  public async getBlogById(blogId: string, accessToken?: string): Promise<Blog> {
    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}`,
      'GET',
      accessToken
    );

    if (result) {
      return this.mapToBlog(result);
    }

    // Fallback mock
    const match = this.mockBlogs.find((b) => pIdMatch(b.id, blogId));
    if (!match) {
      throw new Error(`Blogger Blog with ID "${blogId}" was not found.`);
    }
    return match;
  }

  public async listPosts(
    blogId: string,
    options?: {
      accessToken?: string;
      searchQuery?: string;
      status?: string;
    }
  ): Promise<BloggerPost[]> {
    const accessToken = options?.accessToken;
    const extraParams: Record<string, any> = {};

    let path = `/blogs/${blogId}/posts`;
    if (options?.searchQuery && options.searchQuery.trim() !== '') {
      path = `/blogs/${blogId}/posts/search`;
      extraParams['q'] = options.searchQuery.trim();
    }
    if (options?.status) {
      extraParams['status'] = options.status;
    }

    const result = await this.fetchBlogger<{ items?: any[] }>(
      path,
      'GET',
      accessToken,
      undefined,
      extraParams
    );

    if (result && result.items) {
      return result.items.map((item) => this.mapToPost(item));
    }

    // Fallback mock check (supports offline and unit testing status and search filters)
    const posts = this.mockPosts.get(blogId) || [];
    let filtered = [...posts];

    if (options?.status) {
      filtered = filtered.filter((p) => p.status.toUpperCase() === options.status?.toUpperCase());
    }

    if (options?.searchQuery && options.searchQuery.trim() !== '') {
      const q = options.searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.labels?.some((l) => l.toLowerCase().includes(q))
      );
    }

    return filtered;
  }

  public async createPost(
    blogId: string,
    accessToken: string,
    options: {
      title: string;
      content: string;
      labels?: string[];
      isDraft?: boolean;
    }
  ): Promise<BloggerPost> {
    const payload: any = {
      kind: 'blogger#post',
      blog: { id: blogId },
      title: options.title,
      content: options.content,
    };
    if (options.labels) {
      payload.labels = options.labels;
    }

    const extraParams = {
      isDraft: String(options.isDraft || false),
    };

    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/posts`,
      'POST',
      accessToken,
      payload,
      extraParams
    );

    if (result) {
      return this.mapToPost(result);
    }

    // Fallback mock save
    const mockPost: BloggerPost = {
      id: `post_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      blog: { id: blogId },
      title: options.title,
      content: options.content,
      status: options.isDraft ? 'DRAFT' : 'LIVE',
      labels: options.labels || [],
      published: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const posts = this.mockPosts.get(blogId) || [];
    posts.push(mockPost);
    this.mockPosts.set(blogId, posts);

    return mockPost;
  }

  public async updatePost(
    blogId: string,
    postId: string,
    accessToken: string,
    options: {
      title: string;
      content: string;
      labels?: string[];
      isDraft?: boolean;
    }
  ): Promise<BloggerPost> {
    const payload: any = {
      id: postId,
      kind: 'blogger#post',
      blog: { id: blogId },
      title: options.title,
      content: options.content,
    };
    if (options.labels) {
      payload.labels = options.labels;
    }

    const extraParams = {
      publish: String(!(options.isDraft || false)),
    };

    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/posts/${postId}`,
      'PUT',
      accessToken,
      payload,
      extraParams
    );

    if (result) {
      return this.mapToPost(result);
    }

    // Fallback mock update
    const posts = this.mockPosts.get(blogId) || [];
    const index = posts.findIndex((p) => p.id === postId);

    const updatedPost: BloggerPost = {
      id: postId,
      blog: { id: blogId },
      title: options.title,
      content: options.content,
      status: options.isDraft ? 'DRAFT' : 'LIVE',
      labels: options.labels || [],
      published: index !== -1 ? posts[index].published : new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    if (index !== -1) {
      posts[index] = updatedPost;
    } else {
      posts.push(updatedPost);
    }
    this.mockPosts.set(blogId, posts);

    return updatedPost;
  }

  public async deletePost(blogId: string, postId: string, accessToken: string): Promise<void> {
    const result = await this.fetchBlogger<boolean>(
      `/blogs/${blogId}/posts/${postId}`,
      'DELETE',
      accessToken
    );

    if (result) return;

    // Fallback mock delete
    const posts = this.mockPosts.get(blogId) || [];
    const filtered = posts.filter((p) => p.id !== postId);
    this.mockPosts.set(blogId, filtered);
  }

  public async listComments(blogId: string, postId: string, accessToken?: string): Promise<BlogComment[]> {
    const result = await this.fetchBlogger<{ items?: any[] }>(
      `/blogs/${blogId}/posts/${postId}/comments`,
      'GET',
      accessToken
    );

    if (result && result.items) {
      return result.items.map((item) => this.mapToComment(item));
    }

    // Fallback mock lookup
    return this.mockComments.get(postId) || [];
  }

  public async createComment(
    blogId: string,
    postId: string,
    accessToken: string,
    content: string
  ): Promise<BlogComment> {
    const payload = {
      content,
    };

    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/posts/${postId}/comments`,
      'POST',
      accessToken,
      payload
    );

    if (result) {
      return this.mapToComment(result);
    }

    // Fallback mock comment creation
    const mockComment: BlogComment = {
      id: `comment_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      post: { id: postId },
      blog: { id: blogId },
      published: new Date().toISOString(),
      updated: new Date().toISOString(),
      content,
      author: {
        displayName: 'Mock Author',
        image: {
          url: 'https://example.com/avatar.png',
        },
      },
    };

    const comments = this.mockComments.get(postId) || [];
    comments.push(mockComment);
    this.mockComments.set(postId, comments);

    return mockComment;
  }

  private mapToBlog(raw: any): Blog {
    return {
      id: raw.id || '',
      name: raw.name || '',
      description: raw.description || '',
      url: raw.url || '',
      published: raw.published || '',
      updated: raw.updated || '',
    };
  }

  private mapToPost(raw: any): BloggerPost {
    return {
      id: raw.id || '',
      blog: { id: raw.blog?.id || '' },
      title: raw.title || '',
      content: raw.content || '',
      status: raw.status === 'DRAFT' ? 'DRAFT' : raw.status === 'SCHEDULED' ? 'SCHEDULED' : 'LIVE',
      labels: raw.labels || [],
      published: raw.published,
      updated: raw.updated,
    };
  }

  private mapToComment(raw: any): BlogComment {
    return {
      id: raw.id || '',
      post: { id: raw.post?.id || '' },
      blog: { id: raw.blog?.id || '' },
      published: raw.published || '',
      updated: raw.updated || '',
      content: raw.content || '',
      author: {
        displayName: raw.author?.displayName || 'Unknown Author',
        image: {
          url: raw.author?.image?.url || 'https://example.com/avatar.png',
        },
      },
    };
  }

  private initializeMockData() {
    const blogId = 'mock-blog-id';
    this.mockBlogs.push({
      id: blogId,
      name: 'Gautam Retail Store Blog',
      description: 'Official catalogue blog for Gautam Trade Store items.',
      url: 'https://gautamretail.blogspot.com',
      published: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    this.mockPosts.set(blogId, [
      {
        id: 'post_1',
        blog: { id: blogId },
        title: 'Product Launch: Wireless Mouse',
        content: `
          <div class="product-post">
            <h2>Standard Wireless Mouse</h2>
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "sku": "PROD-001",
              "name": "Standard Wireless Mouse",
              "offers": {
                "@type": "Offer",
                "price": "500.00",
                "availability": "https://schema.org/InStock"
              }
            }
            </script>
          </div>
        `,
        status: 'LIVE',
        labels: ['electronics', 'mouse', 'gadget'],
        published: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      {
        id: 'post_2',
        blog: { id: blogId },
        title: 'Bulk Industrial Brooms Offer',
        content: `
          <div class="bulk-offer">
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "sku": "PROD-100",
              "name": "Bulk Industrial Brooms",
              "offers": {
                "@type": "Offer",
                "price": "500.00",
                "availability": "https://schema.org/OutOfStock"
              }
            }
            </script>
          </div>
        `,
        status: 'LIVE',
        labels: ['cleaning', 'bulk', 'brooms'],
        published: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    ]);

    this.mockComments.set('post_1', [
      {
        id: 'comment_1',
        post: { id: 'post_1' },
        blog: { id: blogId },
        published: new Date().toISOString(),
        updated: new Date().toISOString(),
        content: 'I love this wireless mouse!',
        author: {
          displayName: 'Umesh Sharma',
          image: {
            url: 'https://example.com/avatar.png',
          },
        },
      },
    ]);
  }
}

function pIdMatch(id1: string, id2: string): boolean {
  return id1.trim().toLowerCase() === id2.trim().toLowerCase();
}
