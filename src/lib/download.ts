import type { ExportFile } from './export/types';
import { createZip } from './zip';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadFile(file: ExportFile): void {
  triggerDownload(new Blob([file.content], { type: file.mimeType }), file.name);
}

/** Bundle several files into one ZIP so the browser only asks once. */
export function downloadZip(files: ExportFile[], zipName: string): void {
  const zip = createZip(files.map((file) => ({ name: file.name, content: file.content })));
  triggerDownload(new Blob([zip as BlobPart], { type: 'application/zip' }), zipName);
}
