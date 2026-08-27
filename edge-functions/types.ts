/**
 * Edge Functions 运行时最小类型声明。
 * 真实类型由 EdgeOne 平台在运行时注入，这里仅用于本地 tsc 类型检查。
 */

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface EdgeContext {
  request: Request;
  params: Record<string, string>;
  env: Record<string, unknown> & {
    OTHELLO_KV?: KVNamespace;
    // 兜底存储：当 EdgeOne KV 存储未开通/审批未过时，可用任意兼容 Redis REST 的
    // 无服务器 KV（如 Upstash）作为共享状态后端，无需 KV 审批。
    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;
  };
}
