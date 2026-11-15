// The local auth bypass is available only through this loopback-bound launcher.
// Do not forward CLI arguments: an extra --hostname could expose the server.
const { spawn } = require('node:child_process');

const child = spawn(process.execPath, [
  require.resolve('next/dist/bin/next'),
  'dev', '--turbopack', '--hostname', '127.0.0.1',
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VOICE_DEV_AUTH_BYPASS: 'true',
    VOICE_DEV_LOOPBACK_ONLY: 'true',
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', () => {
  console.error('Could not start the local voice development server.');
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 0 : 1);
});
