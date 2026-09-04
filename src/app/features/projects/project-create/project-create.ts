import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProjectService, AnalysisResultSummary } from '../../../core/services/project.service';

@Component({
  selector: 'app-project-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './project-create.html',
  styleUrl: './project-create.css'
})
export class ProjectCreate {
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  projectForm: FormGroup;
  selectedFile = signal<File | null>(null);
  fileError = signal<string | null>(null);
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);
  analysisResult = signal<AnalysisResultSummary | null>(null);
  githubPending = signal(false);

  constructor(
    private fb: FormBuilder,
    private projectService: ProjectService
  ) {
    this.projectForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      sourceType: ['Zip', [Validators.required]],
      repositoryUrl: ['']
    });

    this.projectForm.get('sourceType')?.valueChanges.subscribe((type) => {
      const urlControl = this.projectForm.get('repositoryUrl');
      if (type === 'GitHub') {
        urlControl?.setValidators([Validators.required, Validators.pattern(/^https:\/\/github\.com\/.+/)]);
      } else {
        urlControl?.clearValidators();
      }
      urlControl?.updateValueAndValidity();
      this.selectedFile.set(null);
      this.fileError.set(null);
    });
  }

  get sourceType(): string {
    return this.projectForm.get('sourceType')?.value;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
      this.fileError.set(null);
    }
  }

  onSubmit(): void {
    if (this.sourceType === 'Zip' && !this.selectedFile()) {
      this.fileError.set('Please select a zip file to upload.');
    }

    if (this.projectForm.invalid || (this.sourceType === 'Zip' && !this.selectedFile())) {
      this.projectForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    const payload = {
      name: this.projectForm.value.name,
      sourceType: this.sourceType,
      repositoryUrl: this.sourceType === 'GitHub' ? this.projectForm.value.repositoryUrl : undefined
    };

    this.projectService.createProject(payload).subscribe({
      next: (project) => {
        if (this.sourceType === 'Zip') {
          this.uploadAndAnalyze(project.id);
        } else {
          this.isSubmitting.set(false);
          this.githubPending.set(true);
          this.created.emit();
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to create project.');
      }
    });
  }

  private uploadAndAnalyze(projectId: number): void {
    const file = this.selectedFile();
    if (!file) {
      this.isSubmitting.set(false);
      return;
    }

    this.projectService.uploadAndAnalyze(projectId, file).subscribe({
      next: (result) => {
        this.isSubmitting.set(false);
        this.analysisResult.set(result);
        this.created.emit();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.message || 'Upload or analysis failed.');
      }
    });
  }

  onClose(): void {
    this.closed.emit();
  }
}