export interface Blog {
  id: string;
  name: string;
  description: string;
  url: string;
  published: string;
  updated: string;
}

export interface BloggerPost {
  id: string;
  blog: {
    id: string;
  };
  title: string;
  content: string;
  status: 'LIVE' | 'DRAFT' | 'SCHEDULED';
  labels?: string[];
  published?: string;
  updated?: string;
}

export interface BlogComment {
  id: string;
  post: {
    id: string;
  };
  blog: {
    id: string;
  };
  published: string;
  updated: string;
  content: string;
  author: {
    displayName: string;
    image: {
      url: string;
    };
  };
}

export interface IBloggerService {
  getSelfBlogs(accessToken: string): Promise<Blog[]>;
  getBlogById(blogId: string, accessToken?: string): Promise<Blog>;
  createSelfBlog(accessToken: string, name: string, description: string): Promise<Blog>;
  listPosts(
    blogId: string,
    options?: {
      accessToken?: string;
      searchQuery?: string;
      status?: string; // e.g., "LIVE", "DRAFT", "SCHEDULED"
    }
  ): Promise<BloggerPost[]>;
  createPost(
    blogId: string,
    accessToken: string,
    options: {
      title: string;
      content: string;
      labels?: string[];
      isDraft?: boolean;
      publishDate?: string;
    }
  ): Promise<BloggerPost>;
  updatePost(
    blogId: string,
    postId: string,
    accessToken: string,
    options: {
      title: string;
      content: string;
      labels?: string[];
      isDraft?: boolean;
      publishDate?: string;
    }
  ): Promise<BloggerPost>;
  deletePost(blogId: string, postId: string, accessToken: string): Promise<void>;
  listComments(blogId: string, postId: string, accessToken?: string): Promise<BlogComment[]>;
  createComment(blogId: string, postId: string, accessToken: string, content: string): Promise<BlogComment>;
}
