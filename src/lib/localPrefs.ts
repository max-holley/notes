/**
 * The only localStorage keys the app uses: theme mode (MUI's own key), font, accent
 * (all for flash-free first paint) and a "signed in before" hint. No note data, no tokens.
 */
export const LS = {
  mode: 'mui-mode',
  font: 'notes-font',
  accent: 'notes-accent',
  signedInBefore: 'notes-signed-in-before',
} as const;

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const getLocal = (k: string) => safe(() => localStorage.getItem(k), null);
export const setLocal = (k: string, v: string) => safe(() => localStorage.setItem(k, v), undefined);
export const setSignedInHint = () => setLocal(LS.signedInBefore, '1');
export const hasSignedInBefore = () => getLocal(LS.signedInBefore) === '1';
/** Called on "Disconnect & delete data": removes every app key. Sign-out keeps display prefs. */
export function clearLocalHints(all = false) {
  safe(() => {
    if (all) for (const k of Object.values(LS)) localStorage.removeItem(k);
  }, undefined);
}
