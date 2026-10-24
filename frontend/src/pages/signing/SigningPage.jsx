import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { signingService } from '../../services/signingService.js';
import { toast } from '../../components/common/Toast.jsx';

export function SigningPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Signature state
  const [signType, setSignType] = useState('type'); // 'type' | 'draw'
  const [typedName, setTypedName] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Canvas ref
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    signingService
      .getSigningInfo(token)
      .then((data) => {
        setInfo(data);
        if (data.recipient) setTypedName(data.recipient);
        if (data.status === 'signed' || data.status === 'completed') {
          setCompleted(true);
        }
      })
      .catch((err) => {
        setError(err.message || 'Invalid or expired signing link');
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Setup canvas drawing handlers
  useEffect(() => {
    if (signType !== 'draw' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#123e35';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      return [
        ((e.clientX - rect.left) * canvas.width) / rect.width,
        ((e.clientY - rect.top) * canvas.height) / rect.height,
      ];
    }

    const onPointerDown = (e) => {
      drawingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      ctx.beginPath();
      ctx.moveTo(...pos(e));
    };

    const onPointerMove = (e) => {
      if (drawingRef.current) {
        ctx.lineTo(...pos(e));
        ctx.stroke();
      }
    };

    const onPointerUp = () => {
      drawingRef.current = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [signType]);

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!consent) {
      toast('Please accept the signature agreement');
      return;
    }

    let sigData = '';
    if (signType === 'type') {
      if (!typedName.trim()) {
        toast('Please type your name for the signature');
        return;
      }
      sigData = `Typed: ${typedName.trim()}`;
    } else {
      if (!canvasRef.current) return;
      sigData = canvasRef.current.toDataURL('image/png');
    }

    setSubmitting(true);
    try {
      await signingService.submitSignature(token, {
        signature: sigData,
        consent: true,
      });
      const freshInfo = await signingService.getSigningInfo(token);
      setInfo(freshInfo);
      setCompleted(true);
      toast('Document signed and sealed successfully!');
    } catch (err) {
      toast(err.message || 'Failed to submit signature');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="signing-container">
        <div className="loading-center" style={{ minHeight: '60vh' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="signing-container">
        <header className="signing-header">
          <div className="brand" style={{ padding: 0 }}>
            <span className="brandmark">✦</span>
            <span>maac<span className="brandlight">sign</span></span>
          </div>
        </header>
        <div className="signing-body">
          <div className="card featureempty" style={{ margin: '60px auto' }}>
            <div className="illustration" style={{ background: '#ffebe9', color: '#d34b42' }}>✕</div>
            <h2>Unable to load document</h2>
            <p>{error}</p>
            <Link to="/login" className="btn primary" style={{ marginTop: '16px' }}>Go to MAAC Sign</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="signing-container">
      {/* Header */}
      <header className="signing-header">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brandmark">✦</span>
          <span>maac<span className="brandlight">sign</span></span>
        </div>
        <div style={{ fontSize: '13px', color: '#c1d0cb' }}>
          Signing as <strong>{info?.recipient}</strong>
        </div>
      </header>

      {/* Body */}
      <div className="signing-body">
        {completed ? (
          <div className="card featureempty" style={{ margin: '40px auto' }}>
            <div className="illustration" style={{ background: '#e6f7ef', color: '#12855c' }}>✓</div>
            <h2>Document Completed</h2>
            <p>You have successfully signed <strong>{info?.document}</strong>. The finalized agreement has been sealed with full cryptographic audit trail verification.</p>
            <div className="btngroup" style={{ justifyContent: 'center', marginTop: '20px', gap: '12px' }}>
              <a
                href={info?.has_signed_file ? signingService.signFileSignedUrl(token) : signingService.signFileUrl(token)}
                target="_blank"
                rel="noreferrer"
                className="btn primary"
              >
                Download Signed PDF
              </a>
              {info?.has_certificate && (
                <a
                  href={signingService.signFileCertificateUrl(token)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                >
                  Certificate of Completion
                </a>
              )}
              <Link to="/login" className="btn">Sign in to MAAC Sign</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="heading" style={{ marginBottom: '24px' }}>
              <div>
                <div className="eyebrow">SIGNATURE REQUEST</div>
                <h1 className="pagetitle">{info?.document || 'Document'}</h1>
                <p className="subtitle">{info?.subject || 'Please review and sign this document.'}</p>
              </div>
              <div className="btngroup">
                <a
                  href={signingService.signFileUrl(token)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                >
                  View / Download PDF ↗
                </a>
              </div>
            </div>

            {/* Document preview info box */}
            <div className="card" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <span className="smallmuted" style={{ display: 'block', marginBottom: '4px' }}>DOCUMENT NAME</span>
                  <strong>▤ &nbsp;{info?.document}</strong>
                </div>
                <div>
                  <span className="smallmuted" style={{ display: 'block', marginBottom: '4px' }}>RECIPIENT</span>
                  <span>{info?.recipient}</span>
                </div>
                <div>
                  <span className="smallmuted" style={{ display: 'block', marginBottom: '4px' }}>STATUS</span>
                  <span className="status inprogress">Ready to sign</span>
                </div>
              </div>
            </div>

            {/* Signature form */}
            <div className="card">
              <h3 style={{ margin: '0 0 16px', fontSize: '17px' }}>Your Signature</h3>

              {/* Mode tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                <button
                  type="button"
                  className={`chip ${signType === 'type' ? 'active' : ''}`}
                  onClick={() => setSignType('type')}
                >
                  Type signature
                </button>
                <button
                  type="button"
                  className={`chip ${signType === 'draw' ? 'active' : ''}`}
                  onClick={() => setSignType('draw')}
                >
                  Draw signature
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {signType === 'type' ? (
                  <div>
                    <div className="formfield">
                      <label htmlFor="typed-name">Full Legal Name</label>
                      <input
                        id="typed-name"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="Type your name"
                        required
                      />
                    </div>
                    {typedName && (
                      <div
                        style={{
                          background: '#f9fbfa',
                          border: '1px solid #dfe9e4',
                          borderRadius: '10px',
                          padding: '18px 24px',
                          fontFamily: 'cursive, "Brush Script MT", sans-serif',
                          fontSize: '28px',
                          color: '#123e35',
                          letterSpacing: '1px',
                          margin: '12px 0',
                        }}
                      >
                        {typedName}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="dialognote">Draw your signature with your finger or mouse.</p>
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={180}
                      className="signature-pad"
                    />
                    <div style={{ marginTop: '8px' }}>
                      <button type="button" className="link" onClick={clearCanvas}>
                        Clear signature
                      </button>
                    </div>
                  </div>
                )}

                {/* Consent checkbox */}
                <div style={{ margin: '22px 0 18px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', cursor: 'pointer', lineHeight: '1.6' }}>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      style={{ width: '18px', height: '18px', marginTop: '2px' }}
                      required
                    />
                    <span>
                      I agree that my electronic signature will have the same legal validity and enforceability as a handwritten signature.
                    </span>
                  </label>
                </div>

                <div className="btngroup">
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={submitting || !consent}
                    style={{ padding: '14px 28px', fontSize: '15px' }}
                  >
                    {submitting ? 'Submitting signature…' : 'Sign and Complete'}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SigningPage;
