import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

export interface SocketServerOptions {
  httpServer: HTTPServer;
  path?: string;
}

let io: SocketIOServer | null = null;

export function initializeSocketServer(options: SocketServerOptions): SocketIOServer {
  if (io) {
    return io;
  }

  io = new SocketIOServer(options.httpServer, {
    path: options.path || '/socket.io/',
    cors: {
      origin: process.env.NODE_ENV === 'production' ? [] : '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Namespace for runs
  io.of('/runs').on('connection', (socket) => {
    console.log('[SOCKET] Client connected to /runs namespace:', socket.id);

    socket.on('subscribe-run', (runId: string) => {
      socket.join(`run-${runId}`);
      console.log(`[SOCKET] ${socket.id} subscribed to run-${runId}`);
    });

    socket.on('unsubscribe-run', (runId: string) => {
      socket.leave(`run-${runId}`);
      console.log(`[SOCKET] ${socket.id} unsubscribed from run-${runId}`);
    });

    socket.on('disconnect', () => {
      console.log('[SOCKET] Client disconnected from /runs namespace:', socket.id);
    });
  });

  // Namespace for workers
  io.of('/workers').on('connection', (socket) => {
    console.log('[SOCKET] Client connected to /workers namespace:', socket.id);

    socket.on('subscribe-workers', () => {
      socket.join('workers-status');
      console.log(`[SOCKET] ${socket.id} subscribed to workers-status`);
    });

    socket.on('disconnect', () => {
      console.log('[SOCKET] Client disconnected from /workers namespace:', socket.id);
    });
  });

  // Namespace for terminal
  io.of('/terminal').on('connection', (socket) => {
    console.log('[SOCKET] Client connected to /terminal namespace:', socket.id);

    socket.on('disconnect', () => {
      console.log('[SOCKET] Client disconnected from /terminal namespace:', socket.id);
    });
  });

  return io;
}

export function getSocketServer(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io server not initialized. Call initializeSocketServer first.');
  }
  return io;
}

export function emitRunUpdate(runId: string, data: any) {
  if (io) {
    io.of('/runs').to(`run-${runId}`).emit('run-updated', data);
  }
}

export function emitRunsListUpdate(runsData: any) {
  if (io) {
    io.of('/runs').emit('runs-list-updated', runsData);
  }
}

export function emitRunStats(runId: string, stats: any) {
  if (io) {
    io.of('/runs').to(`run-${runId}`).emit('stats-updated', stats);
  }
}

export function emitWorkersUpdate(workersData: any) {
  if (io) {
    io.of('/workers').to('workers-status').emit('workers-updated', workersData);
  }
}

export function emitTerminalOutput(sessionId: string, output: string) {
  if (io) {
    io.of('/terminal').to(`session-${sessionId}`).emit('output', output);
  }
}

export function emitTerminalError(sessionId: string, error: string) {
  if (io) {
    io.of('/terminal').to(`session-${sessionId}`).emit('error', error);
  }
}

export function emitTerminalConnected(sessionId: string) {
  if (io) {
    io.of('/terminal').to(`session-${sessionId}`).emit('connected');
  }
}

export function emitTerminalDisconnected(sessionId: string) {
  if (io) {
    io.of('/terminal').to(`session-${sessionId}`).emit('disconnected');
  }
}
