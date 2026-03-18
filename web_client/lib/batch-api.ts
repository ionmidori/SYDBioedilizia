import { fetchWithAuth } from '@/lib/api-client';
import { AggregationAdjustment, QuoteBatch } from '@/types/quote';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

export interface CreateBatchResponse {
  batch_id: string;
  total_projects: number;
  batch_subtotal: number;
  status: string;
}

export interface AggregationPreviewResponse {
  batch_id: string;
  total_savings: number;
  original_combined_subtotal: number;
  optimized_subtotal: number;
  adjustments: AggregationAdjustment[];
}

export const batchApi = {
  /**
   * Create a new quote batch from selected project IDs.
   * Returns batch with cross-project savings preview pre-computed.
   */
  createBatch: async (projectIds: string[]): Promise<CreateBatchResponse> => {
    const response = await fetchWithAuth(`${API_ROOT}/quote/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_ids: projectIds }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Errore nella creazione del batch' }));
      throw new Error(error.detail || 'Errore nella creazione del batch');
    }

    return response.json();
  },

  /**
   * Submit a draft batch to admin for review.
   */
  submitBatch: async (batchId: string): Promise<CreateBatchResponse> => {
    const response = await fetchWithAuth(`${API_ROOT}/quote/batch/${batchId}/submit`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Errore nell\'invio del batch' }));
      throw new Error(error.detail || 'Errore nell\'invio del batch');
    }

    return response.json();
  },

  /**
   * Get batch details including aggregation preview.
   */
  getBatch: async (batchId: string): Promise<QuoteBatch> => {
    const response = await fetchWithAuth(`${API_ROOT}/quote/batch/${batchId}`);

    if (!response.ok) {
      throw new Error('Batch non trovato');
    }

    return response.json();
  },

  /**
   * Get cross-project savings preview for a batch.
   */
  getPreview: async (batchId: string): Promise<AggregationPreviewResponse> => {
    const response = await fetchWithAuth(`${API_ROOT}/quote/batch/${batchId}/preview`);

    if (!response.ok) {
      throw new Error('Preview non disponibile');
    }

    return response.json();
  },

  /**
   * Create batch, show preview, then submit to admin.
   * Returns both the batch response and the preview data.
   */
  createWithPreview: async (projectIds: string[]): Promise<{
    batch: CreateBatchResponse;
    preview: AggregationPreviewResponse;
  }> => {
    const batch = await batchApi.createBatch(projectIds);
    const preview = await batchApi.getPreview(batch.batch_id);
    return { batch, preview };
  },

  /**
   * Create batch and immediately submit it to admin.
   */
  createAndSubmit: async (projectIds: string[]): Promise<CreateBatchResponse> => {
    const batch = await batchApi.createBatch(projectIds);
    return batchApi.submitBatch(batch.batch_id);
  },
};
