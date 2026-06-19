import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  template: ''
})
export class AppComponent implements OnInit {
  ngOnInit() {
    window.location.href = '/assets/login.html';
  }
}