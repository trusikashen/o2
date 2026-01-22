import { NextRequest, NextResponse } from 'next/server';
import {
  getWorkerConfig,
  createWorkerConfig,
  updateWorkerConfig,
  deleteWorkerConfig,
} from '@/lib/aws/adsterra-helpers';
import type { WorkerConfig } from '@/types/adsterra';

export interface RouteParams {
  workerId: string;
}

/**
 * Validate worker ID (must be worker-0 to worker-14)
 */
function validateWorkerId(workerId: string): boolean {
  const match = workerId.match(/^worker-(\d+)$/);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 0 && num <= 14;
}

/**
 * GET /api/admin/workers/[workerId]/config
 * Returns configuration for a specific worker
 */
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { workerId } = params;

    if (!validateWorkerId(workerId)) {
      return NextResponse.json(
        { error: 'Invalid worker ID format (expected worker-0 to worker-14)' },
        { status: 400 }
      );
    }

    const config = await getWorkerConfig(workerId);

    if (!config) {
      return NextResponse.json(
        { error: 'Worker configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching worker config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worker configuration' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/workers/[workerId]/config
 * Updates or creates configuration for a specific worker
 */
export async function PUT(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { workerId } = params;

    if (!validateWorkerId(workerId)) {
      return NextResponse.json(
        { error: 'Invalid worker ID format (expected worker-0 to worker-14)' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.adsterraUrl) {
      return NextResponse.json(
        { error: 'adsterraUrl is required' },
        { status: 400 }
      );
    }

    // Check if config exists
    const existingConfig = await getWorkerConfig(workerId);

    if (existingConfig) {
      // Update existing config
      await updateWorkerConfig(workerId, {
        adsterraUrl: body.adsterraUrl,
        browserHeadless: body.browserHeadless,
        minScrollWait: body.minScrollWait,
        maxScrollWait: body.maxScrollWait,
        minAdWait: body.minAdWait,
        maxAdWait: body.maxAdWait,
        distribution: body.distribution,
        pacingMode: body.pacingMode,
        pacingHours: body.pacingHours,
      });
    } else {
      // Create new config
      await createWorkerConfig({
        workerId,
        adsterraUrl: body.adsterraUrl,
        browserHeadless: body.browserHeadless ?? true,
        minScrollWait: body.minScrollWait,
        maxScrollWait: body.maxScrollWait,
        minAdWait: body.minAdWait,
        maxAdWait: body.maxAdWait,
        distribution: body.distribution,
        pacingMode: body.pacingMode,
        pacingHours: body.pacingHours,
      });
    }

    const updatedConfig = await getWorkerConfig(workerId);
    return NextResponse.json(updatedConfig, { status: 200 });
  } catch (error) {
    console.error('Error updating worker config:', error);
    return NextResponse.json(
      { error: 'Failed to update worker configuration' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/workers/[workerId]/config
 * Deletes configuration for a specific worker
 */
export async function DELETE(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { workerId } = params;

    if (!validateWorkerId(workerId)) {
      return NextResponse.json(
        { error: 'Invalid worker ID format (expected worker-0 to worker-14)' },
        { status: 400 }
      );
    }

    await deleteWorkerConfig(workerId);

    return NextResponse.json({
      message: `Worker configuration for ${workerId} deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting worker config:', error);
    return NextResponse.json(
      { error: 'Failed to delete worker configuration' },
      { status: 500 }
    );
  }
}
