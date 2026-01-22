'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AdsterraRun, AdsterraStats } from '@/types/adsterra';

export default function AdsterraRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;
  
  const [run, setRun] = useState<AdsterraRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdsterraStats | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchRun();
    fetchStats();
    
    // Poll for run updates every 5 seconds (less frequent, run doesn't change much)
    const runInterval = setInterval(fetchRun, 5000);
    
    // Poll for stats every 1 second when running or completed (to catch final updates)
    const statsInterval = setInterval(() => {
      if (run?.status === 'running' || run?.status === 'completed') {
        fetchStats();
      }
    }, 1000);
    
    return () => {
      clearInterval(runInterval);
      clearInterval(statsInterval);
    };
  }, [runId, run?.status]);

  const fetchRun = async () => {
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}`);
      if (!res.ok) throw new Error('Failed to fetch run');
      const data = await res.json();
      setRun(data);
    } catch (error) {
      console.error('Error fetching run:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!runId) return;
    
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartProduction = async () => {
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}/start`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to start production run');
      await fetchRun();
      alert('Production run started! EC2 instances are launching and will begin processing in ~2 minutes.');
    } catch (error) {
      alert('Failed to start production run');
    }
  };

  const handleStartLocal = async () => {
    if (!confirm('This will run the test locally on your machine. Make sure you have:\n\n1. BrightData proxy credentials in .env\n2. AWS credentials configured\n3. Terminal/console visible to see output\n\nContinue?')) {
      return;
    }
    
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}/test-local`, {
        method: 'POST',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to start local test');
      }
      const data = await res.json();
      alert(data.message || 'Local test started! Check your terminal/console for output.');
      await fetchRun();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to start local test');
    }
  };

  const handleStop = async () => {
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}/stop`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to stop');
      await fetchRun();
    } catch (error) {
      alert('Failed to stop run');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">Run not found</div>
          <Link href="/adsterra" className="text-blue-600 hover:underline">
            Back to Adsterra
          </Link>
        </div>
      </div>
    );
  }

  const progress = stats ? (stats.completed / run.config.targetImpressions) * 100 : 0;
  const estimatedRevenue = stats ? stats.estimatedRevenue : 0;
  const estimatedCost = stats ? stats.estimatedCost : 0;
  const estimatedProfit = stats ? stats.estimatedProfit : 0;
  const dataUsedGB = stats ? stats.dataUsedGB : 0;
  const cpm = 2.365; // Actual CPM from user's data

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Link href="/adsterra" className="text-blue-600 hover:underline mb-2 inline-block">
            ← Back to Adsterra
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{run.name}</h1>
          <p className="text-gray-600">Run ID: {run.id}</p>
        </div>

        {/* Status and Controls */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <span className={`px-4 py-2 rounded-full text-sm font-medium ${
                run.status === 'running' ? 'bg-green-100 text-green-800' :
                run.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                run.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {run.status.toUpperCase()}
              </span>
            </div>
            <div className="flex gap-2">
              {run.status === 'running' ? (
                <button
                  onClick={handleStop}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Stop Run
                </button>
              ) : (
                <>
                  <button
                    onClick={handleStartLocal}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                  >
                    Start Local
                  </button>
                <button
                    onClick={handleStartProduction}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                    Start Production
                </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Real-Time Stats Overview - Direct Link Focus */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
              <div className="text-sm text-gray-500 mb-1">Impressions Generated</div>
              <div className="text-4xl font-bold text-green-600">{stats.impressions.toLocaleString()}</div>
              <div className="text-sm text-gray-500 mt-2">
                {stats.completed.toLocaleString()} sessions completed
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Target: {run.config.targetImpressions.toLocaleString()}
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="text-xs text-gray-500">Progress</div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min((stats.completed / run.config.targetImpressions) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
              <div className="text-sm text-gray-500 mb-1">Session Status</div>
              <div className="text-2xl font-bold text-blue-600">{stats.active.toLocaleString()}</div>
              <div className="text-sm text-gray-500 mt-1">Currently Active</div>
              <div className="text-xs text-gray-400 mt-2 space-y-1">
                <div>Waiting: {stats.waiting.toLocaleString()}</div>
                <div>Failed: <span className="text-red-600">{stats.failed.toLocaleString()}</span></div>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="text-xs text-green-600 font-semibold">
                  Success Rate: {stats.successRate.toFixed(1)}%
                </div>
                {run.config.concurrentJobs && (
                  <div className="text-xs text-blue-600 font-semibold mt-1">
                    Concurrency: {run.config.concurrentJobs} workers
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500">
              <div className="text-sm text-gray-500 mb-1">Estimated Revenue</div>
              <div className="text-3xl font-bold text-purple-600">${estimatedRevenue.toFixed(2)}</div>
              <div className="text-sm text-gray-500 mt-2">
                @ ${cpm} CPM per 1,000 impressions
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {stats.impressions.toLocaleString()} impressions × ${(cpm / 1000).toFixed(4)} = ${estimatedRevenue.toFixed(2)}
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-orange-500">
              <div className="text-sm text-gray-500 mb-1">Net Profit</div>
              <div className="text-3xl font-bold text-green-600">${estimatedProfit.toFixed(2)}</div>
              <div className="text-sm text-gray-500 mt-2">
                Revenue: ${estimatedRevenue.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Cost: ${estimatedCost.toFixed(2)} ({dataUsedGB.toFixed(3)} GB × $8/GB)
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="text-xs text-green-600 font-semibold">
                  Profit Margin: {estimatedRevenue > 0 ? ((estimatedProfit / estimatedRevenue) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm text-gray-500">{progress.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-gray-500">Adsterra Smart Link URL</span>
              <p className="font-medium text-xs break-all text-gray-900">{run.config?.adsterraUrl || run.config?.blogHomepageUrl || 'N/A'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Total Bots</span>
              <p className="font-medium text-gray-900">{run.config?.totalBots ? run.config.totalBots.toLocaleString() : 'N/A'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Sessions per Bot</span>
              <p className="font-medium text-gray-900">{run.config?.sessionsPerBot ?? 'N/A'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Target Impressions</span>
              <p className="font-medium text-gray-900">{run.config?.targetImpressions ? run.config.targetImpressions.toLocaleString() : 'N/A'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Browser Mode</span>
              <p className="font-medium text-gray-900">{run.config?.browserHeadless !== undefined ? (run.config.browserHeadless ? 'Headless' : 'Headed') : 'N/A'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Ad Wait Time</span>
              <p className="font-medium text-gray-900">
                {run.config?.minAdWait && run.config?.maxAdWait 
                  ? `${run.config.minAdWait / 1000}s - ${run.config.maxAdWait / 1000}s`
                  : 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Proxy Provider</span>
              <p className="font-medium text-gray-900">BrightData (Residential)</p>
            </div>
            {run.config?.concurrentJobs && (
              <div>
                <span className="text-sm text-gray-500">Concurrent Jobs</span>
                <p className="font-medium text-gray-900">{run.config.concurrentJobs}</p>
              </div>
            )}
          </div>
        </div>

        {/* Timestamps */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Timestamps</h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-500">Created:</span>
              <span className="ml-2">{new Date(run.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Last Updated:</span>
                <span className="ml-2">{lastUpdate.toLocaleTimeString()}</span>
                {isUpdating && (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-xs">Updating...</span>
                  </span>
                )}
              </div>
              <span className="ml-2">{new Date(run.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

