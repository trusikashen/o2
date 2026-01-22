import { NextRequest, NextResponse } from 'next/server';
import { getAdsterraRun, updateAdsterraRun } from '@/lib/aws/adsterra-helpers';
import { createJobsForRun } from '@/lib/adsterra/create-jobs';
import { spawn } from 'child_process';
import path from 'path';

// POST /api/adsterra/runs/[runId]/test-local - Test run locally
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
        { error: 'Run is already running. Stop it first before testing locally.' },
        { status: 400 }
      );
    }

    // Create jobs in DynamoDB FIRST (before updating status)
    console.log(`Creating jobs for local test run ${params.runId}...`);
    try {
      await createJobsForRun(run);
      console.log(`✅ Jobs created for run ${params.runId}`);
    } catch (error: any) {
      console.error(`❌ Failed to create jobs: ${error.message}`);
      return NextResponse.json(
        { error: `Failed to create jobs: ${error.message}` },
        { status: 500 }
      );
    }

    // Update run status to indicate local testing (AFTER jobs are created)
    await updateAdsterraRun(params.runId, {
      status: 'running', // Mark as running so it shows as active
    });

    // Spawn local test script in background
    // In standalone adsterra folder, scripts are at process.cwd()/scripts/
    const scriptPath = path.join(process.cwd(), 'scripts', 'test-local.ts');
    
    console.log(`Spawning local test script: ${scriptPath}`);
    
    const child = spawn('npx', ['tsx', scriptPath, params.runId], {
      cwd: process.cwd(), // Already in adsterra folder
      stdio: 'inherit', // Inherit stdout/stderr so logs appear in console
      shell: true, // Use shell for Windows compatibility
      detached: false, // Keep attached so we can see output
    });

    // Handle process events
    child.on('error', (error) => {
      console.error(`Failed to start local test: ${error.message}`);
      updateAdsterraRun(params.runId, {
        status: 'stopped',
      }).catch(console.error);
    });

    child.on('exit', (code) => {
      console.log(`Local test process exited with code ${code}`);
      if (code === 0) {
        updateAdsterraRun(params.runId, {
          status: 'completed',
        }).catch(console.error);
      } else {
        updateAdsterraRun(params.runId, {
          status: 'stopped',
        }).catch(console.error);
      }
    });

    // Don't wait for process to complete - return immediately
    return NextResponse.json({ 
      success: true, 
      status: 'running',
      message: 'Local test started! Check your terminal/console for output. The test will process jobs sequentially.'
    });
  } catch (error: any) {
    console.error('Error starting local test:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

