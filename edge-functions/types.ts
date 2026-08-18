/**
 * Edge Functions 运行时最小类型声明。
 * 真实类型由 EdgeOne 平台在运行时注入，这里仅用于本地 tsc 类型检查。
 */

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface EdgeContext {
  request: Request;
  params: Record<string, string>;
  env: Record<string, unknown> & { OTHELLO_KV?: KVNamespace };
}
