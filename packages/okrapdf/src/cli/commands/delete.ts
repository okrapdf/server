/**
 * okra delete — Delete a document.
 *
 * Usage:
 *   okra delete <docId>
 *   okra delete <docId> --json
 */

import type { OkraClient } from '../../client';
import type { DeleteDocumentResult } from '../../types';
import type { GlobalFlags } from '../output';

export async function deleteDocument(
  client: OkraClient,
  documentId: string,
  _opts: GlobalFlags,
): Promise<DeleteDocumentResult> {
  return client.deleteDocument(documentId);
}
