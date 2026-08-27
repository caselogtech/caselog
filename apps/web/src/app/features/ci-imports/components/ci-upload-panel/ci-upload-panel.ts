import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { JUnitUploadResponse, TestRunSummary } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Button,
  Callout,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
} from '../../../../shared/ui/public-api';

const MAX_BROWSER_UPLOAD_BYTES = 250 * 1024 * 1024;

export interface CiUploadRequest {
  runId: string;
  file: File;
  metadata: { pipeline?: string; branch?: string };
}

@Component({
  selector: 'app-ci-upload-panel',
  imports: [
    Button,
    Callout,
    DecimalPipe,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './ci-upload-panel.html',
  styleUrl: './ci-upload-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CiUploadPanel {
  readonly activeRuns = input.required<ReadonlyArray<TestRunSummary>>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly canUpload = input(false);
  readonly runsLoading = input(false);
  readonly runsFailed = input(false);
  readonly runsErrorMessage = input('');
  readonly uploadPending = input(false);
  readonly uploadFailed = input(false);
  readonly uploadErrorMessage = input('');
  readonly result = input<JUnitUploadResponse | null>(null);

  readonly retryRuns = output<void>();
  readonly selectionChanged = output<void>();
  readonly upload = output<CiUploadRequest>();

  readonly selectedRunId = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal<'type' | 'size' | null>(null);
  readonly dragActive = signal(false);
  readonly pipelineControl = new FormControl('', { nonNullable: true });
  readonly branchControl = new FormControl('', { nonNullable: true });
  readonly effectiveRunId = computed(() => this.selectedRunId() || this.activeRuns()[0]?.id || '');

  constructor() {
    effect(() => {
      if (this.result()) this.selectedFile.set(null);
    });
  }

  selectRun(value: string): void {
    this.selectedRunId.set(value);
  }

  selectFile(file: File | undefined): void {
    this.selectionChanged.emit();
    if (!file) {
      this.selectedFile.set(null);
      return;
    }
    if (file.size > MAX_BROWSER_UPLOAD_BYTES) {
      this.selectedFile.set(null);
      this.fileError.set('size');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.xml')) {
      this.selectedFile.set(null);
      this.fileError.set('type');
      return;
    }
    this.fileError.set(null);
    this.selectedFile.set(file);
  }

  handleFileInput(event: Event): void {
    const fileInput = event.target as HTMLInputElement;
    this.selectFile(fileInput.files?.[0]);
    fileInput.value = '';
  }

  handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    this.selectFile(event.dataTransfer?.files[0]);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (this.canUpload()) this.dragActive.set(true);
  }

  uploadReport(): void {
    const runId = this.effectiveRunId();
    const file = this.selectedFile();
    if (!this.canUpload() || !runId || !file || this.uploadPending()) return;
    this.upload.emit({
      runId,
      file,
      metadata: {
        pipeline: this.pipelineControl.value.trim() || undefined,
        branch: this.branchControl.value.trim() || undefined,
      },
    });
  }
}
