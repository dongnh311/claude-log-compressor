import type { Request, Response } from "express";

/**
 * Public API surface for the Posts service.
 */
export interface PostRepository {
  findById(id: string): Promise<Post | null>;
  list(params: ListParams): Promise<Post[]>;
  create(input: CreatePostInput): Promise<Post>;
  update(id: string, patch: Partial<Post>): Promise<Post>;
  delete(id: string): Promise<void>;
}

export interface Post {
  id: string;
  title: string;
  body: string;
  authorId: string;
  createdAt: number;
}

export interface ListParams {
  limit?: number;
  cursor?: string;
  authorId?: string;
}

export interface CreatePostInput {
  title: string;
  body: string;
  authorId: string;
}

export type PostsListener = (post: Post) => void;

export const DEFAULT_LIMIT = 20;

export class PostsController {
  private listeners: PostsListener[] = [];

  constructor(private readonly repo: PostRepository) {}

  async list(req: Request, res: Response): Promise<void> {
    const limit = Number(req.query.limit) || DEFAULT_LIMIT;
    const cursor = req.query.cursor as string | undefined;
    try {
      const posts = await this.repo.list({ limit, cursor });
      res.json({ posts, next_cursor: posts[posts.length - 1]?.id ?? null });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }

  async get(req: Request, res: Response): Promise<void> {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "missing id" });
      return;
    }
    const post = await this.repo.findById(id);
    if (!post) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(post);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreatePostInput;
    if (!input.title || !input.body) {
      res.status(400).json({ error: "title and body required" });
      return;
    }
    const post = await this.repo.create(input);
    this.notify(post);
    res.status(201).json(post);
  }

  private notify(post: Post): void {
    for (const listener of this.listeners) listener(post);
  }

  onCreate(listener: PostsListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

export namespace PostHelpers {
  export function isValidPost(p: unknown): p is Post {
    if (typeof p !== "object" || p === null) return false;
    const o = p as Record<string, unknown>;
    return typeof o.id === "string" && typeof o.title === "string";
  }

  export function sortByCreatedAt(posts: Post[]): Post[] {
    return [...posts].sort((a, b) => b.createdAt - a.createdAt);
  }
}
