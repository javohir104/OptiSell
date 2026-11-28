/**
 * Admin panel API. Uses the normal sign-in token (the admin logs in on /login like everyone else).
 * Every endpoint checks role = 'admin' in the database on the backend; a normal user gets 403.
 */
import api from './axios';

const get = (url, params) => api.get(url, { params }).then((r) => r.data);

export const adminApi = {
  me: () => get('/admin/auth/me').then((d) => d.data.admin),
  overview: (params) => get('/admin/overview', params).then((d) => d.data),
  chart: (params) => get('/admin/chart', params).then((d) => d.data),
  traffic: (params) => get('/admin/traffic', params).then((d) => d.data),
  activeUsers: (params) => get('/admin/active-users', params).then((d) => d.data),
  users: (params) => get('/admin/users', params),
  user: (id) => get(`/admin/users/${id}`).then((d) => d.data),
  setTestAccount: (id, isTest) => api.patch(`/admin/users/${id}`, { is_test_account: isTest }).then((r) => r.data.data),
  payments: (params) => get('/admin/payments', params),
  auditLog: (params) => get('/admin/audit-log', params),
  resetLink: (id) => api.post(`/admin/users/${id}/reset-link`).then((r) => r.data.data),
  backups: () => get('/admin/backups').then((d) => d.data),
  createBackup: () => api.post('/admin/backups').then((r) => r.data.data),
  /** Whole database as a JSON file download. */
  downloadBackup: async () => {
    const res = await api.get('/admin/backups/download', { responseType: 'blob', timeout: 120000 });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optisell-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};
