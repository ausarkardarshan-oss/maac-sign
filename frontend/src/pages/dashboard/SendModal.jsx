import { useState } from 'react';
import Modal from '../../components/modals/Modal.jsx';
import { signingService } from '../../services/signingService.js';
import { toast } from '../../components/common/Toast.jsx';

export function SendModal({ docs, onClose, onSuccess }) {
  const [form, setForm] = useState({ documentId: '', email: '', recipientName: '', subject: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentResult, setSentResult] = useState(null);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signingService.createRequest({
        documentId: form.documentId,
        email: form.email,
        recipientName: form.recipientName,
        subject: form.subject,
      });
      setSentResult(result);
      if (result.emailSent) {
        toast(`Invitation sent to ${form.email} via Brevo SMTP`);
      } else {
        toast('Invitation created (copy link to share manually)');
      }
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to create request');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!sentResult?.invitation) return;
    try {
      await navigator.clipboard.writeText(sentResult.invitation);
      toast('Invitation link copied to clipboard');
    } catch {
      toast('Could not copy — please copy manually');
    }
  };

  if (sentResult) {
    const isSent = sentResult.emailSent;
    return (
      <Modal title={isSent ? 'Invitation Delivered' : 'Invitation Created'} onClose={onClose}>
        <div
          className="invitebox"
          style={{
            background: isSent ? '#f0fbf6' : '#fff9e8',
            borderColor: isSent ? '#97dfbe' : '#ffe49e',
          }}
        >
          <p
            className="dialognote"
            style={{
              color: isSent ? '#12634d' : '#8a5c00',
              fontWeight: 600,
              marginBottom: '10px',
            }}
          >
            {isSent
              ? `✓ Invitation email was dispatched to ${form.email} via Brevo SMTP.`
              : `Notice: SMTP delivery was skipped or failed (${sentResult.emailError || 'check SMTP credentials'}). You can share the private link below.`}
          </p>
          <input readOnly value={sentResult.invitation} id="invite-link" style={{ marginBottom: '12px' }} />
        </div>
        <div className="btngroup" style={{ marginTop: '16px' }}>
          <button className="btn primary" onClick={copyLink}>Copy invitation link</button>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Send for signatures" onClose={onClose}>
      <p className="dialognote">
        Create a signing request. An invitation email with a secure token will be delivered to the recipient via Brevo SMTP.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="formfield">
          <label htmlFor="send-doc">Document</label>
          <select id="send-doc" name="documentId" value={form.documentId} onChange={handleChange} required>
            <option value="">Choose a draft PDF</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {docs.length === 0 && (
            <small style={{ color: 'var(--muted)' }}>Upload a PDF document first to create a signing request.</small>
          )}
        </div>

        <div className="formfield">
          <label htmlFor="send-recipient-name">Recipient name</label>
          <input
            id="send-recipient-name"
            name="recipientName"
            value={form.recipientName}
            onChange={handleChange}
            placeholder="Recipient's full name"
            required
          />
        </div>

        <div className="formfield">
          <label htmlFor="send-email">Recipient email</label>
          <input
            id="send-email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="recipient@example.com"
            required
          />
        </div>

        <div className="formfield">
          <label htmlFor="send-subject">Subject</label>
          <input
            id="send-subject"
            name="subject"
            value={form.subject}
            onChange={handleChange}
            placeholder="e.g. Please review and sign this agreement"
            required
          />
        </div>

        {error && <p style={{ color: '#b33232', fontSize: '12px', margin: '8px 0' }}>{error}</p>}

        <div className="btngroup" style={{ marginTop: '16px' }}>
          <button type="submit" className="btn primary" disabled={loading || docs.length === 0}>
            {loading ? 'Sending via Brevo SMTP…' : 'Send for signatures'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default SendModal;
