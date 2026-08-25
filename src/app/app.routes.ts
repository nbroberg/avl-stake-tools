import type { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { LoginComponent } from './auth/login.component';
import { AccessDeniedComponent } from './auth/access-denied.component';
import { DiagnosticsComponent } from './pages/diagnostics.component';
import { LayoutComponent } from './layout/layout.component';
import { DashboardComponent } from './pages/dashboard.component';
import { CallingsListComponent } from './pages/callings/callings-list.component';
import { NewCallingComponent } from './pages/callings/new-calling.component';
import { CallingDetailComponent } from './pages/callings/calling-detail.component';
import { PeopleListComponent } from './pages/people/people-list.component';
import { RosterImportComponent } from './pages/people/roster-import.component';
import { ScopeComponent } from './pages/scope/scope.component';

export const routes: Routes = [
  // Public routes - no sign-in required.
  { path: 'login', component: LoginComponent },
  { path: 'access-denied', component: AccessDeniedComponent },
  { path: 'diagnostics', component: DiagnosticsComponent },

  // Everything else requires an authenticated + authorized account.
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: DashboardComponent },
      { path: 'callings', component: CallingsListComponent },
      { path: 'callings/new', component: NewCallingComponent },
      { path: 'callings/:id', component: CallingDetailComponent },
      { path: 'scope', component: ScopeComponent },
      { path: 'people', component: PeopleListComponent },
      { path: 'people/import', component: RosterImportComponent },
    ],
  },

  { path: '**', redirectTo: '' },
];
