export interface Project {
  id: number;
  name: string;
  repositoryUrl: string | null;
  sourceType: string;
  createdAt: string;
  analysisCount: number;
}