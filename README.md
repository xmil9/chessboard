# Chessboard

Interactive Angular chessboard for arranging pieces. There is **no chess logic** — pieces can be moved, added, and removed freely.

## Features

- 8×8 board with a standard starting setup
- **Move** — click a piece then a square, or drag and drop
- **Add** — pick a piece from the palette and click a square
- **Remove** — use Remove mode, or right-click a square
- **Reset** / **Clear** — restore the starting position or empty the board

## Algebraic notation

Paste one or more SAN moves into the notation field and click **Play moves**:

```text
e4 e5 Nf3 Nc6
1. e4 e5 2. Nf3 Nc6 3. Bb5 a6
O-O Nf6
```

Supports castling (`O-O` / `O-O-O`), captures, promotions (`e8=Q`), and disambiguation (`Nbd7`, `R1a3`). Moves are applied for the current side to move (toggleable). If a move in a sequence fails, earlier moves in that sequence are still kept.

## Development

```bash
npm start
```

Open `http://localhost:4200/`.

## Build

```bash
npm run build
```
