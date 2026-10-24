import { useEffect, useCallback } from 'react';

/**
 * Modal dialog — preserves original design exactly.
 */
export function Modal({ title, onClose, children }) {
  const handleKey = useCallback(
    (e) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div
      className="modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="modal-title"
    >
      <div className="dialog">
        <div className="dialogtop">
          <h2 id="modal-title">{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Modal;
