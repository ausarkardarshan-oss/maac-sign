import api from './api.js';

export const documentService = {
  list: (q) => api.get(q ? `/documents?q=${encodeURIComponent(q)}` : '/documents'),
  stats: () => api.get('/documents/stats'),
  upload: ({ name, base64 }) => api.post('/documents', { name, base64 }),
  get: (id) => api.get(`/documents/${id}`),
  rename: (id, name) => api.patch(`/documents/${id}`, { name }),
  delete: (id) => api.delete(`/documents/${id}`),
  downloadUrl: (id) => `/api/documents/${id}/download`,
  downloadSignedUrl: (id) => `/api/documents/${id}/download-signed`,
  certificateUrl: (id) => `/api/documents/${id}/certificate`,
  digitalSignatureInfo: (id) => api.get(`/documents/${id}/digital-signature`),
  audit: (id) => api.get(`/documents/${id}/audit`),
  email: (id, { email, name }) => api.post(`/documents/${id}/email`, { email, name }),
  selfSign: (id, data) => api.post(`/documents/${id}/self-sign`, data),
};

export default documentService;
