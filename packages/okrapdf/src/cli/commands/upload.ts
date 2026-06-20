/**
 * okra upload — Upload a PDF and optionally wait for processing.
 *
 * Usage:
 *   okra upload invoice.pdf                        # local file
 *   okra upload https://sec.gov/filing.pdf         # URL
 *   okra upload invoice.pdf --no-wait              # fire-and-forget
 *   okra upload invoice.pdf --json                 # {"id":"doc-xxx","phase":"complete","pages":42}
 */

import type { OkraClient } from '../../client';
import { OkraRuntimeError } from '../../errors';
import type { OkraJob, UploadInput } from '../../types';
import type { GlobalFlags } from '../output';
import { progress } from '../output';

export interface UploadOpts extends GlobalFlags {
  noWait?: boolean;
  vendorOptions?: Record<string, unknown>;
  waitTimeoutMs?: number;
  fileName?: string;
}

export interface UploadResult {
  object?: 'document_upload';
  id: string;
  document_id?: string;
  phase: string;
  pages?: number;
  job_id?: string | null;
  status_url?: string | null;
  next_actions?: Array<{ cmd: string; why: string }>;
  urls?: {
    full_md: string;
    page_png: string;
    page_md: string;
    completion: string;
    original: string;
  };
}

export async function upload(
  client: OkraClient,
  source: UploadInput,
  opts: UploadOpts,
): Promise<UploadResult> {
  const sourceLabel = typeof source === 'string' ? source : opts.fileName || 'stdin.pdf';
  progress(`Uploading ${sourceLabel}...`, opts.quiet);

  const session = await client.upload(source, {
    ...(opts.fileName ? { fileName: opts.fileName } : {}),
    ...(opts.vendorOptions ? { vendorOptions: opts.vendorOptions } : {}),
  });
  const docId = session.id;
  const job = await latestDocumentParseJob(client, docId);

  progress(`Document ID: ${docId}`, opts.quiet);

  if (opts.noWait) {
    return {
      object: 'document_upload',
      id: docId,
      document_id: docId,
      phase: 'uploading',
      job_id: job?.id ?? null,
      status_url: job?.status_url ?? (job?.id ? `/v1/jobs/${encodeURIComponent(job.id)}` : null),
      next_actions: [
        {
          cmd: job?.id ? `okra jobs wait ${job.id}` : `okra jobs wait ${docId}`,
          why: 'Wait for the Cloudflare Workflow-backed parse job to finish.',
        },
        {
          cmd: `okra documents get ${docId}`,
          why: 'Inspect document phase, page coverage, and recovery hints.',
        },
      ],
    };
  }

  progress('Waiting for processing...', opts.quiet);

  let status;
  try {
    status = await client.wait(docId, {
      pollIntervalMs: 2_000,
      ...(opts.waitTimeoutMs ? { timeoutMs: opts.waitTimeoutMs } : {}),
    });
  } catch (error) {
    if (error instanceof OkraRuntimeError && error.code === 'TIMEOUT') {
      throw new OkraRuntimeError(
        'TIMEOUT',
        error.message,
        error.status,
        {
          document_id: docId,
          job_id: job?.id ?? null,
          status_url: job?.status_url ?? (job?.id ? `/v1/jobs/${encodeURIComponent(job.id)}` : null),
          current: error.details,
        },
      );
    }
    throw error;
  }

  const base = `https://api.okrapdf.com/v1/documents/${docId}`;
  const urls = {
    full_md: `${base}/full.md`,
    page_png: `${base}/d_shimmer/pg_{N}.png`,
    page_md: `${base}/pg_{N}.md`,
    completion: `https://api.okrapdf.com/v1/documents/${docId}/completion`,
    original: `${base}/original.pdf`,
  };

  return {
    object: 'document_upload',
    id: docId,
    document_id: docId,
    phase: status.phase,
    pages: status.pagesTotal,
    job_id: job?.id ?? null,
    status_url: job?.status_url ?? (job?.id ? `/v1/jobs/${encodeURIComponent(job.id)}` : null),
    urls,
  };
}

async function latestDocumentParseJob(client: OkraClient, documentId: string): Promise<OkraJob | null> {
  try {
    const jobs = await client.listJobs({
      documentId,
      type: 'document.parse',
      limit: 1,
    });
    return jobs.data[0] ?? null;
  } catch {
    return null;
  }
}
