import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE_PATH = path.join(process.cwd(), '.env');

// GET /api/env - Get all environment variables
export async function GET(request: NextRequest) {
  try {
    // Read from .env file
    if (!fs.existsSync(ENV_FILE_PATH)) {
      return NextResponse.json({
        success: true,
        variables: {},
        message: 'No .env file found'
      });
    }

    const envContent = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
    const variables: Record<string, string> = {};
    
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        variables[key.trim()] = value.replace(/^["']|["']$/g, ''); // Remove quotes if present
      }
    });

    return NextResponse.json({
      success: true,
      variables
    });
  } catch (error: any) {
    console.error('Error reading env:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// POST /api/env - Update environment variables
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { variables } = body;

    if (!variables || typeof variables !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Invalid variables format' },
        { status: 400 }
      );
    }

    // Read current .env
    let envContent = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      envContent = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
    }

    // Parse existing variables
    const existingVars: Record<string, { line: string; index: number }> = {};
    const lines = envContent.split('\n');
    
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const key = trimmedLine.split('=')[0].trim();
        existingVars[key] = { line, index };
      }
    });

    // Update or add variables
    for (const [key, value] of Object.entries(variables)) {
      if (existingVars[key]) {
        lines[existingVars[key].index] = `${key}=${value}`;
      } else {
        lines.push(`${key}=${value}`);
      }
    }

    // Write back to .env
    const newEnvContent = lines.join('\n');
    fs.writeFileSync(ENV_FILE_PATH, newEnvContent, 'utf-8');

    console.log('✅ .env file updated successfully');

    // Also update AWS Systems Manager Parameter Store if needed
    try {
      const { SSMClient, PutParameterCommand } = await import('@aws-sdk/client-ssm');
      const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });

      // Store as JSON in parameter store
      const paramName = '/adsterra-bot/env-config';
      await ssmClient.send(new PutParameterCommand({
        Name: paramName,
        Value: JSON.stringify(variables),
        Type: 'String',
        Overwrite: true,
      }));

      console.log('✅ AWS Systems Manager parameter updated');
    } catch (awsError: any) {
      console.warn('⚠️  Could not update AWS Systems Manager:', awsError.message);
      // Continue anyway - local .env update is successful
    }

    return NextResponse.json({
      success: true,
      message: 'Environment variables updated successfully',
      variables
    });
  } catch (error: any) {
    console.error('Error updating env:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
