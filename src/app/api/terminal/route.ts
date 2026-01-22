import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'ssh2';

// In-memory store for SSH sessions
interface SSHSession {
  id: string;
  client: any;
  stream: any;
  connected: boolean;
  createdAt: number;
}

const sessions = new Map<string, SSHSession>();

async function establishSSHConnection(
  host: string,
  username: string,
  privateKeyPath: string
): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    const keyPath = path.resolve(privateKeyPath);
    let privateKey;

    try {
      privateKey = fs.readFileSync(keyPath);
    } catch (err) {
      reject(new Error(`Failed to read SSH key: ${privateKeyPath}`));
      return;
    }

    conn
      .on('ready', () => {
        resolve(conn);
      })
      .on('error', (err: any) => {
        reject(err);
      })
      .connect({
        host,
        username,
        privateKey,
        readyTimeout: 10000,
      });
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, command, host, username, keyPath } = body;

    const sshVmIp = process.env.SSH_VM_IP || host;
    const sshUsername = process.env.SSH_USERNAME || username || 'ubuntu';
    const sshKeyPath = process.env.SSH_KEY_PATH || keyPath || './a.pem';

    if (action === 'connect') {
      // Create new SSH session
      const newSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      try {
        const client = await establishSSHConnection(sshVmIp, sshUsername, sshKeyPath);

        const session: SSHSession = {
          id: newSessionId,
          client,
          stream: null,
          connected: true,
          createdAt: Date.now(),
        };

        sessions.set(newSessionId, session);

        return NextResponse.json({
          success: true,
          sessionId: newSessionId,
          message: 'SSH connection established',
        });
      } catch (error: any) {
        return NextResponse.json(
          {
            success: false,
            error: error.message || 'Failed to establish SSH connection',
          },
          { status: 500 }
        );
      }
    }

    if (action === 'execute' && sessionId && command) {
      const session = sessions.get(sessionId);

      if (!session || !session.connected) {
        return NextResponse.json(
          {
            success: false,
            error: 'Session not found or disconnected',
          },
          { status: 400 }
        );
      }

      return new Promise((resolve) => {
        let output = '';
        let errorOutput = '';

        session.client.exec(command, (err: any, stream: any) => {
          if (err) {
            resolve(
              NextResponse.json(
                {
                  success: false,
                  error: err.message,
                },
                { status: 500 }
              )
            );
            return;
          }

          stream
            .on('close', (code: number, signal: any) => {
              session.stream = stream;
              resolve(
                NextResponse.json({
                  success: true,
                  output: output + errorOutput,
                  exitCode: code,
                })
              );
            })
            .on('data', (data: any) => {
              output += data.toString();
            });

          stream.stderr.on('data', (data: any) => {
            errorOutput += data.toString();
          });
        });
      });
    }

    if (action === 'disconnect' && sessionId) {
      const session = sessions.get(sessionId);

      if (session) {
        if (session.client) {
          session.client.end();
        }
        session.connected = false;
        sessions.delete(sessionId);
      }

      return NextResponse.json({
        success: true,
        message: 'SSH session disconnected',
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid action',
      },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
