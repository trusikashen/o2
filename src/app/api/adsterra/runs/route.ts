import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import type { AdsterraRun, AdsterraConfig } from '@/types/adsterra';
import { createAdsterraRun, getAllAdsterraRuns } from '@/lib/aws/adsterra-helpers';
import { calculateOptimalConcurrency } from '@/lib/adsterra/concurrency-calculator';

// POST /api/adsterra/runs - Create a new run
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, config, assignedWorkerIds } = body;

    if (!name || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: name, config' },
        { status: 400 }
      );
    }

    // Validate config
    if (!config.adsterraUrl) {
      return NextResponse.json(
        { error: 'Invalid config: adsterraUrl is required' },
        { status: 400 }
      );
    }

    // Auto-calculate totalBots and sessionsPerBot from targetImpressions if needed
    let totalBots = config.totalBots;
    let sessionsPerBot = config.sessionsPerBot;
    
    if (config.targetImpressions) {
      const calculatedSessions = totalBots && sessionsPerBot ? totalBots * sessionsPerBot : 0;
      
      // If totalBots and sessionsPerBot don't match targetImpressions, auto-calculate
      if (calculatedSessions !== config.targetImpressions) {
        // Default to 10 sessions per bot, then calculate totalBots
        if (!sessionsPerBot) {
          sessionsPerBot = 10;
        }
        
        // Calculate totalBots to match targetImpressions exactly
        totalBots = Math.ceil(config.targetImpressions / sessionsPerBot);
        
        // Adjust sessionsPerBot for the last bot if needed to get exact match
        const exactSessions = totalBots * sessionsPerBot;
        if (exactSessions > config.targetImpressions) {
          // We'll handle this by creating fewer sessions for the last bot
          // But for simplicity, we'll just use the calculated values
          // The actual job creation will handle this
        }
        
        console.log(`⚠️  Auto-calculated: totalBots=${totalBots}, sessionsPerBot=${sessionsPerBot} to match targetImpressions=${config.targetImpressions}`);
      }
    }
    
    // Ensure we have valid values
    if (!totalBots || totalBots <= 0) {
      return NextResponse.json(
        { error: 'Invalid config: totalBots must be greater than 0. Provide totalBots or targetImpressions.' },
        { status: 400 }
      );
    }
    
    if (!sessionsPerBot || sessionsPerBot <= 0) {
      return NextResponse.json(
        { error: 'Invalid config: sessionsPerBot must be greater than 0' },
        { status: 400 }
      );
    }

    const runId = uuidv4();

    // Calculate optimal concurrency based on target impressions
    // If not provided, calculate it automatically
    const concurrentJobs = config.concurrentJobs || calculateOptimalConcurrency(config.targetImpressions || (totalBots * sessionsPerBot));

    const run: Omit<AdsterraRun, 'createdAt' | 'updatedAt'> = {
      id: runId,
      name,
      status: 'pending',
      config: {
        ...config,
        totalBots,
        sessionsPerBot,
        // Ensure targetImpressions matches totalBots * sessionsPerBot
        targetImpressions: config.targetImpressions || (totalBots * sessionsPerBot),
        concurrentJobs,
        pacingMode: config.pacingMode || 'human',
      } as AdsterraConfig,
      // Include assigned worker IDs if provided (e.g., for directing tasks to specific workers)
      assignedWorkerIds: assignedWorkerIds && Array.isArray(assignedWorkerIds) ? assignedWorkerIds : undefined,
    };

    // Save to DynamoDB
    await createAdsterraRun(run);

    // TODO: Trigger orchestrator to create jobs in queue
    // This will be handled by a separate worker process

    return NextResponse.json(run);
  } catch (error: any) {
    console.error('Error creating run:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/adsterra/runs - Get all runs
export async function GET() {
  try {
    const allRuns = await getAllAdsterraRuns();
    
    // Fetch stats from Redis queue for each run
    // TODO: Integrate with Redis to get real-time stats
    
    // Sort by creation date (newest first)
    allRuns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return NextResponse.json(allRuns);
  } catch (error: any) {
    console.error('Error fetching runs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
