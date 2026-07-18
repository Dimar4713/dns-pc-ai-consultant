'use strict';

function registerLinkUpdaterRoutes(app, { security, linkUpdater }) {
  app.get('/api/admin/link-update-status', security.requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(linkUpdater.status());
  });

  app.post('/api/admin/update-links', security.requireAdmin, async (_req, res) => {
    try {
      const report = await linkUpdater.run({ write: true });
      res.json({ ok: true, report });
    } catch (error) {
      res.status(error?.message?.includes('уже выполняется') ? 409 : 500).json({ error: error?.message || 'Не удалось обновить ссылки.' });
    }
  });
}

module.exports = { registerLinkUpdaterRoutes };
