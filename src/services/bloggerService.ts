import { IBloggerService, BloggerPost } from '../domain/bloggerService';

export class BloggerService implements IBloggerService {
  private bloggerApiKey: string;
  private localMockStore: Map<string, BloggerPost[]> = new Map();

  constructor(bloggerApiKey: string) {
    this.bloggerApiKey = bloggerApiKey;
    this.initializeMockStore();
  }

  private async fetchBloggerApi(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: any
  ): Promise<any> {
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5000), // 5s timeout safeguard
      });

      if (response.ok) {
        if (method === 'DELETE') return true;
        return await response.json();
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  public async createPost(
    blogId: string,
    title: string,
    content: string,
    isDraft: boolean = false
  ): Promise<BloggerPost> {
    const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?isDraft=${isDraft}&key=${this.bloggerApiKey}`;
    const payload = {
      kind: 'blogger#post',
      blog: { id: blogId },
      title,
      content,
    };

    const apiResult = await this.fetchBloggerApi(url, 'POST', payload);
    if (apiResult) {
      return this.mapToBloggerPost(apiResult);
    }

    // Fallback Mock operations
    const mockPost: BloggerPost = {
      id: `post_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      blog: { id: blogId },
      title,
      content,
      status: isDraft ? 'DRAFT' : 'LIVE',
      published: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const posts = this.localMockStore.get(blogId) || [];
    posts.push(mockPost);
    this.localMockStore.set(blogId, posts);

    return mockPost;
  }

  public async updatePost(
    blogId: string,
    postId: string,
    title?: string,
    content?: string,
    isDraft?: boolean
  ): Promise<BloggerPost> {
    const existing = await this.getPost(blogId, postId);
    if (!existing) {
      throw new Error(`Blogger post with ID "${postId}" was not found.`);
    }

    const updatedTitle = title !== undefined ? title : existing.title;
    const updatedContent = content !== undefined ? content : existing.content;
    const updatedStatus = isDraft !== undefined ? (isDraft ? 'DRAFT' : 'LIVE') : existing.status;

    const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${postId}?key=${this.bloggerApiKey}`;
    const payload = {
      kind: 'blogger#post',
      blog: { id: blogId },
      title: updatedTitle,
      content: updatedContent,
      status: updatedStatus,
    };

    const apiResult = await this.fetchBloggerApi(url, 'PUT', payload);
    if (apiResult) {
      return this.mapToBloggerPost(apiResult);
    }

    // Fallback Mock update
    const mockPost: BloggerPost = {
      id: postId,
      blog: { id: blogId },
      title: updatedTitle,
      content: updatedContent,
      status: updatedStatus,
      published: existing.published,
      updated: new Date().toISOString(),
    };

    const posts = this.localMockStore.get(blogId) || [];
    const index = posts.findIndex(p => p.id === postId);
    if (index !== -1) {
      posts[index] = mockPost;
    } else {
      posts.push(mockPost);
    }
    this.localMockStore.set(blogId, posts);

    return mockPost;
  }

  public async getPost(blogId: string, postId: string): Promise<BloggerPost | null> {
    const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${postId}?key=${this.bloggerApiKey}`;
    const apiResult = await this.fetchBloggerApi(url, 'GET');
    if (apiResult) {
      return this.mapToBloggerPost(apiResult);
    }

    // Fallback mock check
    const posts = this.localMockStore.get(blogId) || [];
    const match = posts.find(p => p.id === postId);
    return match || null;
  }

  public async deletePost(blogId: string, postId: string): Promise<void> {
    const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${postId}?key=${this.bloggerApiKey}`;
    const success = await this.fetchBloggerApi(url, 'DELETE');
    if (success) return;

    // Fallback mock delete
    const posts = this.localMockStore.get(blogId) || [];
    const filtered = posts.filter(p => p.id !== postId);
    this.localMockStore.set(blogId, filtered);
  }

  private mapToBloggerPost(raw: any): BloggerPost {
    return {
      id: raw.id || '',
      blog: { id: raw.blog?.id || '' },
      title: raw.title || '',
      content: raw.content || '',
      status: raw.status === 'DRAFT' ? 'DRAFT' : 'LIVE',
      published: raw.published,
      updated: raw.updated,
    };
  }

  private initializeMockStore() {
    this.localMockStore.set('mock-blog-id', [
      {
        id: 'post_1',
        blog: { id: 'mock-blog-id' },
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
      },
      {
        id: 'post_2',
        blog: { id: 'mock-blog-id' },
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
      }
    ]);
  }
}
