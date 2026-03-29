import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-finance`;
const AI_TIMEOUT_MS = 10_000;

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in to use AI features');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
};

/** Shared fetch helper with AbortController timeout */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = AI_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('AI advisor is taking too long — please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface BudgetAnalysis {
  recommendedMethod: 'envelope' | '50-30-20' | 'zero-based' | 'hybrid';
  methodReason: string;
  healthScore: number;
  healthBreakdown: {
    savingsRatio: number;
    expenseStability: number;
    budgetAdherence: number;
    debtManagement: number;
  };
  insights: Array<{
    type: 'warning' | 'positive' | 'suggestion';
    title: string;
    description: string;
  }>;
  suggestedEnvelopes: Array<{
    category: string;
    icon: string;
    amount: number;
    currentSpending: number;
  }>;
  simulation: {
    envelope: number;
    fiftyThirtyTwenty: number;
    zeroBased: number;
    hybrid: number;
  };
  dynamicAdjustments: Array<{
    action: string;
    impact: string;
  }>;
}

export const useAI = () => {
  const [loading, setLoading] = useState(false);
  const [summaryText, setSummaryText] = useState('');

  const generateSummary = useCallback(async (data: unknown) => {
    setLoading(true);
    setSummaryText('');
    try {
      const headers = await getAuthHeaders();
      const resp = await fetchWithTimeout(FUNC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'summary', data }),
      }, 30_000); // streaming needs a longer timeout

      if (!resp.ok) {
        const err = await resp.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to generate summary');
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr) as { choices?: Array<{ delta?: { content?: string } }> };
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setSummaryText(fullText);
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (e: unknown) {
      logger.error('generateSummary failed', e);
      const msg = e instanceof Error ? e.message : 'AI advisor is unavailable. Please try again later.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const generateBudgetSuggestions = useCallback(async (data: unknown): Promise<unknown[]> => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetchWithTimeout(FUNC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'budget-suggestions', data }),
      });

      if (!resp.ok) {
        const err = await resp.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to generate suggestions');
      }

      const body = await resp.json() as { result?: string };
      const jsonMatch = body.result?.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as unknown[];
      }
      return [];
    } catch (e: unknown) {
      logger.error('generateBudgetSuggestions failed', e);
      const msg = e instanceof Error ? e.message : 'AI advisor is unavailable. Please try again later.';
      toast.error(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const categorizeStatement = useCallback(async (text: string): Promise<unknown[]> => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetchWithTimeout(FUNC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'categorize-csv', data: text }),
      }, 30_000); // large statements need more time

      if (!resp.ok) {
        const err = await resp.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to categorize transactions');
      }

      const body = await resp.json() as { result?: string };
      const jsonMatch = body.result?.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as unknown[];
      }
      return [];
    } catch (e: unknown) {
      logger.error('categorizeStatement failed', e);
      const msg = e instanceof Error ? e.message : 'AI advisor is unavailable. Please try again later.';
      toast.error(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const generateBudgetAnalysis = useCallback(async (data: unknown): Promise<BudgetAnalysis | null> => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetchWithTimeout(FUNC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'budget-advisor', data }),
      });

      if (!resp.ok) {
        const err = await resp.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to generate budget analysis');
      }

      const body = await resp.json() as { result?: unknown };
      const result = body.result;
      if (result && typeof result === 'object' && 'recommendedMethod' in result) {
        return result as BudgetAnalysis;
      }
      if (typeof result === 'string') {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]) as BudgetAnalysis;
      }
      throw new Error('Unexpected response format from AI advisor');
    } catch (e: unknown) {
      logger.error('generateBudgetAnalysis failed', e);
      const msg = e instanceof Error ? e.message : 'AI advisor is unavailable. Please try again later.';
      toast.error(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const categorizeCSV = categorizeStatement;

  return { loading, summaryText, generateSummary, generateBudgetSuggestions, categorizeStatement, categorizeCSV, generateBudgetAnalysis };
};
