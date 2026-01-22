const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

async function analyzeDetailedTimeline() {
  const workerId = process.argv[2] || 'worker-2';
  const currentTimeStr = process.argv[3]; // Optional: user's current time
  
  console.log(`\n📊 DETAILED EXECUTION TIMELINE FOR ${workerId}`);
  console.log('='.repeat(80));
  
  try {
    // Query jobs for the worker
    const command = new ScanCommand({
      TableName: 'AdsterraJobs',
      FilterExpression: 'attribute_exists(assignedWorkerId) AND assignedWorkerId = :workerId',
      ExpressionAttributeValues: {
        ':workerId': workerId,
      },
    });

    const response = await docClient.send(command);
    const jobs = response.Items || [];
    
    if (jobs.length === 0) {
      console.log(`❌ No jobs found for ${workerId}`);
      return;
    }

    // Sort by scheduledTime
    jobs.sort((a, b) => {
      const timeA = new Date(a.scheduledTime || '2000-01-01');
      const timeB = new Date(b.scheduledTime || '2000-01-01');
      return timeA - timeB;
    });

    // Get current time
    let currentTime;
    if (currentTimeStr) {
      // Parse user-provided time (HH:MM format)
      const [hours, minutes] = currentTimeStr.split(':').map(Number);
      currentTime = new Date();
      currentTime.setHours(hours, minutes, 0, 0);
      console.log(`\n⏰ User-provided time: ${currentTimeStr}`);
    } else {
      currentTime = new Date();
      console.log(`\n⏰ Current time: ${currentTime.toLocaleTimeString()}`);
    }

    // Group by run
    const runMap = {};
    jobs.forEach(job => {
      const runId = job.runId;
      if (!runMap[runId]) {
        runMap[runId] = [];
      }
      runMap[runId].push(job);
    });

    let totalTime = 0;
    let tasksCompleted = 0;
    let tasksReady = 0;
    let tasksPending = 0;

    // Analyze each run
    Object.entries(runMap).forEach(([runId, runJobs]) => {
      console.log(`\n📋 RUN: ${runId}`);
      console.log('-'.repeat(80));
      console.log(`Total jobs in run: ${runJobs.length}`);

      // Find first and last scheduled times
      const times = runJobs
        .filter(j => j.scheduledTime)
        .map(j => new Date(j.scheduledTime));
      
      if (times.length === 0) {
        console.log('⚠️  No scheduled times found in this run');
        return;
      }

      const firstTime = new Date(Math.min(...times.map(t => t.getTime())));
      const lastTime = new Date(Math.max(...times.map(t => t.getTime())));
      const runDuration = (lastTime - firstTime) / 1000 / 60; // minutes

      console.log(`⏱️  Scheduled span: ${firstTime.toLocaleTimeString()} → ${lastTime.toLocaleTimeString()}`);
      console.log(`📏 Duration: ${Math.round(runDuration)} minutes (${(runDuration / 60).toFixed(1)} hours)`);

      // Calculate job timings
      let avgIntervalMs = 0;
      if (runJobs.length > 1) {
        const intervals = [];
        for (let i = 1; i < runJobs.length; i++) {
          const prev = new Date(runJobs[i-1].scheduledTime).getTime();
          const curr = new Date(runJobs[i].scheduledTime).getTime();
          intervals.push(curr - prev);
        }
        avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      }

      console.log(`⏳ Average interval: ${Math.round(avgIntervalMs / 1000)} seconds`);

      // Estimate completion time (assuming avg session time of 120-150s)
      const avgSessionTime = 135; // seconds
      const estimatedCompletionMs = (runJobs.length * avgSessionTime * 1000) + avgIntervalMs;
      const estimatedCompletionMinutes = estimatedCompletionMs / 1000 / 60;

      console.log(`\n🎯 ESTIMATED EXECUTION:`);
      console.log(`  Start time: ${firstTime.toLocaleTimeString()}`);
      console.log(`  Execution duration: ~${Math.round(estimatedCompletionMinutes)} minutes (${(estimatedCompletionMinutes / 60).toFixed(1)} hours)`);
      
      const estimatedEndTime = new Date(firstTime.getTime() + estimatedCompletionMs);
      console.log(`  Estimated end time: ${estimatedEndTime.toLocaleTimeString()}`);

      totalTime += estimatedCompletionMinutes;

      // Status breakdown
      const active = runJobs.filter(j => j.status === 'active').length;
      const pending = runJobs.filter(j => j.status === 'pending').length;
      const completed = runJobs.filter(j => j.status === 'completed').length;

      console.log(`\n📊 JOB STATUS:`);
      console.log(`  ✅ Completed: ${completed}`);
      console.log(`  🔄 Active: ${active}`);
      console.log(`  ⏳ Pending: ${pending}`);

      tasksCompleted += completed;
      tasksPending += pending;

      // Show samples of ready/pending tasks
      console.log(`\n📌 TASK SAMPLES:`);
      
      // Find ready tasks (scheduled time <= currentTime)
      const readyTasks = runJobs.filter(j => {
        const scheduled = new Date(j.scheduledTime);
        return scheduled <= currentTime && j.status !== 'completed';
      }).slice(0, 5);

      if (readyTasks.length > 0) {
        console.log(`  ✅ Ready to execute NOW (${readyTasks.length}+ tasks):`);
        readyTasks.forEach((job, idx) => {
          const scheduled = new Date(job.scheduledTime);
          const waitTime = Math.round((currentTime - scheduled) / 1000 / 60);
          console.log(`     ${idx + 1}. ${job.botId} - scheduled ${waitTime}m ago - Status: ${job.status}`);
        });
        tasksReady += readyTasks.length;
      }

      // Find next pending tasks
      const nextTasks = runJobs.filter(j => {
        const scheduled = new Date(j.scheduledTime);
        return scheduled > currentTime && j.status !== 'completed';
      }).slice(0, 5);

      if (nextTasks.length > 0) {
        console.log(`  ⏳ Upcoming tasks (next execution window):`);
        nextTasks.forEach((job, idx) => {
          const scheduled = new Date(job.scheduledTime);
          const waitTime = Math.round((scheduled - currentTime) / 1000 / 60);
          console.log(`     ${idx + 1}. ${job.botId} - in ${waitTime} minutes (${scheduled.toLocaleTimeString()})`);
        });
      }
    });

    // SUMMARY
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📈 OVERALL SUMMARY FOR ${workerId}`);
    console.log('='.repeat(80));
    console.log(`Total jobs: ${jobs.length}`);
    console.log(`✅ Completed: ${tasksCompleted}`);
    console.log(`🟢 Ready NOW: ${tasksReady}+ tasks`);
    console.log(`⏳ Pending: ${tasksPending} tasks`);
    console.log(`\n⏱️  TOTAL ESTIMATED TIME: ${Math.round(totalTime)} minutes (~${(totalTime / 60).toFixed(1)} hours)`);
    
    // Estimate when all will finish
    const allTasksEndTime = new Date(currentTime.getTime() + (totalTime * 60 * 1000));
    console.log(`🎯 Estimated completion: ${allTasksEndTime.toLocaleTimeString()}`);
    
    console.log(`\n💡 TIMEZONE INFO:`);
    console.log(`Current system time: ${new Date().toLocaleString()}`);
    console.log(`User-provided time: ${currentTimeStr || 'Not specified'}`);
    console.log(`Timezone offset: ${new Date().getTimezoneOffset()} minutes from UTC`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

analyzeDetailedTimeline();
