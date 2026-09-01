/**
 * 镜像 EdgeOne Pages 文件路由的最小路由器（路径匹配 + params 提取 + 方法分派）。
 *
 * 为什么存在：Edge Functions 的真实入口由平台的文件路由执行
 * （目录结构即路由、动态段 [xxx] 进 context.params）。本地测试若直接调用
 * handler 并手工构造 params，会绕过路由层 —— 曾因此出现「测试绿但生产 join
 * 路由坏」。本文件让测试通过 URL + method 走一遍与平台约定一致的分派逻辑。
 * 规则需与 edge-functions/ 目录结构一一对应：新增端点时同步更新 ROUTES。
 */

import type { EdgeContext } from '../types';
import { onRequestPost as createRoom } from '../api/room/create';
import { onRequestPost as joinRoom } from '../api/room/[roomId]/join';
import { onRequestGet as getState } from '../api/room/[roomId]/state';
import { onRequestPost as move } from '../api/room/[roomId]/move';
import { onRequestPost as restart } from '../api/room/[roomId]/restart';

type Handler = (ctx: EdgeContext) => Promise<Response>;

interface Route {
  method: string;
  /** ':name' 为动态段，其余为字面量段 */
  segments: string[];
  handler: Handler;
}

const ROUTES: Route[] = [
  { method: 'POST', segments: ['api', 'room', 'create'], handler: createRoom },
  { method: 'POST', segments: ['api', 'room', ':roomId', 'join'], handler: joinRoom },
  { method: 'GET', segments: ['api', 'room', ':roomId', 'state'], handler: getState },
  { method: 'POST', segments: ['api', 'room', ':roomId', 'move'], handler: move },
  { method: 'POST', segments: ['api', 'room', ':roomId', 'restart'], handler: restart },
];

/**
 * 按方法与路径分派到对应 Edge Function。
 * 返回 null 表示无匹配路由（线上由平台层返回 404/405）。
 */
export async function routeRequest(
  method: string,
  url: string,
  env: EdgeContext['env'],
  body?: unknown
): Promise<Response | null> {
  const path = url.split('?')[0];
  const segs = path.split('/').filter(Boolean);

  for (const route of ROUTES) {
    if (route.method !== method.toUpperCase()) continue;
    if (route.segments.length !== segs.length) continue;

    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < segs.length; i++) {
      const pat = route.segments[i];
      if (pat.startsWith(':')) {
        params[pat.slice(1)] = decodeURIComponent(segs[i]);
      } else if (pat !== segs[i]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    const hasBody = route.method !== 'GET' && body !== undefined;
    const request = new Request(`https://router.local${path}`, {
      method: route.method,
      body: hasBody ? JSON.stringify(body) : undefined,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    });
    return route.handler({ request, params, env } as EdgeContext);
  }
  return null;
}
