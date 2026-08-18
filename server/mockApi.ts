/**
 * 本地开发用内存版 API 中间件（仅 dev / preview 生效，不参与生产构建）。
 * 复用与 Edge Functions 完全相同的 gameLogic 逻辑，使用进程内 Map 充当 KV，
 * 因此无需 EdgeOne 账号 / KV 绑定即可在本地用两个浏览器窗口对弈验证。
 * 响应体形状与 edge-functions 保持一致，便于无缝切换到真实部署。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createInitialState,
  joinState,
  applyMoveToState,
  restartState,
  type GameState,
} from '../src/utils/gameLogic';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(): string {
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return id;
}

const store = new Map<string, GameState>();

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * 返回 connect 风格中间件。命中 /api 路由时自行响应并结束；
 * 未命中时调用 next() 交给 Vite 处理（含 SPA 回退）。
 */
export function createMockApi() {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> => {
    const url = (req.url || '').split('?')[0];
    const method = (req.method || 'GET').toUpperCase();

    // POST /api/room/create  { playerId } -> { roomId, state }
    if (method === 'POST' && url === '/api/room/create') {
      const body = await readBody(req);
      const playerId = body.playerId;
      if (typeof playerId !== 'string' || !playerId) {
        return sendJson(res, 400, { error: 'playerId required' });
      }
      const roomId = genCode();
      const state = createInitialState(roomId, playerId);
      store.set(roomId, state);
      return sendJson(res, 201, { roomId, state });
    }

    // /api/room/:roomId/(join|state|move|restart)
    const m = url.match(/^\/api\/room\/([A-Z0-9]{6})\/(join|state|move|restart)$/i);
    if (!m) return next();

    const roomId = m[1].toUpperCase();
    const action = m[2];
    const state = store.get(roomId);
    if (!state) return sendJson(res, 404, { error: 'room not found' });

    if (method === 'POST' && action === 'join') {
      const body = await readBody(req);
      const playerId = body.playerId;
      if (typeof playerId !== 'string' || !playerId) {
        return sendJson(res, 400, { error: 'playerId required' });
      }
      if (state.players.white && state.players.white !== playerId) {
        return sendJson(res, 409, { error: 'room full' });
      }
      let updated = state;
      if (!state.players.white) {
        updated = joinState(state, playerId);
        store.set(roomId, updated);
      }
      return sendJson(res, 200, { state: updated });
    }

    if (method === 'GET' && action === 'state') {
      return sendJson(res, 200, { state });
    }

    if (method === 'POST' && action === 'move') {
      const body = await readBody(req);
      const { playerId, row, col } = body;
      if (
        typeof playerId !== 'string' ||
        typeof row !== 'number' ||
        typeof col !== 'number'
      ) {
        return sendJson(res, 400, { error: 'playerId, row, col required' });
      }
      const result = applyMoveToState(state, playerId, row, col);
      if (!result.ok) return sendJson(res, result.status, { error: result.error });
      store.set(roomId, result.state);
      return sendJson(res, 200, { state: result.state });
    }

    if (method === 'POST' && action === 'restart') {
      const body = await readBody(req);
      const { playerId } = body;
      if (state.status !== 'finished') {
        return sendJson(res, 409, { error: 'game not finished' });
      }
      if (
        typeof playerId === 'string' &&
        state.players.black !== playerId &&
        state.players.white !== playerId
      ) {
        return sendJson(res, 403, { error: 'not a player' });
      }
      const updated = restartState(state);
      store.set(roomId, updated);
      return sendJson(res, 200, { state: updated });
    }

    return sendJson(res, 405, { error: 'method not allowed' });
  };
}
