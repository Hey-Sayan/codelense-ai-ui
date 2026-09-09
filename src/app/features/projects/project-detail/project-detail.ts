import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';
import { Project } from '../../../shared/models/project.model';
import {
  Analysis,
  AnalysisSummary,
  GitHubBranch,
  Issue
} from '../../../shared/models/analysis.model';

interface CodePreviewLine {
  num: number;
  text: string;
  isTarget: boolean;
  issues: Issue[];
}

type DiffLineType = 'added' | 'removed' | 'unchanged';

interface DiffLine {
  type: DiffLineType;
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

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
  suggestingIssueIds = signal<Set<number>>(new Set());

  isLoadingProject = signal(true);
  isLoadingAnalyses = signal(true);
  isLoadingDetail = signal(false);
  errorMessage = signal<string | null>(null);

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
          const defaultBranch =
            data.find(b => b.name === 'main' || b.name === 'master') ?? data[0];

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
    this.expandedIssueId.set(
      this.expandedIssueId() === issueId ? null : issueId
    );
  }

  severityClass(severity: string): string {
    return (severity || 'Medium').toLowerCase();
  }

  shortLocation(issue: Issue): string {
    const normalizedPath = issue.filePath.replace(/\\/g, '/');
    const segments = normalizedPath.split('/');
    const fileName = segments[segments.length - 1] || issue.filePath;

    if (this.isWholeFileIssue(issue)) {
      return `${fileName} · whole file`;
    }

    return `${fileName}:${issue.lineNumber}`;
  }

  isWholeFileIssue(issue: Issue): boolean {
    return issue.source === 'ML' || !issue.lineNumber || issue.lineNumber <= 0;
  }

  isSuggesting(issueId: number): boolean {
    return this.suggestingIssueIds().has(issueId);
  }

  requestAiSuggestion(issue: Issue): void {
    if (this.isSuggesting(issue.id)) {
      return;
    }

    const loading = new Set(this.suggestingIssueIds());
    loading.add(issue.id);
    this.suggestingIssueIds.set(loading);

    this.projectService.generateAiSuggestion(issue.id).subscribe({
      next: (updatedIssue) => {
        const current = this.selectedAnalysis();

        if (current) {
          const updatedIssues = current.issues.map(i =>
            i.id === updatedIssue.id ? updatedIssue : i
          );

          this.selectedAnalysis.set({
            ...current,
            issues: updatedIssues
          });
        }

        const stillLoading = new Set(this.suggestingIssueIds());
        stillLoading.delete(issue.id);
        this.suggestingIssueIds.set(stillLoading);
      },
      error: () => {
        const stillLoading = new Set(this.suggestingIssueIds());
        stillLoading.delete(issue.id);
        this.suggestingIssueIds.set(stillLoading);
      }
    });
  }

  snippetLines(
    issue: Issue
  ): { num: number; text: string; isTarget: boolean }[] {
    if (!issue.codeSnippet || issue.snippetStartLine == null) {
      return [];
    }

    return issue.codeSnippet.split('\n').map((text, index) => {
      const num = issue.snippetStartLine! + index;

      return {
        num,
        text,
        isTarget: num === issue.lineNumber
      };
    });
  }

  /*
   * ============================================================
   * DIFF VIEW
   * ============================================================
   *
   * Compares CodeSnippet with FixedCode and creates a unified
   * diff similar to GitHub / Aikido-style code previews.
   *
   * Removed lines:
   *   - old code
   *
   * Added lines:
   *   + new code
   *
   * Unchanged lines:
   *     existing code
   */

  fixDiffLines(issue: Issue): DiffLine[] {
    if (!issue.codeSnippet || !issue.fixedCode) {
      return [];
    }

    const oldLines = this.normaliseDiffText(issue.codeSnippet);
    const newLines = this.normaliseDiffText(issue.fixedCode);

    if (oldLines.length === 0 && newLines.length === 0) {
      return [];
    }

    /*
     * If the generated fixed code is exactly the same as the
     * original snippet, show it as unchanged instead of making
     * the user think something was modified.
     */
    if (oldLines.join('\n') === newLines.join('\n')) {
      return oldLines.map((text, index) => ({
        type: 'unchanged',
        text,
        oldLineNumber: this.getSnippetLineNumber(issue, index),
        newLineNumber: this.getSnippetLineNumber(issue, index)
      }));
    }

    /*
     * Build an LCS matrix.
     *
     * This allows us to correctly handle:
     * - inserted lines
     * - deleted lines
     * - replaced lines
     * - multiple changes
     *
     * We deliberately keep this local instead of adding an
     * external npm dependency.
     */
    const matrix: number[][] = Array.from(
      { length: oldLines.length + 1 },
      () => new Array<number>(newLines.length + 1).fill(0)
    );

    for (let i = oldLines.length - 1; i >= 0; i--) {
      for (let j = newLines.length - 1; j >= 0; j--) {
        if (oldLines[i] === newLines[j]) {
          matrix[i][j] = matrix[i + 1][j + 1] + 1;
        } else {
          matrix[i][j] = Math.max(
            matrix[i + 1][j],
            matrix[i][j + 1]
          );
        }
      }
    }

    const result: DiffLine[] = [];

    let oldIndex = 0;
    let newIndex = 0;

    while (
      oldIndex < oldLines.length &&
      newIndex < newLines.length
    ) {
      if (oldLines[oldIndex] === newLines[newIndex]) {
        result.push({
          type: 'unchanged',
          text: oldLines[oldIndex],
          oldLineNumber: this.getSnippetLineNumber(issue, oldIndex),
          newLineNumber: this.getSnippetLineNumber(issue, newIndex)
        });

        oldIndex++;
        newIndex++;
        continue;
      }

      if (matrix[oldIndex + 1][newIndex] >= matrix[oldIndex][newIndex + 1]) {
        result.push({
          type: 'removed',
          text: oldLines[oldIndex],
          oldLineNumber: this.getSnippetLineNumber(issue, oldIndex),
          newLineNumber: null
        });

        oldIndex++;
      } else {
        result.push({
          type: 'added',
          text: newLines[newIndex],
          oldLineNumber: null,
          newLineNumber: this.getSnippetLineNumber(issue, newIndex)
        });

        newIndex++;
      }
    }

    while (oldIndex < oldLines.length) {
      result.push({
        type: 'removed',
        text: oldLines[oldIndex],
        oldLineNumber: this.getSnippetLineNumber(issue, oldIndex),
        newLineNumber: null
      });

      oldIndex++;
    }

    while (newIndex < newLines.length) {
      result.push({
        type: 'added',
        text: newLines[newIndex],
        oldLineNumber: null,
        newLineNumber: this.getSnippetLineNumber(issue, newIndex)
      });

      newIndex++;
    }

    return result;
  }

  private normaliseDiffText(value: string): string[] {
    return value
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line, index, lines) => {
        /*
         * Remove only the final empty line created by a trailing
         * newline. Empty lines inside the code are preserved.
         */
        return !(index === lines.length - 1 && line === '');
      });
  }

  private getSnippetLineNumber(issue: Issue, index: number): number | null {
    if (issue.snippetStartLine == null) {
      return null;
    }

    return issue.snippetStartLine + index;
  }

  /*
   * Returns true when the issue has enough information to display
   * the red/green diff view.
   */
  hasFixDiff(issue: Issue): boolean {
    return !!(
      issue.codeSnippet &&
      issue.codeSnippet.trim().length > 0 &&
      issue.fixedCode &&
      issue.fixedCode.trim().length > 0
    );
  }

  /*
   * Returns true when there is an affected code snippet but no
   * generated fix yet.
   */
  hasSnippetWithoutFix(issue: Issue): boolean {
    return !!(
      issue.codeSnippet &&
      issue.codeSnippet.trim().length > 0 &&
      !this.hasFixDiff(issue)
    );
  }

  hasCodePreview(issues: Issue[]): boolean {
    return issues.some(
      issue =>
        issue.codeSnippet &&
        issue.snippetStartLine != null
    );
  }

  codePreviewLines(issues: Issue[]): CodePreviewLine[] {
    const lineMap = new Map<number, CodePreviewLine>();

    for (const issue of issues) {
      if (!issue.codeSnippet || issue.snippetStartLine == null) {
        continue;
      }

      const lines = issue.codeSnippet.split('\n');

      lines.forEach((text, index) => {
        const num = issue.snippetStartLine! + index;
        const existing = lineMap.get(num);

        if (existing) {
          if (!existing.issues.some(i => i.id === issue.id)) {
            existing.issues.push(issue);
          }

          if (num === issue.lineNumber) {
            existing.isTarget = true;
          }
        } else {
          lineMap.set(num, {
            num,
            text,
            isTarget: num === issue.lineNumber,
            issues: [issue]
          });
        }
      });
    }

    return Array.from(lineMap.values()).sort(
      (a, b) => a.num - b.num
    );
  }

  lineIssueLabel(line: CodePreviewLine): string {
    const targetIssues = line.issues.filter(
      issue => issue.lineNumber === line.num
    );

    if (targetIssues.length === 0) {
      return '';
    }

    return targetIssues
      .map(issue => issue.category || 'Issue')
      .join(' + ');
  }

  lineSeverity(line: CodePreviewLine): string {
    const targetIssues = line.issues.filter(
      issue => issue.lineNumber === line.num
    );

    if (targetIssues.length === 0) {
      return '';
    }

    const ranks: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };

    return targetIssues
      .map(issue => issue.severity?.toLowerCase() || 'medium')
      .sort(
        (a, b) =>
          (ranks[b] || 0) - (ranks[a] || 0)
      )[0];
  }

  groupedIssues(
    analysis: Analysis
  ): {
    filePath: string;
    fileName: string;
    issues: Issue[];
  }[] {
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
        const fileName =
          segments[segments.length - 1] || filePath;

        return {
          filePath,
          fileName,
          issues: issues.sort((a, b) => {
            if (this.isWholeFileIssue(a)) {
              return 1;
            }

            if (this.isWholeFileIssue(b)) {
              return -1;
            }

            return (a.lineNumber || 0) - (b.lineNumber || 0);
          })
        };
      })
      .sort((a, b) =>
        a.fileName.localeCompare(b.fileName)
      );
  }

  githubLineUrl(issue: Issue): string | null {
    const p = this.project();

    if (
      !p ||
      p.sourceType !== 'GitHub' ||
      !p.repositoryUrl
    ) {
      return null;
    }

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

    const cleanRepoUrl = p.repositoryUrl
      .replace(/\/$/, '')
      .replace(/\.git$/, '');

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
      this.reanalyzeError.set(
        'Please select a zip file first.'
      );
      return;
    }

    this.isReanalyzing.set(true);
    this.reanalyzeError.set(null);
    this.reanalyzeSuccess.set(false);

    this.projectService
      .uploadAndAnalyze(this.projectId, file)
      .subscribe({
        next: (result) => {
          this.isReanalyzing.set(false);
          this.reanalyzeSuccess.set(true);
          this.selectedFile.set(null);

          this.loadAnalysesList();
          this.selectAnalysis(result.analysisId);
        },
        error: (err) => {
          this.isReanalyzing.set(false);
          this.reanalyzeError.set(
            err.error?.message ||
            'Re-analysis failed.'
          );
        }
      });
  }

  reanalyzeGitHub(): void {
    const branch = this.selectedBranch();

    if (!branch) {
      this.reanalyzeError.set(
        'Please select a branch first.'
      );
      return;
    }

    this.isReanalyzing.set(true);
    this.reanalyzeError.set(null);
    this.reanalyzeSuccess.set(false);

    this.projectService
      .analyzeFromGitHub(
        this.projectId,
        branch
      )
      .subscribe({
        next: (result) => {
          this.isReanalyzing.set(false);
          this.reanalyzeSuccess.set(true);

          this.loadAnalysesList();
          this.selectAnalysis(result.analysisId);
        },
        error: (err) => {
          this.isReanalyzing.set(false);
          this.reanalyzeError.set(
            err.error?.message ||
            'Re-analysis failed.'
          );
        }
      });
  }

  backToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}