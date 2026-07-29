import {
  Board,
  ChessPiece,
  PieceColor,
  PieceType,
  cloneBoard,
} from '../models/chess.models';

export interface Coord {
  row: number;
  col: number;
}

export interface GameState {
  board: Board;
  sideToMove: PieceColor;
  /** Target square for en passant capture, if available. */
  enPassant: Coord | null;
}

export interface SanApplyResult {
  state: GameState;
  applied: string[];
  error?: string;
}

interface ParsedSan {
  raw: string;
  castling?: 'kingside' | 'queenside';
  piece: PieceType;
  to: Coord;
  fromFile?: number;
  fromRank?: number;
  capture: boolean;
  promotion?: PieceType;
}

const PIECE_LETTER: Record<string, PieceType> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
};

const PROMOTION_LETTER: Record<string, PieceType> = {
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
};

export function oppositeColor(color: PieceColor): PieceColor {
  return color === 'white' ? 'black' : 'white';
}

export function fileToCol(file: string): number {
  return file.charCodeAt(0) - 'a'.charCodeAt(0);
}

export function rankToRow(rank: string): number {
  return 8 - Number(rank);
}

export function squareToCoord(square: string): Coord | null {
  if (!/^[a-h][1-8]$/.test(square)) {
    return null;
  }
  return { row: rankToRow(square[1]), col: fileToCol(square[0]) };
}

/** Extract SAN move tokens from free-form algebraic text (supports move numbers). */
export function tokenizeSanMoves(text: string): string[] {
  let cleaned = text.replace(/\{[^}]*\}/g, ' ');
  cleaned = cleaned.replace(/\([^)]*\)/g, ' ');
  cleaned = cleaned.replace(/\$\d+/g, ' ');

  const tokens = cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const moves: string[] = [];

  for (const token of tokens) {
    if (/^\d+(\.{1,3})?$/.test(token)) {
      continue;
    }
    if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/i.test(token)) {
      continue;
    }

    // Handle glued forms like "1.e4" or "12...Nf6"
    const glued = token.match(/^\d+(\.{1,3})(.+)$/);
    if (glued) {
      moves.push(glued[2]);
      continue;
    }

    moves.push(token);
  }

  return moves;
}

export function parseSan(san: string): ParsedSan | null {
  const raw = san.trim();
  const normalized = raw
    .replace(/[+#?!]+$/g, '')
    .replace(/0-0-0/g, 'O-O-O')
    .replace(/0-0/g, 'O-O');

  if (normalized === 'O-O' || normalized === 'O-O-O') {
    // Placeholder destination; castling handler uses side to move.
    return {
      raw,
      castling: normalized === 'O-O' ? 'kingside' : 'queenside',
      piece: 'king',
      to: { row: 0, col: 0 },
      capture: false,
    };
  }

  const match = normalized.match(
    /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?$/
  );

  if (!match) {
    return null;
  }

  const [, pieceLetter, fromFile, fromRank, captureMark, toSquare, promo] =
    match;
  const to = squareToCoord(toSquare);
  if (!to) {
    return null;
  }

  const piece: PieceType = pieceLetter
    ? PIECE_LETTER[pieceLetter]
    : 'pawn';

  if (!piece) {
    return null;
  }

  return {
    raw,
    piece,
    to,
    fromFile: fromFile ? fileToCol(fromFile) : undefined,
    fromRank: fromRank ? rankToRow(fromRank) : undefined,
    capture: !!captureMark,
    promotion: promo ? PROMOTION_LETTER[promo] : undefined,
  };
}

export function applySanSequence(
  state: GameState,
  text: string
): SanApplyResult {
  const tokens = tokenizeSanMoves(text);
  if (tokens.length === 0) {
    return { state, applied: [], error: 'No moves found in input.' };
  }

  let current = cloneGameState(state);
  const applied: string[] = [];

  for (const token of tokens) {
    const next = applySanMove(current, token);
    if ('error' in next) {
      return {
        state: current,
        applied,
        error: `Could not play "${token}"${applied.length ? ` after ${applied.join(' ')}` : ''}: ${next.error}`,
      };
    }
    current = next;
    applied.push(token);
  }

  return { state: current, applied };
}

export function applySanMove(
  state: GameState,
  san: string
): GameState | { error: string } {
  const parsed = parseSan(san);
  if (!parsed) {
    return { error: 'unrecognized algebraic notation.' };
  }

  if (parsed.castling) {
    return applyCastling(state, parsed.castling);
  }

  const candidates = findCandidateOrigins(state, parsed);
  if (candidates.length === 0) {
    return { error: 'no matching piece can make that move.' };
  }
  if (candidates.length > 1) {
    return {
      error: `ambiguous move (matches ${candidates.length} pieces).`,
    };
  }

  return executeMove(state, candidates[0], parsed.to, parsed.promotion);
}

export function cloneGameState(state: GameState): GameState {
  return {
    board: cloneBoard(state.board),
    sideToMove: state.sideToMove,
    enPassant: state.enPassant ? { ...state.enPassant } : null,
  };
}

function applyCastling(
  state: GameState,
  side: 'kingside' | 'queenside'
): GameState | { error: string } {
  const row = state.sideToMove === 'white' ? 7 : 0;
  const kingCol = 4;
  const rookCol = side === 'kingside' ? 7 : 0;
  const newKingCol = side === 'kingside' ? 6 : 2;
  const newRookCol = side === 'kingside' ? 5 : 3;

  const king = state.board[row][kingCol];
  const rook = state.board[row][rookCol];

  if (!king || king.type !== 'king' || king.color !== state.sideToMove) {
    return { error: 'king not on starting square for castling.' };
  }
  if (!rook || rook.type !== 'rook' || rook.color !== state.sideToMove) {
    return { error: 'rook not available for castling.' };
  }

  const pathStart = Math.min(kingCol, rookCol) + 1;
  const pathEnd = Math.max(kingCol, rookCol);
  for (let col = pathStart; col < pathEnd; col++) {
    if (state.board[row][col]) {
      return { error: 'castling path is blocked.' };
    }
  }

  const next = cloneGameState(state);
  next.board[row][kingCol] = null;
  next.board[row][rookCol] = null;
  next.board[row][newKingCol] = { type: 'king', color: state.sideToMove };
  next.board[row][newRookCol] = { type: 'rook', color: state.sideToMove };
  next.enPassant = null;
  next.sideToMove = oppositeColor(state.sideToMove);
  return next;
}

function findCandidateOrigins(state: GameState, parsed: ParsedSan): Coord[] {
  const matches: Coord[] = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col];
      if (!piece || piece.color !== state.sideToMove || piece.type !== parsed.piece) {
        continue;
      }
      if (parsed.fromFile !== undefined && col !== parsed.fromFile) {
        continue;
      }
      if (parsed.fromRank !== undefined && row !== parsed.fromRank) {
        continue;
      }
      if (!canMoveTo(state, { row, col }, parsed.to, piece, parsed.capture)) {
        continue;
      }
      matches.push({ row, col });
    }
  }

  return matches;
}

function canMoveTo(
  state: GameState,
  from: Coord,
  to: Coord,
  piece: ChessPiece,
  notationSaysCapture: boolean
): boolean {
  const target = state.board[to.row][to.col];
  const isEnPassant =
    piece.type === 'pawn' &&
    !!state.enPassant &&
    state.enPassant.row === to.row &&
    state.enPassant.col === to.col;

  const isCapture = !!target || isEnPassant;

  if (target && target.color === piece.color) {
    return false;
  }

  // If SAN includes "x", require a capture; if not, still allow captures
  // (notation often omits "x" in informal input, but require capture mark when present).
  if (notationSaysCapture && !isCapture) {
    return false;
  }

  switch (piece.type) {
    case 'pawn':
      return canPawnMove(state, from, to, piece, isCapture, isEnPassant);
    case 'knight':
      return isKnightMove(from, to);
    case 'bishop':
      return isDiagonalMove(from, to) && isPathClear(state.board, from, to);
    case 'rook':
      return isStraightMove(from, to) && isPathClear(state.board, from, to);
    case 'queen':
      return (
        (isStraightMove(from, to) || isDiagonalMove(from, to)) &&
        isPathClear(state.board, from, to)
      );
    case 'king':
      return Math.max(Math.abs(from.row - to.row), Math.abs(from.col - to.col)) === 1;
    default:
      return false;
  }
}

function canPawnMove(
  state: GameState,
  from: Coord,
  to: Coord,
  piece: ChessPiece,
  isCapture: boolean,
  isEnPassant: boolean
): boolean {
  const direction = piece.color === 'white' ? -1 : 1;
  const startRow = piece.color === 'white' ? 6 : 1;
  const rowDiff = to.row - from.row;
  const colDiff = to.col - from.col;

  if (isCapture) {
    if (rowDiff !== direction || Math.abs(colDiff) !== 1) {
      return false;
    }
    if (isEnPassant) {
      return true;
    }
    const target = state.board[to.row][to.col];
    return !!target && target.color !== piece.color;
  }

  if (colDiff !== 0) {
    return false;
  }

  if (state.board[to.row][to.col]) {
    return false;
  }

  if (rowDiff === direction) {
    return true;
  }

  if (
    from.row === startRow &&
    rowDiff === direction * 2 &&
    !state.board[from.row + direction][from.col]
  ) {
    return true;
  }

  return false;
}

function executeMove(
  state: GameState,
  from: Coord,
  to: Coord,
  promotion?: PieceType
): GameState {
  const next = cloneGameState(state);
  const piece = next.board[from.row][from.col]!;
  const isEnPassant =
    piece.type === 'pawn' &&
    !!state.enPassant &&
    state.enPassant.row === to.row &&
    state.enPassant.col === to.col;

  if (isEnPassant) {
    const capturedRow = from.row;
    next.board[capturedRow][to.col] = null;
  }

  next.board[from.row][from.col] = null;

  const moved: ChessPiece = { ...piece };
  if (piece.type === 'pawn' && (to.row === 0 || to.row === 7)) {
    moved.type = promotion ?? 'queen';
  } else if (promotion) {
    moved.type = promotion;
  }

  next.board[to.row][to.col] = moved;

  // Set en passant target after a double pawn push.
  if (piece.type === 'pawn' && Math.abs(from.row - to.row) === 2) {
    next.enPassant = {
      row: (from.row + to.row) / 2,
      col: from.col,
    };
  } else {
    next.enPassant = null;
  }

  next.sideToMove = oppositeColor(state.sideToMove);
  return next;
}

function isKnightMove(from: Coord, to: Coord): boolean {
  const dr = Math.abs(from.row - to.row);
  const dc = Math.abs(from.col - to.col);
  return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
}

function isStraightMove(from: Coord, to: Coord): boolean {
  return from.row === to.row || from.col === to.col;
}

function isDiagonalMove(from: Coord, to: Coord): boolean {
  return Math.abs(from.row - to.row) === Math.abs(from.col - to.col);
}

function isPathClear(board: Board, from: Coord, to: Coord): boolean {
  const rowStep = Math.sign(to.row - from.row);
  const colStep = Math.sign(to.col - from.col);
  let row = from.row + rowStep;
  let col = from.col + colStep;

  while (row !== to.row || col !== to.col) {
    if (board[row][col]) {
      return false;
    }
    row += rowStep;
    col += colStep;
  }

  return true;
}
