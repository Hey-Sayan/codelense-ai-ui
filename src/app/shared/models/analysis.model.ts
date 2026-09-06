export interface Issue {
  id: number;
  filePath: string;
  lineNumber: number;
  severity: string;
  category: string;
  title: string;
  description: string;
  suggestion: string | null;
  fixedCode: string | null;
  source: string;
}

export interface Analysis {
  id: number;
  projectId: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  issues: Issue[];
}

export interface AnalysisSummary {
  id: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export interface GitHubBranch {
  name: string;
}