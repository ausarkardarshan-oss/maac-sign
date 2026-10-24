import api from './api.js';

export const templateService = {
  listTemplates: () => api.get('/templates'),
  createTemplate: (data) => api.post('/templates', data),
  listForms: () => api.get('/forms'),
  createForm: (data) => api.post('/forms', data),
};

export default templateService;
