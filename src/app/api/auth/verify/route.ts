import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    // Проверить токен в памяти
    if ((global as any).authTokens && (global as any).authTokens.has(token)) {
      const tokenData = (global as any).authTokens.get(token);
      
      // Проверить expiration
      if (tokenData.expiresAt < Date.now()) {
        (global as any).authTokens.delete(token);
        return NextResponse.json(
          { error: 'Token expired' },
          { status: 401 }
        );
      }

      return NextResponse.json({ valid: true, username: tokenData.username });
    }

    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    );
  } catch (error: any) {
    console.error('Verify error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
