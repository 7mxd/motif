import { Routes } from '@angular/router';
import { Shifts } from './shifts/shifts';

export const routes: Routes = [
  { path: '', component: Shifts },
  { path: 'shifts/:id', loadComponent: () => import('./shift/shift').then((m) => m.ShiftPage) },
  { path: 'my-shifts', loadComponent: () => import('./my-shifts/my-shifts').then((m) => m.MyShifts) },
  { path: 'sign-in', loadComponent: () => import('./sign-in/sign-in').then((m) => m.SignIn) },
  { path: '**', loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound) },
];
