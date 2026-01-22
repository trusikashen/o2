import { NextRequest, NextResponse } from 'next/server';
import { getJobsByStatus } from '@/queue/dynamodb-queue';

// GET /api/adsterra/runs/[runId]/schedule - Get all tasks for a specific run
export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    if (!runId) {
      return NextResponse.json(
        { error: 'runId is required' },
        { status: 400 }
      );
    }

    // Get all tasks with all statuses for this run
    const statuses = ['pending', 'active', 'completed', 'failed'] as const;
    const allJobs: any[] = [];
    const now = new Date();
    const nowMs = now.getTime();

    for (const status of statuses) {
      const jobs = await getJobsByStatus(status, 200);
      
      // Filter by runId
      const filteredJobs = jobs.filter((job: any) => job.runId === runId);
      
      if (filteredJobs.length > 0) {
        filteredJobs.forEach((job: any) => {
          const scheduledMs = job.scheduledTime.getTime();
          const delaySec = Math.round((scheduledMs - nowMs) / 1000);
          
          allJobs.push({
            id: job.id,
            botId: job.botId,
            sessionNumber: job.sessionNumber,
            status,
            scheduledTime: job.scheduledTime.toISOString(),
            scheduledTimeLocal: new Date(scheduledMs).toLocaleString('ru-RU', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            }),
            delay: delaySec,
            delayFormatted: formatDelay(delaySec)
          });
        });
      }
    }

    // Sort by scheduled time
    allJobs.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());

    return NextResponse.json({
      runId,
      currentTime: now.toISOString(),
      totalTasks: allJobs.length,
      tasks: allJobs,
      stats: {
        pending: allJobs.filter((j: any) => j.status === 'pending').length,
        active: allJobs.filter((j: any) => j.status === 'active').length,
        completed: allJobs.filter((j: any) => j.status === 'completed').length,
        failed: allJobs.filter((j: any) => j.status === 'failed').length,
      }
    });
  } catch (error: any) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function formatDelay(delaySec: number): string {
  if (delaySec < 0) {
    const absSec = Math.abs(delaySec);
    const mins = Math.floor(absSec / 60);
    const secs = absSec % 60;
    return mins > 0 ? `-${mins}m ${secs}s ago` : `-${secs}s ago`;
  }
  const mins = Math.floor(delaySec / 60);
  const secs = delaySec % 60;
  if (mins > 0) return `in ${mins}m ${secs}s`;
  return `in ${secs}s`;
}
