import api from './api.js';

export const templateService = {
  listTemplates: () => api.get('/templates'),
  createTemplate: (data) => api.post('/templates', data),
  deleteTemplate: (id) => api.delete(`/templates/${id}`),
  listForms: () => api.get('/forms'),
  createForm: (data) => api.post('/forms', data),
  deleteForm: (id) => api.delete(`/forms/${id}`),
};

export default templateService;
