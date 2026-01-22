import { NextRequest, NextResponse } from 'next/server';
import { getAllWorkerConfigs } from '@/lib/aws/adsterra-helpers';
import type { WorkerConfig } from '@/types/adsterra';

/**
 * GET /api/admin/workers
 * Returns all worker configurations
 */
export async function GET(request: NextRequest) {
  try {
    const configs = await getAllWorkerConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    console.error('Error fetching worker configs:', error);    // If table doesn't exist, return empty array
    // User can then create configs and table will be auto-created
    if (error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
      return NextResponse.json([]);
    }    return NextResponse.json(
      { error: 'Failed to fetch worker configurations' },
      { status: 500 }
    );
  }
}
