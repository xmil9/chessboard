import {
  applySanSequence,
  parseSan,
  tokenizeSanMoves,
} from './san';
import { createStartingBoard } from '../models/chess.models';

describe('tokenizeSanMoves', () => {
  it('parses numbered game fragments', () => {
    expect(tokenizeSanMoves('1. e4 e5 2. Nf3 Nc6')).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
    ]);
  });

  it('handles glued move numbers', () => {
    expect(tokenizeSanMoves('1.e4 e5 12...Nf6')).toEqual(['e4', 'e5', 'Nf6']);
  });
});

describe('parseSan', () => {
  it('parses castling and promotions', () => {
    expect(parseSan('O-O')?.castling).toBe('kingside');
    expect(parseSan('O–O')?.castling).toBe('kingside');
    expect(parseSan('O—O')?.castling).toBe('kingside');
    expect(parseSan('O–O–O')?.castling).toBe('queenside');
    expect(parseSan('O—O—O')?.castling).toBe('queenside');
    expect(parseSan('0–0')?.castling).toBe('kingside');
    expect(parseSan('e8=Q')?.promotion).toBe('queen');
    expect(parseSan('Nbd7')?.fromFile).toBe(1);
  });
});

describe('applySanSequence', () => {
  it('applies a multi-move opening', () => {
    const result = applySanSequence(
      {
        board: createStartingBoard(),
        sideToMove: 'white',
        enPassant: null,
      },
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'
    );

    expect(result.error).toBeUndefined();
    expect(result.applied).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(result.state.sideToMove).toBe('white');
    expect(result.state.board[4][4]).toEqual({ type: 'pawn', color: 'white' }); // e4
    expect(result.state.board[3][4]).toEqual({ type: 'pawn', color: 'black' }); // e5
    expect(result.state.board[5][5]).toEqual({ type: 'knight', color: 'white' }); // f3
    expect(result.state.board[2][2]).toEqual({ type: 'knight', color: 'black' }); // c6
    expect(result.state.board[3][1]).toEqual({ type: 'bishop', color: 'white' }); // b5
    expect(result.state.board[2][0]).toEqual({ type: 'pawn', color: 'black' }); // a6
  });

  it('stops on an illegal move and keeps prior ones', () => {
    const result = applySanSequence(
      {
        board: createStartingBoard(),
        sideToMove: 'white',
        enPassant: null,
      },
      'e4 e5 Nf4'
    );

    expect(result.applied).toEqual(['e4', 'e5']);
    expect(result.error).toContain('Nf4');
    expect(result.state.board[4][4]).toEqual({ type: 'pawn', color: 'white' });
  });
});
