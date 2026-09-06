import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';
import { Project } from '../../../shared/models/project.model';
import { Analysis, AnalysisSummary, GitHubBranch, Issue } from '../../../shared/models/analysis.model';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  // Re-analyze state
  branches = signal<GitHubBranch[]>([]);
  selectedBranch = signal<string>('');
  isLoadingBranches = signal(false);
  selectedFile = signal<File | null>(null);
  isReanalyzing = signal(false);
  reanalyzeError = signal<string | null>(null);
  reanalyzeSuccess = signal(false);

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

        if (data.sourceType === 'GitHub') {
          this.loadBranches();
        }
      },
      error: () => {
        this.errorMessage.set('Could not load this project.');
        this.isLoadingProject.set(false);
      }
    });
  }

  loadBranches(): void {
    this.isLoadingBranches.set(true);

    this.projectService.getProjectBranches(this.projectId).subscribe({
      next: (data) => {
        this.branches.set(data);
        this.isLoadingBranches.set(false);

        if (data.length > 0 && !this.selectedBranch()) {
          const defaultBranch = data.find(b => b.name === 'main' || b.name === 'master') ?? data[0];
          this.selectedBranch.set(defaultBranch.name);
        }
      },
      error: () => {
        this.isLoadingBranches.set(false);
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

  shortLocation(issue: Issue): string {
    const normalizedPath = issue.filePath.replace(/\\/g, '/');
    const segments = normalizedPath.split('/');
    const fileName = segments[segments.length - 1] || issue.filePath;

    if (this.isWholeFileIssue(issue)) {
      return fileName;
    }

    return `${fileName}:${issue.lineNumber}`;
  }

  isWholeFileIssue(issue: Issue): boolean {
    return issue.source.startsWith('AI');
  }

  snippetLines(issue: Issue): { num: number; text: string; isTarget: boolean }[] {
    if (!issue.codeSnippet || issue.snippetStartLine == null) {
      return [];
    }

    return issue.codeSnippet.split('\n').map((text, index) => {
      const num = issue.snippetStartLine! + index;
      return { num, text, isTarget: num === issue.lineNumber };
    });
  }

  groupedIssues(analysis: Analysis): { filePath: string; fileName: string; issues: Issue[] }[] {
    const groups = new Map<string, Issue[]>();

    for (const issue of analysis.issues) {
      const existing = groups.get(issue.filePath);
      if (existing) {
        existing.push(issue);
      } else {
        groups.set(issue.filePath, [issue]);
      }
    }

    return Array.from(groups.entries())
      .map(([filePath, issues]) => {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const segments = normalizedPath.split('/');
        const fileName = segments[segments.length - 1] || filePath;
        return { filePath, fileName, issues };
      })
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  }

  githubLineUrl(issue: Issue): string | null {
    const p = this.project();
    if (!p || p.sourceType !== 'GitHub' || !p.repositoryUrl) {
      return null;
    }

    // GitHub's zipball wraps files in a synthetic folder like
    // "owner-repo-shortsha/actual/path.cs" - strip that first segment,
    // since it isn't part of the real repo path GitHub expects in a URL.
    const normalizedPath = issue.filePath.replace(/\\/g, '/');
    const segments = normalizedPath.split('/');
    const relativePath = segments.slice(1).join('/');

    if (!relativePath) {
      return null;
    }

    const branch = this.selectedBranch();
    if (!branch) {
      return null;
    }
    const cleanRepoUrl = p.repositoryUrl.replace(/\/$/, '').replace(/\.git$/, '');

    // Whole-file ML detections don't have a real line number - link to the
    // file itself without a #L anchor, rather than falsely pointing at
    // line 1 as if something specific was found there.
    if (this.isWholeFileIssue(issue)) {
      return `${cleanRepoUrl}/blob/${branch}/${relativePath}`;
    }

    return `${cleanRepoUrl}/blob/${branch}/${relativePath}#L${issue.lineNumber}`;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
      this.reanalyzeError.set(null);
    }
  }

  reanalyzeZip(): void {
    const file = this.selectedFile();
    if (!file) {
      this.reanalyzeError.set('Please select a zip file first.');
      return;
    }

    this.isReanalyzing.set(true);
    this.reanalyzeError.set(null);
    this.reanalyzeSuccess.set(false);

    this.projectService.uploadAndAnalyze(this.projectId, file).subscribe({
      next: (result) => {
        this.isReanalyzing.set(false);
        this.reanalyzeSuccess.set(true);
        this.selectedFile.set(null);
        this.loadAnalysesList();
        this.selectAnalysis(result.analysisId);
      },
      error: (err) => {
        this.isReanalyzing.set(false);
        this.reanalyzeError.set(err.error?.message || 'Re-analysis failed.');
      }
    });
  }

  reanalyzeGitHub(): void {
    const branch = this.selectedBranch();
    if (!branch) {
      this.reanalyzeError.set('Please select a branch first.');
      return;
    }

    this.isReanalyzing.set(true);
    this.reanalyzeError.set(null);
    this.reanalyzeSuccess.set(false);

    this.projectService.analyzeFromGitHub(this.projectId, branch).subscribe({
      next: (result) => {
        this.isReanalyzing.set(false);
        this.reanalyzeSuccess.set(true);
        this.loadAnalysesList();
        this.selectAnalysis(result.analysisId);
      },
      error: (err) => {
        this.isReanalyzing.set(false);
        this.reanalyzeError.set(err.error?.message || 'Re-analysis failed.');
      }
    });
  }

  backToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}