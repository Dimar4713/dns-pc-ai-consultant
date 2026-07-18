'use strict';

const express = require('express');
const { config } = require('./lib/config');
const { createKnowledgeService } = require('./lib/knowledge');
const { securityHeaders, createSecurity } = require('./lib/security');
const { createUsage } = require('./lib/usage');
const { registerRoutes } = require('./lib/routes');

const app = express();
const root = __dirname;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(express.json({ limit: '100kb' }));

const security = createSecurity(config);
const knowledge = createKnowledgeService(root);
const usage = createUsage(config, security.hashIdentifier, security.getClientIp);

registerRoutes(app, { config, security, knowledge, usage, root });

app.listen(config.port, '0.0.0.0', () => {
  const kb = knowledge.status();
  console.log(`DNS PC AI Consultant: http://0.0.0.0:${config.port}`);
  console.log(`Публичный режим: ${config.runtime.publicMode}; модель: ${config.runtime.model}`);
  console.log(`База знаний: ${kb.files.join(', ')}; разделов: ${kb.sections}`);
  if (!config.routerApiKey) console.warn('ROUTERAI_API_KEY не задан: публичный чат работать не будет.');
  if (config.sessionSecret.length < 32) console.warn('SESSION_SECRET не задан или короче 32 символов: вход администратора отключён.');
  if (!config.adminPasswordHash && config.adminPassword) console.warn('Используется ADMIN_PASSWORD без хеша. Для публикации задайте ADMIN_PASSWORD_HASH.');
});
