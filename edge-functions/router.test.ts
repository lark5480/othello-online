// @vitest-environment node
/**
 * 路由层测试：走 lib/router.ts 的「URL + method → params 提取 → handler」全链路，
 * 而非直接调用 handler —— 覆盖动态段提取、方法分派与线上约定的路由形状。
 */
import { describe, it, expect } from 'vitest';
import type { KVNamespace } from './types';
import { routeRequest } from './lib/router';
import { getValidMoves, type GameState } from '../src/utils/gameLogic';

class MemKV implements KVNamespace {
  private m = new Map<string, string>();
  async get(k: string): Promise<string | null> {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  async put(k: string, v: string): Promise<void> {
    this.m.set(k, v);
  }
  async delete(k: string): Promise<void> {
    this.m.delete(k);
  }
}

async function parse(r: Response | null) {
  expect(r).not.toBeNull();
  return { status: r!.status, body: await r!.json() };
}

describe('路由分派（镜像 EdgeOne 文件路由）', () => {
  it('POST /api/room/create 命中并创建房间', async () => {
    const env = { OTHELLO_KV: new MemKV() };
    const res = await parse(
      await routeRequest('POST', '/api/room/create', env, { playerId: 'p1' })
    );
    expect(res.status).toBe(201);
    expect(res.body.roomId).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('create → join → move → restart 全链路走 URL 路由', async () => {
    const env = { OTHELLO_KV: new MemKV() };

    const c = await parse(
      await routeRequest('POST', '/api/room/create', env, { playerId: 'pb' })
    );
    const roomId = c.body.roomId as string;

    // 小写房间码 URL 也应路由成功（端点内部做大写归一）
    const j = await parse(
      await routeRequest(
        'POST',
        `/api/room/${roomId.toLowerCase()}/join`,
        env,
        { playerId: 'pw' }
      )
    );
    expect(j.status).toBe(200);
    expect(j.body.state.status).toBe('playing');

    let st: GameState = j.body.state;
    let guard = 0;
    while (st.status === 'playing' && guard < 100) {
      guard++;
      const moves = getValidMoves(st.board, st.currentTurn);
      const pick = moves[0];
      const playerId = st.currentTurn === 'black' ? 'pb' : 'pw';
      const m = await parse(
        await routeRequest('POST', `/api/room/${roomId}/move`, env, {
          playerId,
          row: pick.row,
          col: pick.col,
        })
      );
      expect(m.status).toBe(200);
      st = m.body.state;
    }
    expect(st.status).toBe('finished');

    const r = await parse(
      await routeRequest('POST', `/api/room/${roomId}/restart`, env, {
        playerId: 'pb',
      })
    );
    expect(r.status).toBe(200);
    expect(r.body.state.moveCount).toBe(0);
  });

  it('所有路由的响应都不泄漏 playerId（players 恒为 null）', async () => {
    const env = { OTHELLO_KV: new MemKV() };
    const c = await parse(
      await routeRequest('POST', '/api/room/create', env, { playerId: 'secret-black' })
    );
    const roomId = c.body.roomId as string;
    expect(c.body.state.players).toEqual({ black: null, white: null });

    await routeRequest('POST', `/api/room/${roomId}/join`, env, {
      playerId: 'secret-white',
    });

    const s = await parse(await routeRequest('GET', `/api/room/${roomId}/state`, env));
    expect(s.body.state.players).toEqual({ black: null, white: null });

    // KV 原始值仍保留 playerId（服务端校验用），但绝不外发
    const raw = JSON.parse(
      (await (env.OTHELLO_KV as MemKV).get(roomId)) as string
    ) as GameState;
    expect(raw.players).toEqual({ black: 'secret-black', white: 'secret-white' });
  });

  it('非法房间码在路由层之后被端点校验拒绝（400 invalid roomId）', async () => {
    const env = { OTHELLO_KV: new MemKV() };
    // 5 位码：路由能匹配动态段，但格式校验失败
    const s = await parse(await routeRequest('GET', '/api/room/ABC12/state', env));
    expect(s.status).toBe(400);
    expect(s.body.error).toBe('invalid roomId');

    const j = await parse(
      await routeRequest('POST', '/api/room/ABC12/join', env, { playerId: 'x' })
    );
    expect(j.status).toBe(400);
  });

  it('方法不匹配或未知路径返回 null（平台层 404/405）', async () => {
    const env = { OTHELLO_KV: new MemKV() };
    expect(await routeRequest('GET', '/api/room/ABC123/move', env)).toBeNull();
    expect(await routeRequest('POST', '/api/room/ABC123/unknown', env, {})).toBeNull();
    expect(await routeRequest('POST', '/api/unknown', env, {})).toBeNull();
  });
});
