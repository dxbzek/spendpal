import { useEffect } from 'react';

/**
 * Ask search engines not to index the page that is showing. Every unknown
 * address answers 200 with the app shell, so without this a crawler files the
 * "not found" page under each bad link it follows. The tag is removed again
 * when the page goes away, so real pages stay indexable.
 */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
}
