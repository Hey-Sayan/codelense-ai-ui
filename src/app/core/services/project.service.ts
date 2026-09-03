import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Project } from '../../shared/models/project.model';

interface CreateProjectPayload {
  name: string;
  repositoryUrl?: string;
  sourceType: string;
}

export interface AnalysisResultSummary {
  analysisId: number;
  status: string;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private readonly apiUrl = 'https://localhost:7205/api/projects';
  private readonly analyzeUrl = 'https://localhost:7205/api/analyze';

  constructor(private http: HttpClient) {}

  getProjects(): Observable<Project[]> {
    return this.http.get<Project[]>(this.apiUrl);
  }

  getProjectById(id: number): Observable<Project> {
    return this.http.get<Project>(`${this.apiUrl}/${id}`);
  }

  createProject(payload: CreateProjectPayload): Observable<Project> {
    return this.http.post<Project>(this.apiUrl, payload);
  }

  uploadAndAnalyze(projectId: number, file: File): Observable<AnalysisResultSummary> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<AnalysisResultSummary>(
      `${this.analyzeUrl}/upload?projectId=${projectId}`,
      formData
    );
  }
}