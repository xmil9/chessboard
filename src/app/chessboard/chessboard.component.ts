import { Component, computed, signal } from '@angular/core';
import {
  applySanSequence,
  Coord,
  GameState,
  oppositeColor,
} from '../chess/san';
import {
  Board,
  ChessPiece,
  FILES,
  InteractionMode,
  PIECE_TYPES,
  PieceColor,
  PieceType,
  RANKS,
  cloneBoard,
  createEmptyBoard,
  createStartingBoard,
  pieceSymbol,
} from '../models/chess.models';

@Component({
  selector: 'app-chessboard',
  standalone: true,
  templateUrl: './chessboard.component.html',
  styleUrl: './chessboard.component.css',
})
export class ChessboardComponent {
  readonly files = FILES;
  readonly ranks = RANKS;
  readonly pieceTypes = PIECE_TYPES;

  readonly board = signal<Board>(createStartingBoard());
  readonly sideToMove = signal<PieceColor>('white');
  readonly enPassant = signal<Coord | null>(null);
  readonly mode = signal<InteractionMode>('move');
  readonly selectedSquare = signal<{ row: number; col: number } | null>(null);
  readonly selectedPalettePiece = signal<ChessPiece>({
    type: 'pawn',
    color: 'white',
  });
  readonly dragFrom = signal<{ row: number; col: number } | null>(null);
  readonly notationText = signal('');
  readonly notationMessage = signal<string | null>(null);
  readonly notationError = signal(false);

  readonly modeLabel = computed(() => {
    switch (this.mode()) {
      case 'move':
        return 'Click a piece, then a square to move it. Or drag pieces.';
      case 'add':
        return 'Pick a piece below, then click a square to place it.';
      case 'remove':
        return 'Click a piece on the board to remove it.';
    }
  });

  setMode(mode: InteractionMode): void {
    this.mode.set(mode);
    this.selectedSquare.set(null);
  }

  selectPalettePiece(type: PieceType, color: PieceColor): void {
    this.selectedPalettePiece.set({ type, color });
    this.mode.set('add');
    this.selectedSquare.set(null);
  }

  isPaletteSelected(type: PieceType, color: PieceColor): boolean {
    const selected = this.selectedPalettePiece();
    return (
      this.mode() === 'add' &&
      selected.type === type &&
      selected.color === color
    );
  }

  isLightSquare(row: number, col: number): boolean {
    return (row + col) % 2 === 0;
  }

  isSelected(row: number, col: number): boolean {
    const selected = this.selectedSquare();
    return !!selected && selected.row === row && selected.col === col;
  }

  symbolAt(row: number, col: number): string {
    const piece = this.board()[row][col];
    return piece ? pieceSymbol(piece) : '';
  }

  onSquareClick(row: number, col: number): void {
    const mode = this.mode();

    if (mode === 'add') {
      this.placePiece(row, col, this.selectedPalettePiece());
      return;
    }

    if (mode === 'remove') {
      this.removePiece(row, col);
      return;
    }

    const selected = this.selectedSquare();
    const piece = this.board()[row][col];

    if (!selected) {
      if (piece) {
        this.selectedSquare.set({ row, col });
      }
      return;
    }

    if (selected.row === row && selected.col === col) {
      this.selectedSquare.set(null);
      return;
    }

    this.movePiece(selected.row, selected.col, row, col);
    this.selectedSquare.set(null);
  }

  onSquareContextMenu(event: MouseEvent, row: number, col: number): void {
    event.preventDefault();
    this.removePiece(row, col);
    this.selectedSquare.set(null);
  }

  onDragStart(event: DragEvent, row: number, col: number): void {
    if (this.mode() !== 'move' || !this.board()[row][col]) {
      event.preventDefault();
      return;
    }

    this.dragFrom.set({ row, col });
    this.selectedSquare.set({ row, col });
    event.dataTransfer?.setData('text/plain', `${row},${col}`);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent): void {
    if (this.mode() === 'move') {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    }
  }

  onDrop(event: DragEvent, row: number, col: number): void {
    event.preventDefault();
    const from = this.dragFrom();
    if (!from || this.mode() !== 'move') {
      return;
    }

    if (from.row !== row || from.col !== col) {
      this.movePiece(from.row, from.col, row, col);
    }

    this.dragFrom.set(null);
    this.selectedSquare.set(null);
  }

  onDragEnd(): void {
    this.dragFrom.set(null);
  }

  resetBoard(): void {
    this.board.set(createStartingBoard());
    this.sideToMove.set('white');
    this.enPassant.set(null);
    this.selectedSquare.set(null);
    this.notationMessage.set(null);
    this.notationError.set(false);
  }

  clearBoard(): void {
    this.board.set(createEmptyBoard());
    this.sideToMove.set('white');
    this.enPassant.set(null);
    this.selectedSquare.set(null);
    this.notationMessage.set(null);
    this.notationError.set(false);
  }

  onNotationInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.notationText.set(value);
  }

  toggleSideToMove(): void {
    this.sideToMove.update((side) => oppositeColor(side));
    this.enPassant.set(null);
  }

  applyNotation(): void {
    const text = this.notationText().trim();
    if (!text) {
      this.notationError.set(true);
      this.notationMessage.set('Enter one or more moves in algebraic notation.');
      return;
    }

    const result = applySanSequence(this.gameState(), text);
    this.applyGameState(result.state);
    this.selectedSquare.set(null);

    if (result.error) {
      this.notationError.set(true);
      this.notationMessage.set(result.error);
      return;
    }

    this.notationError.set(false);
    this.notationMessage.set(
      `Played ${result.applied.length} move${result.applied.length === 1 ? '' : 's'}: ${result.applied.join(' ')}`
    );
    this.notationText.set('');
  }

  private gameState(): GameState {
    return {
      board: this.board(),
      sideToMove: this.sideToMove(),
      enPassant: this.enPassant(),
    };
  }

  private applyGameState(state: GameState): void {
    this.board.set(state.board);
    this.sideToMove.set(state.sideToMove);
    this.enPassant.set(state.enPassant);
  }

  private movePiece(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number
  ): void {
    this.board.update((board) => {
      const next = cloneBoard(board);
      next[toRow][toCol] = next[fromRow][fromCol];
      next[fromRow][fromCol] = null;
      return next;
    });
    this.enPassant.set(null);
  }

  private placePiece(row: number, col: number, piece: ChessPiece): void {
    this.board.update((board) => {
      const next = cloneBoard(board);
      next[row][col] = { ...piece };
      return next;
    });
  }

  private removePiece(row: number, col: number): void {
    if (!this.board()[row][col]) {
      return;
    }

    this.board.update((board) => {
      const next = cloneBoard(board);
      next[row][col] = null;
      return next;
    });
  }

  paletteSymbol(type: PieceType, color: PieceColor): string {
    return pieceSymbol({ type, color });
  }
}
