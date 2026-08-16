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
  status?: 'live' | 'spam' | 'pending';
  author: {
    displayName: string;
    image: {
      url: string;
    };
  };
}

export interface BloggerPage {
  id: string;
  blog: {
    id: string;
  };
  title: string;
  content: string;
  status: 'LIVE' | 'DRAFT';
  published?: string;
  updated?: string;
  url?: string;
}

export interface IBloggerService {
  getSelfBlogs(accessToken: string): Promise<Blog[]>;
  getBlogById(blogId: string, accessToken?: string): Promise<Blog>;
  getBlogByUrl(url: string, accessToken?: string): Promise<Blog>;
  getPost(blogId: string, postId: string, accessToken?: string): Promise<BloggerPost>;
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
  patchPost(
    blogId: string,
    postId: string,
    accessToken: string,
    options: {
      title?: string;
      content?: string;
      labels?: string[];
    }
  ): Promise<BloggerPost>;
  publishPost(blogId: string, postId: string, accessToken: string): Promise<BloggerPost>;
  revertPost(blogId: string, postId: string, accessToken: string): Promise<BloggerPost>;
  deletePost(blogId: string, postId: string, accessToken: string): Promise<void>;
  listComments(blogId: string, postId: string, accessToken?: string): Promise<BlogComment[]>;
  listCommentsByBlog(blogId: string, accessToken?: string): Promise<BlogComment[]>;
  getComment(blogId: string, postId: string, commentId: string, accessToken?: string): Promise<BlogComment>;
  createComment(blogId: string, postId: string, accessToken: string, content: string): Promise<BlogComment>;
  deleteComment(blogId: string, postId: string, commentId: string, accessToken: string): Promise<void>;
  markCommentAsSpam(blogId: string, postId: string, commentId: string, accessToken: string): Promise<BlogComment>;
  approveComment(blogId: string, postId: string, commentId: string, accessToken: string): Promise<BlogComment>;
  removeComment(blogId: string, postId: string, commentId: string, accessToken: string): Promise<BlogComment>;
  listPages(blogId: string, accessToken?: string): Promise<BloggerPage[]>;
  getPage(blogId: string, pageId: string, accessToken?: string): Promise<BloggerPage>;
  createPage(blogId: string, accessToken: string, title: string, content: string): Promise<BloggerPage>;
  updatePage(blogId: string, pageId: string, accessToken: string, title: string, content: string): Promise<BloggerPage>;
  deletePage(blogId: string, pageId: string, accessToken: string): Promise<void>;
  getUserProfile(userId: string, accessToken: string): Promise<any>;
}
