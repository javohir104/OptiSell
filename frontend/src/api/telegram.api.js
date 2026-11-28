import api, { unwrap } from './axios';

export const telegramApi = {
  status: () => api.get('/telegram/status').then(unwrap).then((d) => ({
    configured: d.configured, connected: d.connected, botUsername: d.bot_username, reportHour: d.report_hour,
  })),
  link: () => api.post('/telegram/link').then(unwrap).then((d) => ({ configured: d.configured, url: d.url })),
  unlink: () => api.delete('/telegram/link').then(unwrap),
  test: () => api.post('/telegram/test').then(unwrap),
  report: () => api.post('/telegram/report').then(unwrap),
};
