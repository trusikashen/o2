import { NextRequest, NextResponse } from 'next/server';
import { getAdsterraRun, updateAdsterraRun } from '@/lib/aws/adsterra-helpers';
import { createJobsForRun } from '@/lib/adsterra/create-jobs';

// EC2 instance launch removed - using DigitalOcean worker instead
// async function triggerInstanceLaunch(runId: string) { ... }

// POST /api/adsterra/runs/[runId]/start - Start a run
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

    if (run.status === 'running') {
      return NextResponse.json(
        { error: 'Run is already running' },
        { status: 400 }
      );
    }

    // Update run status to running
    await updateAdsterraRun(params.runId, {
      status: 'running',
    });

    // Create jobs in DynamoDB (non-blocking)
    // The worker will automatically pick up and process these jobs
    createJobsForRun(run).catch(async (error: any) => {
      console.error(`❌ Error creating jobs for run ${params.runId}:`, error);
      // PRODUCTION: Don't auto-stop runs on job creation errors
      // Log the error but keep the run status as 'running' so user can retry
      // The user can manually stop if needed
      console.error(`⚠️  Job creation failed, but run status remains 'running'. User can manually stop if needed.`);
    });

    return NextResponse.json({ 
      success: true, 
      status: 'running',
      message: 'Run started! Jobs created. Your DigitalOcean worker will pick them up automatically.'
    });
  } catch (error: any) {
    console.error('Error starting run:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

