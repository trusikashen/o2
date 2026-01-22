import { NextRequest, NextResponse } from 'next/server';
import { getAdsterraRun, updateAdsterraRun } from '@/lib/aws/adsterra-helpers';

// POST /api/adsterra/runs/[runId]/stop - Stop a run
export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const run = await getAdsterraRun(params.runId);
    
    if (!run) {
      return NextResponse.json(
        { error: 'Run not found' },
        { status: 404 }
      );
    }

    // Update status to stopped
    // The EC2 worker will check the status and stop processing jobs
    await updateAdsterraRun(params.runId, {
      status: 'stopped',
    });

    return NextResponse.json({ 
      success: true, 
      status: 'stopped',
      message: 'Run stopped. EC2 workers will stop processing new jobs.'
    });
  } catch (error: any) {
    console.error('Error stopping run:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

