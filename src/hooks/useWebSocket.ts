'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseWebSocketOptions {
  namespace?: string;
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { namespace = '/runs', autoConnect = true } = options;
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!autoConnect) return;

    // Connect to Socket.io server
    const socket = io(namespace, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log(`[WebSocket] Connected to ${namespace}`);
      setConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Disconnected from ${namespace}`);
      setConnected(false);
    });

    socket.on('connect_error', (err: any) => {
      console.error(`[WebSocket] Connection error:`, err);
      setError(err.message || 'Connection error');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [namespace, autoConnect]);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
      return () => {
        socketRef.current?.off(event, callback);
      };
    }
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current && connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn(`[WebSocket] Cannot emit ${event}: not connected`);
    }
  }, [connected]);

  const join = useCallback((room: string) => {
    if (socketRef.current) {
      socketRef.current.emit('subscribe-run', room);
    }
  }, []);

  const leave = useCallback((room: string) => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe-run', room);
    }
  }, []);

  return {
    connected,
    error,
    subscribe,
    emit,
    join,
    leave,
    socket: socketRef.current,
  };
}

// Hook specifically for run updates (with automatic polling fallback)
export function useRunUpdates(runId: string | null) {
  const [runData, setRunData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { subscribe, join, leave, connected } = useWebSocket({ namespace: '/runs', autoConnect: true });
  const pollingRef = useRef<NodeJS.Timeout>();

  // Fetch run data from API (fallback for polling)
  const fetchRunData = useCallback(async () => {
    if (!runId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/adsterra/runs/${runId}`);
      const data = await response.json();
      setRunData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch run');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  // Fetch stats from API (fallback for polling)
  const fetchStats = useCallback(async () => {
    if (!runId) return;

    try {
      const response = await fetch(`/api/adsterra/runs/${runId}/stats`);
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [runId]);

  // WebSocket subscription
  useEffect(() => {
    if (!runId) return;

    if (connected) {
      // Listen to WebSocket events
      const unsubscribeUpdate = subscribe('run-updated', (data) => {
        setRunData(data);
      });

      const unsubscribeStats = subscribe('stats-updated', (data) => {
        setStats(data);
      });

      // Join the run room
      join(runId);

      return () => {
        unsubscribeUpdate?.();
        unsubscribeStats?.();
        leave(runId);
      };
    } else {
      // Fallback to polling if WebSocket not connected
      fetchRunData();
      fetchStats();

      const pollingInterval = setInterval(() => {
        fetchStats();
      }, 5000); // Poll every 5 seconds

      pollingRef.current = pollingInterval;

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
      };
    }
  }, [runId, connected, subscribe, join, leave, fetchRunData, fetchStats]);

  return {
    runData,
    stats,
    loading,
    error,
    websocketConnected: connected,
  };
}
