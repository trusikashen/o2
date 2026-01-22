'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Send, Loader } from 'lucide-react';

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TerminalModal({ isOpen, onClose }: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);

  // Initialize xterm on first render (client-side only)
  useEffect(() => {
    if (!isOpen || !terminalRef.current || initialized) return;

    const initXterm = async () => {
      try {
        const { Terminal } = await import('xterm');
        const { FitAddon } = await import('xterm-addon-fit');

        const term = new Terminal({
          cols: 120,
          rows: 30,
          cursorBlink: true,
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#aeafad',
          },
        });

        const fit = new FitAddon();

        term.loadAddon(fit);
        term.open(terminalRef.current!);
        fit.fit();

        xtermRef.current = term;
        fitAddonRef.current = fit;

        term.writeln('SSH Terminal - Type commands to execute');
        term.writeln('Connected to AWS VM via SSH');
        term.writeln('');

        // Handle terminal input
        let currentInput = '';
        term.onKey(({ key, domEvent }: any) => {
          if (domEvent.key === 'Enter') {
            // Execute command
            term.writeln(currentInput);
            // Store for later execution
            const cmd = currentInput;
            currentInput = '';
            term.write('$ ');
          } else if (domEvent.key === 'Backspace') {
            if (currentInput.length > 0) {
              currentInput = currentInput.slice(0, -1);
              term.write('\b \b');
            }
          } else if (key.length === 1 && !domEvent.ctrlKey && !domEvent.altKey) {
            currentInput += key;
            term.write(key);
          } else if (domEvent.ctrlKey && key === 'c') {
            term.writeln('^C');
            currentInput = '';
          }
        });

        setInitialized(true);
      } catch (err) {
        console.error('Failed to initialize xterm:', err);
      }
    };

    initXterm();
  }, [isOpen]);

  // Auto-connect on modal open
  useEffect(() => {
    if (isOpen && initialized && !connected && !autoConnectAttempted) {
      setAutoConnectAttempted(true);
      // Auto-connect with default credentials from .env
      connectSSH();
    }
  }, [isOpen, initialized, connected, autoConnectAttempted]);

  const connectSSH = async () => {
    try {
      setConnecting(true);

      const response = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          // Don't pass host - will use .env defaults
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSessionId(data.sessionId);
        setConnected(true);
        xtermRef.current?.writeln(`✓ Connected to SSH session: ${data.sessionId}`);
        xtermRef.current?.writeln('');
        xtermRef.current?.write('$ ');
      } else {
        xtermRef.current?.writeln(`✗ Connection failed: ${data.error}`);
      }
    } catch (error) {
      xtermRef.current?.writeln(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setConnecting(false);
    }
  };

  const sendCommand = async (command: string) => {
    if (!sessionId) {
      xtermRef.current?.writeln('Not connected to SSH session');
      return;
    }

    xtermRef.current?.writeln(command);

    try {
      const response = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          sessionId,
          command: command.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        const output = data.output || '(no output)';
        xtermRef.current?.writeln(output);
      } else {
        xtermRef.current?.writeln(`Error: ${data.error}`);
      }
      xtermRef.current?.write('$ ');
    } catch (error) {
      xtermRef.current?.writeln(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      xtermRef.current?.write('$ ');
    }
  };

  const handleDisconnect = async () => {
    if (sessionId) {
      try {
        await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'disconnect',
            sessionId,
          }),
        });
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }

    setSessionId(null);
    setConnected(false);
    setInitialized(false);
    setAutoConnectAttempted(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-xl w-11/12 h-5/6 max-w-6xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            🖥️ SSH Terminal
            {connected && <span className="text-green-400 text-sm flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Connected
            </span>}
            {!connected && <span className="text-gray-400 text-sm">Disconnected</span>}
          </h2>
          <button
            onClick={handleDisconnect}
            className="p-1 hover:bg-gray-800 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Connection Panel */}
        {!connected && (
          <div className="p-4 bg-gray-800 border-b border-gray-700">
            <div className="flex gap-2">
              <div className="flex-1 text-sm text-gray-300">
                Connecting to: <span className="text-white font-mono">ubuntu@100.48.93.18</span>
                <br />
                <span className="text-xs text-gray-400">Using a.pem from project root</span>
              </div>
              <button
                onClick={connectSSH}
                disabled={connecting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded font-medium flex items-center gap-2 transition"
              >
                {connecting ? <Loader size={16} className="animate-spin" /> : null}
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        )}

        {/* Terminal Area */}
        <div
          ref={terminalRef}
          className="flex-1 overflow-auto bg-gray-900"
          style={{ minHeight: '400px' }}
        />

        {/* Command Input - shown when connected */}
        {connected && (
          <div className="p-4 border-t border-gray-700 bg-gray-800">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Enter command..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value) {
                    sendCommand(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => {
                  if (inputRef.current?.value) {
                    sendCommand(inputRef.current.value);
                    inputRef.current.value = '';
                  }
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium flex items-center gap-2 transition"
              >
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
