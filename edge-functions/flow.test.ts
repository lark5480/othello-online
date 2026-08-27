import { describe, it, expect } from 'vitest';
import type { EdgeContext, KVNamespace } from './types';
import { onRequestPost as createRoom } from './api/room/create';
import { onRequestPost as joinRoom } from './api/room/[roomId]/join';
import { onRequestGet as getState } from './api/room/[roomId]/state';
import { onRequestPost as move } from './api/room/[roomId]/move';
import { onRequestPost as restart } from './api/room/[roomId]/restart';
import { getValidMoves, type GameState } from '../src/utils/gameLogic';

/** 内存版 KV，用于本地模拟 EdgeOne KV（值必须是字符串） */
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

function ctx(
  body: unknown,
  params: Record<string, string>,
  kv: KVNamespace
): EdgeContext {
  return {
    request: { json: async () => body } as unknown as Request,
    params,
    env: { OTHELLO_KV: kv },
  } as unknown as EdgeContext;
}

async function parse(r: Response) {
  return { status: r.status, body: await r.json() };
}

describe('Edge Functions 全流程（内存 KV 模拟）', () => {
  it('create → join → 对弈至结束 → restart', async () => {
    const kv = new MemKV();
    const black = 'pb';
    const white = 'pw';

    const c = await parse(await createRoom(ctx({ playerId: black }, {}, kv)));
    expect(c.status).toBe(201);
    const roomId = c.body.roomId as string;
    expect(roomId).toMatch(/^[A-Z0-9]{6}$/);

    const j = await parse(await joinRoom(ctx({ roomId, playerId: white }, { roomId }, kv)));
    expect(j.status).toBe(200);
    expect(j.body.state.status).toBe('playing');
    expect(j.body.state.players.white).toBe(white);

    const gs = await parse(await getState(ctx({}, { roomId }, kv)));
    expect(gs.status).toBe(200);

    let st: GameState = j.body.state;
    let guard = 0;
    while (st.status === 'playing' && guard < 100) {
      guard++;
      const moves = getValidMoves(st.board, st.currentTurn);
      const pick = moves[0];
      const playerId = st.currentTurn === 'black' ? black : white;
      const res = await parse(
        await move(ctx({ playerId, row: pick.row, col: pick.col }, { roomId }, kv))
      );
      expect(res.status).toBe(200);
      st = res.body.state;
    }
    expect(st.status).toBe('finished');

    const r = await parse(await restart(ctx({ playerId: black }, { roomId }, kv)));
    expect(r.status).toBe(200);
    expect(r.body.state.moveCount).toBe(0);
    expect(r.body.state.status).toBe('playing');
  });

  it('房间已满时 join 返回 409', async () => {
    const kv = new MemKV();
    const c = await parse(await createRoom(ctx({ playerId: 'a' }, {}, kv)));
    const roomId = c.body.roomId as string;
    await joinRoom(ctx({ roomId, playerId: 'b' }, { roomId }, kv));
    const full = await parse(await joinRoom(ctx({ roomId, playerId: 'c' }, { roomId }, kv)));
    expect(full.status).toBe(409);
  });

  it('未结束不能 restart（返回 409）', async () => {
    const kv = new MemKV();
    const c = await parse(await createRoom(ctx({ playerId: 'a' }, {}, kv)));
    const roomId = c.body.roomId as string;
    await joinRoom(ctx({ roomId, playerId: 'b' }, { roomId }, kv));
    const r = await parse(await restart(ctx({ playerId: 'a' }, { roomId }, kv)));
    expect(r.status).toBe(409);
  });

  it('KV 未绑定时返回 503 storage not configured', async () => {
    // 用空 env 模拟未配置 KV
    const badCtx = ctx({ playerId: 'a' }, {}, undefined as unknown as KVNamespace);
    const res = await parse(await createRoom(badCtx));
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('storage not configured');
  });

  it('move 携带过期 expectedUpdatedAt 返回 409（乐观并发）', async () => {
    const kv = new MemKV();
    const c = await parse(await createRoom(ctx({ playerId: 'a' }, {}, kv)));
    const roomId = c.body.roomId as string;
    await joinRoom(ctx({ roomId, playerId: 'b' }, { roomId }, kv));
    const st = (await parse(await getState(ctx({}, { roomId }, kv)))).body.state as GameState;
    const moves = getValidMoves(st.board, 'black');
    const pick = moves[0];

    // 过期（比真实值小）的 expectedUpdatedAt → 冲突拒绝
    const wrong = await parse(
      await move(
        ctx(
          { playerId: 'a', row: pick.row, col: pick.col, expectedUpdatedAt: st.updatedAt - 1 },
          { roomId },
          kv
        )
      )
    );
    expect(wrong.status).toBe(409);

    // 正确的 expectedUpdatedAt → 正常落子
    const ok = await parse(
      await move(
        ctx(
          { playerId: 'a', row: pick.row, col: pick.col, expectedUpdatedAt: st.updatedAt },
          { roomId },
          kv
        )
      )
    );
    expect(ok.status).toBe(200);
  });

  it('restart 缺 playerId 返回 400，非房间玩家返回 403', async () => {
    const kv = new MemKV();
    const c = await parse(await createRoom(ctx({ playerId: 'a' }, {}, kv)));
    const roomId = c.body.roomId as string;
    await joinRoom(ctx({ roomId, playerId: 'b' }, { roomId }, kv));

    let st: GameState = (await parse(await getState(ctx({}, { roomId }, kv)))).body.state;
    let guard = 0;
    while (st.status === 'playing' && guard < 100) {
      guard++;
      const moves = getValidMoves(st.board, st.currentTurn);
      const pick = moves[0];
      const pid = st.currentTurn === 'black' ? 'a' : 'b';
      st = (await parse(await move(ctx({ playerId: pid, row: pick.row, col: pick.col }, { roomId }, kv)))).body.state;
    }
    expect(st.status).toBe('finished');

    const noId = await parse(await restart(ctx({}, { roomId }, kv)));
    expect(noId.status).toBe(400);

    const notPlayer = await parse(await restart(ctx({ playerId: 'z' }, { roomId }, kv)));
    expect(notPlayer.status).toBe(403);
  });
});
