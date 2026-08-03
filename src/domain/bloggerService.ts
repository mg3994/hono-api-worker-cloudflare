export interface BloggerPost {
  id: string;
  blog: {
    id: string;
  };
  title: string;
  content: string;
  status: 'LIVE' | 'DRAFT';
  published?: string;
  updated?: string;
}

export interface IBloggerService {
  createPost(blogId: string, title: string, content: string, isDraft?: boolean): Promise<BloggerPost>;
  updatePost(blogId: string, postId: string, title?: string, content?: string, isDraft?: boolean): Promise<BloggerPost>;
  getPost(blogId: string, postId: string): Promise<BloggerPost | null>;
  deletePost(blogId: string, postId: string): Promise<void>;
}
