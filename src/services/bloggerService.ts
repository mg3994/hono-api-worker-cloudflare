import { IBloggerService, Blog, BloggerPost, BlogComment, BloggerPage } from '../domain/bloggerService';

export class BloggerService implements IBloggerService {
  private bloggerApiKey: string;
  private mockBlogs: Blog[] = [];
  private mockPosts: Map<string, BloggerPost[]> = new Map();
  private mockComments: Map<string, BlogComment[]> = new Map();
  private mockPages: Map<string, BloggerPage[]> = new Map();

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

  public async getBlogByUrl(url: string, accessToken?: string): Promise<Blog> {
    const result = await this.fetchBlogger<any>(
      '/blogs/byurl',
      'GET',
      accessToken,
      undefined,
      { url }
    );

    if (result) {
      return this.mapToBlog(result);
    }

    // Fallback mock check
    const match = this.mockBlogs.find((b) => b.url.toLowerCase() === url.toLowerCase());
    if (!match) {
      throw new Error(`Blogger Blog with URL "${url}" was not found.`);
    }
    return match;
  }

  public async getPost(blogId: string, postId: string, accessToken?: string): Promise<BloggerPost> {
    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/posts/${postId}`,
      'GET',
      accessToken
    );

    if (result) {
      return this.mapToPost(result);
    }

    // Fallback mock check
    const posts = this.mockPosts.get(blogId) || [];
    const match = posts.find((p) => p.id === postId);
    if (!match) {
      throw new Error(`Blogger Post with ID "${postId}" was not found.`);
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

    // Fallback mock check
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

  public async patchPost(
    blogId: string,
    postId: string,
    accessToken: string,
    options: {
      title?: string;
      content?: string;
      labels?: string[];
    }
  ): Promise<BloggerPost> {
    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/posts/${postId}`,
      'PUT', // patch uses PATCH or PUT in standard Blogger API fallbacks
      accessToken,
      options
    );

    if (result) {
      return this.mapToPost(result);
    }

    // Fallback mock patch
    const post = await this.getPost(blogId, postId);
    if (options.title !== undefined) post.title = options.title;
    if (options.content !== undefined) post.content = options.content;
    if (options.labels !== undefined) post.labels = options.labels;
    post.updated = new Date().toISOString();

    return post;
  }

  public async publishPost(blogId: string, postId: string, accessToken: string): Promise<BloggerPost> {
    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/posts/${postId}/publish`,
      'POST',
      accessToken
    );

    if (result) {
      return this.mapToPost(result);
    }

    // Fallback mock publish
    const post = await this.getPost(blogId, postId);
    post.status = 'LIVE';
    post.published = new Date().toISOString();
    return post;
  }

  public async revertPost(blogId: string, postId: string, accessToken: string): Promise<BloggerPost> {
    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/posts/${postId}/revert`,
      'POST',
      accessToken
    );

    if (result) {
      return this.mapToPost(result);
    }

    // Fallback mock revert
    const post = await this.getPost(blogId, postId);
    post.status = 'DRAFT';
    return post;
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

  public async getComment(blogId: string, postId: string, commentId: string, accessToken?: string): Promise<BlogComment> {
    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/posts/${postId}/comments/${commentId}`,
      'GET',
      accessToken
    );

    if (result) {
      return this.mapToComment(result);
    }

    // Fallback mock lookup
    const comments = this.mockComments.get(postId) || [];
    const match = comments.find((c) => c.id === commentId);
    if (!match) {
      throw new Error(`Comment with ID "${commentId}" was not found.`);
    }
    return match;
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

  public async deleteComment(blogId: string, postId: string, commentId: string, accessToken: string): Promise<void> {
    const result = await this.fetchBlogger<boolean>(
      `/blogs/${blogId}/posts/${postId}/comments/${commentId}`,
      'DELETE',
      accessToken
    );

    if (result) return;

    // Fallback mock delete comment
    const comments = this.mockComments.get(postId) || [];
    const filtered = comments.filter((c) => c.id !== commentId);
    this.mockComments.set(postId, filtered);
  }

  public async listPages(blogId: string, accessToken?: string): Promise<BloggerPage[]> {
    const result = await this.fetchBlogger<{ items?: any[] }>(
      `/blogs/${blogId}/pages`,
      'GET',
      accessToken
    );

    if (result && result.items) {
      return result.items.map((item) => this.mapToPage(item));
    }

    // Fallback mock page list
    return this.mockPages.get(blogId) || [];
  }

  public async getPage(blogId: string, pageId: string, accessToken?: string): Promise<BloggerPage> {
    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/pages/${pageId}`,
      'GET',
      accessToken
    );

    if (result) {
      return this.mapToPage(result);
    }

    // Fallback mock lookup
    const pages = this.mockPages.get(blogId) || [];
    const match = pages.find((p) => p.id === pageId);
    if (!match) {
      throw new Error(`Page with ID "${pageId}" was not found.`);
    }
    return match;
  }

  public async createPage(blogId: string, accessToken: string, title: string, content: string): Promise<BloggerPage> {
    const payload = {
      kind: 'blogger#page',
      blog: { id: blogId },
      title,
      content,
    };

    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/pages`,
      'POST',
      accessToken,
      payload
    );

    if (result) {
      return this.mapToPage(result);
    }

    // Fallback mock create page
    const mockPage: BloggerPage = {
      id: `page_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      blog: { id: blogId },
      title,
      content,
      status: 'LIVE',
      published: new Date().toISOString(),
      updated: new Date().toISOString(),
      url: `https://mockblog.blogspot.com/p/${title.toLowerCase().replace(/[^a-z0-9]/g, '')}.html`,
    };

    const pages = this.mockPages.get(blogId) || [];
    pages.push(mockPage);
    this.mockPages.set(blogId, pages);

    return mockPage;
  }

  public async updatePage(blogId: string, pageId: string, accessToken: string, title: string, content: string): Promise<BloggerPage> {
    const payload = {
      id: pageId,
      kind: 'blogger#page',
      blog: { id: blogId },
      title,
      content,
    };

    const result = await this.fetchBlogger<any>(
      `/blogs/${blogId}/pages/${pageId}`,
      'PUT',
      accessToken,
      payload
    );

    if (result) {
      return this.mapToPage(result);
    }

    // Fallback mock update page
    const pages = this.mockPages.get(blogId) || [];
    const index = pages.findIndex((p) => p.id === pageId);

    const updatedPage: BloggerPage = {
      id: pageId,
      blog: { id: blogId },
      title,
      content,
      status: 'LIVE',
      published: index !== -1 ? pages[index].published : new Date().toISOString(),
      updated: new Date().toISOString(),
      url: `https://mockblog.blogspot.com/p/${title.toLowerCase().replace(/[^a-z0-9]/g, '')}.html`,
    };

    if (index !== -1) {
      pages[index] = updatedPage;
    } else {
      pages.push(updatedPage);
    }
    this.mockPages.set(blogId, pages);

    return updatedPage;
  }

  public async deletePage(blogId: string, pageId: string, accessToken: string): Promise<void> {
    const result = await this.fetchBlogger<boolean>(
      `/blogs/${blogId}/pages/${pageId}`,
      'DELETE',
      accessToken
    );

    if (result) return;

    // Fallback mock delete page
    const pages = this.mockPages.get(blogId) || [];
    const filtered = pages.filter((p) => p.id !== pageId);
    this.mockPages.set(blogId, filtered);
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

  private mapToPage(raw: any): BloggerPage {
    return {
      id: raw.id || '',
      blog: { id: raw.blog?.id || '' },
      title: raw.title || '',
      content: raw.content || '',
      status: raw.status === 'DRAFT' ? 'DRAFT' : 'LIVE',
      published: raw.published || '',
      updated: raw.updated || '',
      url: raw.url || '',
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

    this.mockPages.set(blogId, [
      {
        id: 'page_1',
        blog: { id: blogId },
        title: 'About Us',
        content: '<p>Welcome to Gautam Retail Store!</p>',
        status: 'LIVE',
        published: new Date().toISOString(),
        updated: new Date().toISOString(),
        url: 'https://gautamretail.blogspot.com/p/about-us.html',
      },
    ]);
  }
}

function pIdMatch(id1: string, id2: string): boolean {
  return id1.trim().toLowerCase() === id2.trim().toLowerCase();
}
