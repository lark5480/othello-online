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
    // 自托管时如需其他存储后端，在 lib/kv.ts 的 getKV 中扩展；
    // 未声明的环境变量不要留在类型里，避免误导部署配置。
  };
}
