import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-finance`;

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in to use AI features');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
};

export const useAI = () => {
  const [loading, setLoading] = useState(false);
  const [summaryText, setSummaryText] = useState('');

  const generateSummary = useCallback(async (data: unknown) => {
    setLoading(true);
    setSummaryText('');
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(FUNC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'summary', data }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to generate summary');
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
            const parsed = JSON.parse(jsonStr);
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
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const generateBudgetSuggestions = useCallback(async (data: unknown) => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(FUNC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'budget-suggestions', data }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to generate suggestions');
      }

      const { result } = await resp.json();
      // Parse JSON from the response
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast.error(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const categorizeStatement = useCallback(async (text: string) => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(FUNC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'categorize-csv', data: text }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to categorize transactions');
      }

      const { result } = await resp.json();
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast.error(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep backward compat alias
  const categorizeCSV = categorizeStatement;

  return { loading, summaryText, generateSummary, generateBudgetSuggestions, categorizeStatement, categorizeCSV };
};
