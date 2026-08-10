import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styles from './DesmosQuestionAssist.module.css';

const DesmosAssistGroupContext = createContext(null);

function useIsCompactLayout(breakpoint = 1024) {
  const [compact, setCompact] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const sync = () => setCompact(mq.matches);
    sync();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, [breakpoint]);

  return compact;
}

export function useDesmosAssistGroup() {
  return useContext(DesmosAssistGroupContext);
}

/**
 * Shared Desmos host for pages with multiple question chips (details / preview).
 * - Only one calculator can be open at a time
 * - On desktop, reserves space so the whole page content (score + questions) shifts left
 */
export default function DesmosAssistGroup({ children, contentClassName = '' }) {
  const isCompact = useIsCompactLayout(1024);
  const [openKey, setOpenKey] = useState(null);
  const [panelWidth, setPanelWidthState] = useState(null);

  const claimOpen = useCallback((key) => {
    setOpenKey(String(key));
  }, []);

  const releaseOpen = useCallback((key) => {
    setOpenKey((current) => (current === String(key) ? null : current));
  }, []);

  const setPanelWidth = useCallback((width) => {
    if (width == null || Number.isNaN(Number(width))) {
      setPanelWidthState(null);
      return;
    }
    setPanelWidthState(Math.round(Number(width)));
  }, []);

  const isBlocked = useCallback(
    (key) => openKey != null && openKey !== String(key),
    [openKey]
  );

  useEffect(() => {
    if (!openKey) setPanelWidthState(null);
  }, [openKey]);

  useEffect(() => {
    if (isCompact) {
      setPanelWidthState(null);
    }
  }, [isCompact]);

  const value = useMemo(
    () => ({
      openKey,
      claimOpen,
      releaseOpen,
      setPanelWidth,
      panelWidth,
      isBlocked,
      isCompact,
      isOpen: Boolean(openKey),
    }),
    [openKey, claimOpen, releaseOpen, setPanelWidth, panelWidth, isBlocked, isCompact]
  );

  const isOpenDesktop = Boolean(openKey) && !isCompact;

  return (
    <DesmosAssistGroupContext.Provider value={value}>
      <div className={`${styles.shell} ${isOpenDesktop ? styles.shellOpen : ''}`}>
        <div className={`${styles.layout} ${isOpenDesktop ? styles.layoutOpen : ''}`}>
          <div className={`${styles.questionSlot} ${contentClassName}`.trim()}>
            {typeof children === 'function'
              ? children({ isOpen: Boolean(openKey), isCompact, isOpenDesktop })
              : children}
          </div>
          {isOpenDesktop ? (
            <div
              className={styles.panelSpacer}
              style={
                panelWidth
                  ? {
                      width: panelWidth,
                      maxWidth: 'none',
                      minWidth: panelWidth,
                    }
                  : undefined
              }
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </DesmosAssistGroupContext.Provider>
  );
}
