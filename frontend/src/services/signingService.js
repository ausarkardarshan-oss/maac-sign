import api from './api.js';

export const signingService = {
  listRequests: () => api.get('/requests'),
  createRequest: (data) => api.post('/requests', data),
  resendRequest: (requestId) => api.post(`/requests/${requestId}/resend`),
  cancelRequest: (requestId, reason) => api.post(`/requests/${requestId}/cancel`, { reason }),
  getEmailStatus: () => api.get('/email/status'),
  // Public (recipient) endpoints
  getSigningInfo: (token) => api.get(`/sign/${token}`),
  submitSignature: (token, data) => api.post(`/sign/${token}`, data),
  signFileUrl: (token) => `/api/sign-file/${token}`,
  signFileSignedUrl: (token) => `/api/sign-file/${token}/signed`,
  signFileCertificateUrl: (token) => `/api/sign-file/${token}/certificate`,
};

export default signingService;
