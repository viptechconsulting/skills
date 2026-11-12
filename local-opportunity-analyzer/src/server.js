import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { recoverStuckAudits } from './audit.js';
await migrate(); await recoverStuckAudits();
createApp().listen(config.port, () => console.log(`VIP Tech Local Opportunity Analyzer en http://localhost:${config.port}`));
