import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProjectService } from '../../core/services/project.service';
import { AuthService } from '../../core/services/auth.service';
import { Project } from '../../shared/models/project.model';
import { ProjectCreate } from '../projects/project-create/project-create';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ProjectCreate],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {
  projects = signal<Project[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  userName = signal<string>('');
  selectedProjectId = signal<number | null>(null);
  showCreateModal = signal(false);
  sidebarOpen = signal(false);

  constructor(
    private projectService: ProjectService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.userName.set(currentUser?.name || 'there');

    this.loadProjects();
  }

  loadProjects(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.projectService.getProjects().subscribe({
      next: (data) => {
        this.projects.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set('Could not load projects. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  selectProject(project: Project): void {
    this.selectedProjectId.set(project.id);
    this.sidebarOpen.set(false);
    this.router.navigate(['/projects', project.id]);
  }

  toggleSidebar(): void {
    this.sidebarOpen.set(!this.sidebarOpen());
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  goToCreateProject(): void {
    this.showCreateModal.set(true);
    this.sidebarOpen.set(false);
  }

  onProjectCreated(): void {
    this.showCreateModal.set(false);
    this.loadProjects();
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}