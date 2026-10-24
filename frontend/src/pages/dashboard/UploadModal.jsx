import { useState, useRef } from 'react';
import Modal from '../../components/modals/Modal.jsx';
import { documentService } from '../../services/documentService.js';
import { toast } from '../../components/common/Toast.jsx';

export function UploadModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) {
      setError('File exceeds 6 MB limit');
      return;
    }
    setFile(f);
    setError('');
    if (!name) setName(f.name.replace(/\.pdf$/i, ''));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please select a PDF file');
    if (!name.trim()) return setError('Document name is required');

    setLoading(true);
    setError('');

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await documentService.upload({ name: name.trim(), base64 });
      toast('PDF uploaded successfully');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Upload a document" onClose={onClose}>
      <p className="dialognote">
        Choose a PDF file (max 6 MB). Files are stored securely in your private workspace.
      </p>
      <form onSubmit={handleSubmit}>
        <label
          className="filedrop"
          htmlFor="upload-file"
          onClick={() => fileRef.current?.click()}
          style={{ cursor: 'pointer' }}
        >
          ▤<br /><br />
          {file ? file.name : 'Click to choose a PDF document'}
          <input
            id="upload-file"
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>

        <div className="formfield">
          <label htmlFor="upload-name">Document name</label>
          <input
            id="upload-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name for this document"
            maxLength={150}
          />
        </div>

        {error && <p style={{ color: '#b33232', fontSize: '12px', margin: '8px 0' }}>{error}</p>}

        <div className="btngroup" style={{ marginTop: '16px' }}>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Uploading…' : 'Upload document'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default UploadModal;
