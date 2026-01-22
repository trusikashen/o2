import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Хардкод логин/пароль (замени на свои!)
const VALID_USERNAME = process.env.APP_USERNAME || 'admin';
const VALID_PASSWORD = process.env.APP_PASSWORD || 'password123';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Проверить логин и пароль
    if (username !== VALID_USERNAME || password !== VALID_PASSWORD) {
      return NextResponse.json(
        { error: 'Неверный логин или пароль' },
        { status: 401 }
      );
    }

    // Создать простой токен (в продакшене использовать JWT)
    const token = crypto.randomBytes(32).toString('hex');

    // Сохранить токен в памяти (в продакшене использовать Redis)
    // Для простоты используем в памяти с временем жизни 24 часа
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    
    // Сохранить в глобальную переменную
    if (!global.authTokens) {
      global.authTokens = new Map();
    }
    global.authTokens.set(token, { username, expiresAt });

    return NextResponse.json({ token });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
