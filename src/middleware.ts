import { NextRequest, NextResponse } from 'next/server';

// Публичные маршруты (не требуют аутентификации)
const PUBLIC_ROUTES = ['/api/auth/login', '/api/health'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Позволить публичные маршруты
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Позволить страницу логина
  if (pathname === '/' || pathname === '/login') {
    return NextResponse.next();
  }

  // Для API маршрутов - проверить токен
  if (pathname.startsWith('/api/')) {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
                  request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Проверить токен в памяти
    if (global.authTokens && global.authTokens.has(token)) {
      const tokenData = global.authTokens.get(token);
      
      // Проверить expiration
      if (tokenData.expiresAt < Date.now()) {
        global.authTokens.delete(token);
        return NextResponse.json(
          { error: 'Token expired' },
          { status: 401 }
        );
      }

      return NextResponse.next();
    }

    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    );
  }

  // Для других страниц - позволить доступ (проверка будет на клиенте)
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    '/adsterra/:path*',
  ],
};
