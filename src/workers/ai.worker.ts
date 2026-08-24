import { chooseAIMove, type Difficulty } from '../utils/ai';
import type { Board, Move, Player } from '../utils/gameLogic';

interface AIMessage {
  id: number;
  board: Board;
  aiPlayer: Player;
  difficulty: Difficulty;
}

self.onmessage = (e: MessageEvent<AIMessage>) => {
  const { id, board, aiPlayer, difficulty } = e.data;
  const move = chooseAIMove(board, aiPlayer, difficulty);
  (self as unknown as Worker).postMessage({ id, move });
};

export type { Move };
