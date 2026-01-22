/**
 * Simple HTTP server to control worker on Google Cloud VM
 * Run this on the VM: npx tsx scripts/worker-control-server.ts
 * Then frontend can call: http://VM_IP:3001/start or /stop
 */

import { spawn } from 'child_process';
import * as http from 'http';

const PORT = 3001;
let workerProcess: any = null;

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Content-Type', 'application/json');

  if (url === '/start' && method === 'POST') {
    if (workerProcess) {
      res.writeHead(200);
      res.end(JSON.stringify({ success: false, message: 'Worker already running' }));
      return;
    }

    console.log('🚀 Starting worker...');
    workerProcess = spawn('npx', ['tsx', 'src/worker.ts'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
    });

    workerProcess.on('exit', () => {
      workerProcess = null;
      console.log('Worker process exited');
    });

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, message: 'Worker started' }));
  } else if (url === '/stop' && method === 'POST') {
    if (!workerProcess) {
      res.writeHead(200);
      res.end(JSON.stringify({ success: false, message: 'Worker not running' }));
      return;
    }

    console.log('🛑 Stopping worker...');
    workerProcess.kill();
    workerProcess = null;

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, message: 'Worker stopped' }));
  } else if (url === '/status' && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ 
      success: true, 
      running: workerProcess !== null,
      pid: workerProcess?.pid || null
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, message: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Worker Control Server running on http://0.0.0.0:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /start - Start worker');
  console.log('  POST /stop - Stop worker');
  console.log('  GET /status - Check worker status');
});

