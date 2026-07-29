import { Component } from '@angular/core';
import { ChessboardComponent } from './chessboard/chessboard.component';

@Component({
  selector: 'app-root',
  imports: [ChessboardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {}
