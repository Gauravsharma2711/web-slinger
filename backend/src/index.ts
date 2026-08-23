import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

const port = Number(process.env.PORT) || config.port || 8080;

app.listen(port, '0.0.0.0', () => {
  console.log(`Web-Slinger backend listening on http://0.0.0.0:${port}`);
});
