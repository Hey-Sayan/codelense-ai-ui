import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ProjectService, AnalysisResultSummary } from '../../../core/services/project.service';

@Component({
  selector: 'app-project-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './project-create.html',
  styleUrl: './project-create.css'
})
export class ProjectCreate {
  projectForm: FormGroup;
  selectedFile = signal<File | null>(null);
  projectId = signal<number | null>(null);
  isCreatingProject = signal(false);
  isUploading = signal(false);
  errorMessage = signal<string | null>(null);
  analysisResult = signal<AnalysisResultSummary | null>(null);

  constructor(
    private fb: FormBuilder,
    private projectService: ProjectService,
    private router: Router
  ) {
    this.projectForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      sourceType: ['Zip', [Validators.required]]
    });
  }

  onCreateProject(): void {
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isCreatingProject.set(true);

    this.projectService.createProject(this.projectForm.value).subscribe({
      next: (project) => {
        this.isCreatingProject.set(false);
        this.projectId.set(project.id);
      },
      error: (err) => {
        this.isCreatingProject.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to create project.');
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
    }
  }

  onUpload(): void {
    const file = this.selectedFile();
    const id = this.projectId();

    if (!file || !id) {
      return;
    }

    this.errorMessage.set(null);
    this.isUploading.set(true);

    this.projectService.uploadAndAnalyze(id, file).subscribe({
      next: (result) => {
        this.isUploading.set(false);
        this.analysisResult.set(result);
      },
      error: (err) => {
        this.isUploading.set(false);
        this.errorMessage.set(err.error?.message || 'Upload or analysis failed.');
      }
    });
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}