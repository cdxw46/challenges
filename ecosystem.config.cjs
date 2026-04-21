module.exports = {
  apps: [
    {
      name: 'smurfx-web',
      cwd: process.env.APP_DIR || '/opt/smurfx',
      script: 'pnpm',
      args: '--filter @smurfx/web start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
