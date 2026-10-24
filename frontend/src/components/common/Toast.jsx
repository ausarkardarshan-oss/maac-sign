import { useState, useCallback } from 'react';

let _setToast = null;
let _timer = null;

export function Toast() {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);

  _setToast = useCallback((text) => {
    setMsg(text);
    setVisible(true);
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => setVisible(false), 3200);
  }, []);

  return (
    <div className={`toast${visible ? ' show' : ''}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
}

export function toast(msg) {
  if (_setToast) _setToast(msg);
}

export default Toast;
