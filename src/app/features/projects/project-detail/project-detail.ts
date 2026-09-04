import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';
import { Project } from '../../../shared/models/project.model';
import { Analysis, AnalysisSummary } from '../../../shared/models/analysis.model';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css'
})
export class ProjectDetail implements OnInit {
  project = signal<Project | null>(null);
  analysesList = signal<AnalysisSummary[]>([]);
  selectedAnalysis = signal<Analysis | null>(null);
  expandedIssueId = signal<number | null>(null);

  isLoadingProject = signal(true);
  isLoadingAnalyses = signal(true);
  isLoadingDetail = signal(false);
  errorMessage = signal<string | null>(null);

  private projectId!: number;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService
  ) {}

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));

    if (!this.projectId) {
      this.errorMessage.set('Invalid project id.');
      this.isLoadingProject.set(false);
      this.isLoadingAnalyses.set(false);
      return;
    }

    this.loadProject();
    this.loadAnalysesList();
  }

  loadProject(): void {
    this.isLoadingProject.set(true);

    this.projectService.getProjectById(this.projectId).subscribe({
      next: (data) => {
        this.project.set(data);
        this.isLoadingProject.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load this project.');
        this.isLoadingProject.set(false);
      }
    });
  }

  loadAnalysesList(): void {
    this.isLoadingAnalyses.set(true);

    this.projectService.getProjectAnalyses(this.projectId).subscribe({
      next: (data) => {
        this.analysesList.set(data);
        this.isLoadingAnalyses.set(false);

        if (data.length > 0) {
          this.selectAnalysis(data[0].id);
        }
      },
      error: () => {
        this.errorMessage.set('Could not load analysis history.');
        this.isLoadingAnalyses.set(false);
      }
    });
  }

  selectAnalysis(analysisId: number): void {
    this.isLoadingDetail.set(true);
    this.expandedIssueId.set(null);

    this.projectService.getAnalysisById(analysisId).subscribe({
      next: (data) => {
        this.selectedAnalysis.set(data);
        
        this.isLoadingDetail.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load analysis details.');
        this.isLoadingDetail.set(false);
      }
    });
  }

  toggleIssue(issueId: number): void {
    this.expandedIssueId.set(this.expandedIssueId() === issueId ? null : issueId);
  }

  severityClass(severity: string): string {
    return severity.toLowerCase();
  }

  backToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}