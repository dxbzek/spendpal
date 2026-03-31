import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';

const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-finance`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Headers for raw fetch (streaming endpoints). Includes apikey required by Supabase gateway. */
const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in to use AI features');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: ANON_KEY,
  };
};

/** Shared fetch helper with AbortController timeout */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
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

/** Invoke a Supabase edge function with a timeout via AbortController. */
async function invokeWithTimeout<T>(
  fnName: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data, error } = await supabase.functions.invoke<T>(fnName, {
      body,
      signal: controller.signal,
    });
    if (error) {
      // FunctionsHttpError has a context property with the response
      const msg =
        (error as { message?: string }).message ??
        'AI advisor is unavailable. Please try again later.';
      throw new Error(msg);
    }
    return data as T;
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

export interface AdvisorSession {
  id: string;
  session_type: string;
  result: BudgetAnalysis;
  created_at: string;
}

export const useAI = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [summaryText, setSummaryText] = useState('');

  // Streaming — uses raw fetch (supabase.functions.invoke doesn't support SSE)
  const generateSummary = useCallback(async (data: unknown) => {
    setLoading(true);
    setSummaryText('');
    try {
      const headers = await getAuthHeaders();
      const resp = await fetchWithTimeout(FUNC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'summary', data }),
      }, 30_000);

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
      const body = await invokeWithTimeout<{ result?: string }>(
        'ai-finance',
        { type: 'budget-suggestions', data },
        25_000,
      );
      const jsonMatch = body.result?.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]) as unknown[];
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

  const categorizeStatement = useCallback(async (text: string): Promise<unknown[] | null> => {
    setLoading(true);

    const attempt = () =>
      invokeWithTimeout<{ result?: string }>(
        'ai-finance',
        { type: 'categorize-csv', data: text },
        45_000,
      );

    try {
      let body: { result?: string };
      try {
        body = await attempt();
      } catch (firstErr) {
        // Retry once on network-level failures (e.g. cold-start drop, transient error)
        const isNetwork =
          firstErr instanceof TypeError ||
          (firstErr instanceof Error && firstErr.message.includes('Failed to fetch'));
        if (!isNetwork) throw firstErr;
        await new Promise(r => setTimeout(r, 2000));
        body = await attempt();
      }

      const jsonMatch = body.result?.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]) as unknown[];
      return [];
    } catch (e: unknown) {
      logger.error('categorizeStatement failed', e);
      const msg = e instanceof Error ? e.message : 'AI advisor is unavailable. Please try again later.';
      toast.error(msg);
      return null; // null signals a fetch/network error so callers don't show a second toast
    } finally {
      setLoading(false);
    }
  }, []);

  const generateBudgetAnalysis = useCallback(async (data: unknown): Promise<BudgetAnalysis | null> => {
    setLoading(true);
    try {
      const body = await invokeWithTimeout<{ result?: unknown }>(
        'ai-finance',
        { type: 'budget-advisor', data },
        25_000,
      );
      const result = body.result;
      let parsed: BudgetAnalysis | null = null;
      if (result && typeof result === 'object' && 'recommendedMethod' in result) {
        parsed = result as BudgetAnalysis;
      } else if (typeof result === 'string') {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) as BudgetAnalysis;
      }
      if (!parsed) throw new Error('Unexpected response format from AI advisor');

      // Persist to advisor_sessions for history
      if (user) {
        const { error: saveError } = await supabase.from('advisor_sessions').insert({
          user_id: user.id,
          session_type: 'budget-advisor',
          result: parsed as unknown as Json,
        });
        if (saveError) logger.error('Failed to save advisor session', saveError);
      }

      return parsed;
    } catch (e: unknown) {
      logger.error('generateBudgetAnalysis failed', e);
      const msg = e instanceof Error ? e.message : 'AI advisor is unavailable. Please try again later.';
      toast.error(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchAdvisorHistory = useCallback(async (): Promise<AdvisorSession[]> => {
    if (!user) return [];
    const { data, error } = await supabase
      .from('advisor_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      logger.error('Failed to fetch advisor history', error);
      return [];
    }
    return (data ?? []).map(row => ({
      id: row.id,
      session_type: row.session_type,
      result: row.result as unknown as BudgetAnalysis,
      created_at: row.created_at,
    }));
  }, [user]);

  const deleteAdvisorSession = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('advisor_sessions').delete().eq('id', id);
    if (error) logger.error('Failed to delete advisor session', error);
  }, []);

  const categorizeCSV = categorizeStatement;

  return {
    loading, summaryText,
    generateSummary, generateBudgetSuggestions, categorizeStatement, categorizeCSV, generateBudgetAnalysis,
    fetchAdvisorHistory, deleteAdvisorSession,
  };
};
