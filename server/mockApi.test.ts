import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { createMockApi } from './mockApi';

function makeReq(url: string, method: string, body?: unknown) {
  const ee = new EventEmitter();
  const req: any = {
    url,
    method,
    on(_ev: string, cb: (...a: any[]) => void) {
      ee.on(_ev, cb);
      return req;
    },
  };
  process.nextTick(() => {
    if (body !== undefined) ee.emit('data', JSON.stringify(body));
    ee.emit('end');
  });
  return req;
}

function makeRes() {
  const res: any = {
    statusCode: 0,
    _headers: {},
    _body: '',
    setHeader(k: string, v: string) {
      this._headers[k] = v;
    },
    end(b?: string) {
      this._body = b ?? '';
    },
  };
  return res;
}

async function call(handler: any, url: string, method: string, body?: unknown) {
  const req = makeReq(url, method, body);
  const res = makeRes();
  await handler(req, res, () => {});
  return { status: res.statusCode, json: res._body ? JSON.parse(res._body) : null };
}

describe('本地 mock API（dev/preview 中间件）', () => {
  it('create → join → state → move → 错误码 全链路', async () => {
    const handler = createMockApi();

    const c = await call(handler, '/api/room/create', 'POST', { playerId: 'A' });
    expect(c.status).toBe(201);
    expect(c.json.roomId).toMatch(/^[A-Z0-9]{6}$/);
    expect(c.json.state.status).toBe('waiting');

    const roomId = c.json.roomId as string;

    const j = await call(handler, `/api/room/${roomId}/join`, 'POST', { playerId: 'B' });
    expect(j.status).toBe(200);
    expect(j.json.state.status).toBe('playing');
    expect(j.json.state.players).toEqual({ black: 'A', white: 'B' });

    const s = await call(handler, `/api/room/${roomId}/state`, 'GET');
    expect(s.status).toBe(200);

    const m = await call(handler, `/api/room/${roomId}/move`, 'POST', { playerId: 'A', row: 2, col: 3 });
    expect(m.status).toBe(200);
    expect(m.json.state.currentTurn).toBe('white');
    expect(m.json.state.moveCount).toBe(1);

    // 白方合法落子 (2,4) 应成功
    const mWhite = await call(handler, `/api/room/${roomId}/move`, 'POST', { playerId: 'B', row: 2, col: 4 });
    expect(mWhite.status).toBe(200);
    expect(mWhite.json.state.currentTurn).toBe('black');

    // 非当前回合（白方 B 在黑方回合落子）应被拒绝
    const m2 = await call(handler, `/api/room/${roomId}/move`, 'POST', { playerId: 'B', row: 2, col: 2 });
    expect(m2.status).toBe(409);

    // 不存在的房间
    const nf = await call(handler, '/api/room/ZZZZZZ/state', 'GET');
    expect(nf.status).toBe(404);
  });

  it('满房时 join 返回 409', async () => {
    const handler = createMockApi();
    const c = await call(handler, '/api/room/create', 'POST', { playerId: 'A' });
    const roomId = c.json.roomId as string;
    await call(handler, `/api/room/${roomId}/join`, 'POST', { playerId: 'B' });
    const full = await call(handler, `/api/room/${roomId}/join`, 'POST', { playerId: 'C' });
    expect(full.status).toBe(409);
  });
});
