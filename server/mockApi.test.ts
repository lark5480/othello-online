import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { createMockApi } from './mockApi';
import { getValidMoves, type GameState } from '../src/utils/gameLogic';

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
    // 公开响应不回传 playerId（防冒充）；加入成功由 status 变化体现
    expect(j.json.state.players).toEqual({ black: null, white: null });

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

  it('move 携带过期 expectedUpdatedAt 返回 409（乐观并发）', async () => {
    const handler = createMockApi();
    const c = await call(handler, '/api/room/create', 'POST', { playerId: 'A' });
    const roomId = c.json.roomId as string;
    await call(handler, `/api/room/${roomId}/join`, 'POST', { playerId: 'B' });
    const s = await call(handler, `/api/room/${roomId}/state`, 'GET');
    const st = s.json.state as GameState;

    const wrong = await call(handler, `/api/room/${roomId}/move`, 'POST', {
      playerId: 'A',
      row: 2,
      col: 3,
      expectedUpdatedAt: st.updatedAt - 1,
    });
    expect(wrong.status).toBe(409);

    const ok = await call(handler, `/api/room/${roomId}/move`, 'POST', {
      playerId: 'A',
      row: 2,
      col: 3,
      expectedUpdatedAt: st.updatedAt,
    });
    expect(ok.status).toBe(200);
  });

  it('restart 缺 playerId 返回 400，非房间玩家返回 403', async () => {
    const handler = createMockApi();
    const c = await call(handler, '/api/room/create', 'POST', { playerId: 'A' });
    const roomId = c.json.roomId as string;
    await call(handler, `/api/room/${roomId}/join`, 'POST', { playerId: 'B' });

    let st = (await call(handler, `/api/room/${roomId}/state`, 'GET')).json.state as GameState;
    let guard = 0;
    while (st.status === 'playing' && guard < 100) {
      guard++;
      const moves = getValidMoves(st.board, st.currentTurn);
      const pick = moves[0];
      const pid = st.currentTurn === 'black' ? 'A' : 'B';
      st = (await call(handler, `/api/room/${roomId}/move`, 'POST', { playerId: pid, row: pick.row, col: pick.col })).json.state;
    }
    expect(st.status).toBe('finished');

    const noId = await call(handler, `/api/room/${roomId}/restart`, 'POST', {});
    expect(noId.status).toBe(400);

    const notPlayer = await call(handler, `/api/room/${roomId}/restart`, 'POST', { playerId: 'Z' });
    expect(notPlayer.status).toBe(403);
  });

  it('与 Edge Functions 行为对齐：非法房间码 400、小写归一、playerId 类型校验', async () => {
    const handler = createMockApi();

    // 非法格式（过短/过长/非法字符）→ 400 invalid roomId
    for (const bad of ['ABC12', 'ABC1234', 'abc@12']) {
      const r = await call(handler, `/api/room/${encodeURIComponent(bad)}/state`, 'GET');
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('invalid roomId');
    }

    // create 的 playerId 类型非法 → 400
    const bad = await call(handler, '/api/room/create', 'POST', { playerId: 123 });
    expect(bad.status).toBe(400);

    // 小写房间码归一后可用
    const c = await call(handler, '/api/room/create', 'POST', { playerId: 'A' });
    const roomId = c.json.roomId as string;
    const j = await call(handler, `/api/room/${roomId.toLowerCase()}/join`, 'POST', { playerId: 'B' });
    expect(j.status).toBe(200);

    // 所有响应均不泄漏 playerId
    const s = await call(handler, `/api/room/${roomId}/state`, 'GET');
    expect(s.json.state.players).toEqual({ black: null, white: null });
  });
});
