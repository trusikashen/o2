'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Play, Square, Trash2, Calendar, TestTube, Info, Edit2, Check } from 'lucide-react';
import type { AdsterraRun, AdsterraConfig } from '@/types/adsterra';
import { getAllAdsterraProfitConfigs, type AdsterraProfitConfig } from '@/lib/adsterraProfitConfigs';
import { calculateOptimalConcurrency } from '@/lib/adsterra/concurrency-calculator';
import { calculateDistributionMatrix, type DistributionMatrix } from '@/lib/adsterra/distribution-calculator';

export default function AdsterraPage() {
  const [runs, setRuns] = useState<AdsterraRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [profitConfigs] = useState<AdsterraProfitConfig[]>(getAllAdsterraProfitConfigs());
  const [selectedProfitConfigId, setSelectedProfitConfigId] = useState<string>('');
  const [showProfitSelector, setShowProfitSelector] = useState(false); // Toggle profit section visibility
  const [showCreateRunForm, setShowCreateRunForm] = useState(false); // Toggle create run form visibility
  const [darkMode, setDarkMode] = useState(true);
  
  // Schedule view state
  const [showSchedule, setShowSchedule] = useState<string | null>(null);
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  
  // Stats state
  const [runStats, setRunStats] = useState<{ [runId: string]: any }>({});
  
  // Clear jobs progress state
  const [isClearing, setIsClearing] = useState(false);
  const [clearingProgress, setClearingProgress] = useState<{
    status: 'scanning' | 'deleting' | 'complete' | 'error';
    jobsFound: number;
    jobsDeleted: number;
    jobsFailed: number;
    currentBatch: number;
    totalBatches: number;
    message: string;
  } | null>(null);
  
  // ENV Modal state
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [envVariables, setEnvVariables] = useState<Record<string, string>>({});
  const [envLoading, setEnvLoading] = useState(false);
  const [envSaving, setEnvSaving] = useState(false);
  
  // Edit run name state
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [editingRunName, setEditingRunName] = useState('');

  // Form state
  const [runName, setRunName] = useState('');
  const [adsterraUrl, setAdsterraUrl] = useState('https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221');
  const [totalBots, setTotalBots] = useState(413);
  const [sessionsPerBot, setSessionsPerBot] = useState(1);
  const [targetImpressions, setTargetImpressions] = useState(413);
  const [browserHeadless, setBrowserHeadless] = useState(false);
  const [pacingMode, setPacingMode] = useState<NonNullable<AdsterraConfig['pacingMode']>>('human');
  const [pacingHours, setPacingHours] = useState(0.5); // Default: 30 minutes (0.5 hours) for reasonable pacing
  const [assignedWorkerIds, setAssignedWorkerIds] = useState<string[]>([]); // Worker IDs for assignment
  const [showWorkerSelector, setShowWorkerSelector] = useState(false); // Toggle worker selection dropdown
  
  // Mode: template or custom
  const [configMode, setConfigMode] = useState<'template' | 'custom'>('template');
  
  // Timing config (direct link approach - no scrolling needed)
  const [minScrollWait, setMinScrollWait] = useState(0); // Direct link - no scrolling
  const [maxScrollWait, setMaxScrollWait] = useState(0); // Direct link - no scrolling
  const [minAdWait, setMinAdWait] = useState(10000); // 10 seconds on Adsterra page
  const [maxAdWait, setMaxAdWait] = useState(30000); // 30 seconds on Adsterra page

  // Distribution config
  const [distribution, setDistribution] = useState({
    countries: {
      us: 50,
      uk: 17,
      fr: 11,
      es: 9,
      ie: 8,
      au: 5,
    },
    devices: {
      mobile: 70,
      tablet: 15,
      desktop: 15,
    },
    browsers: {
      safari: 60,  // iOS Safari (WebKit)
      chrome: 40,  // Android Chrome + Desktop Chrome/Edge (Chromium)
      // NOTE: Firefox removed due to proxy compatibility issues with BrightData
    },
  });

  // Calculate actual distribution matrix (matches backend exactly)
  const distributionMatrix = useMemo(() => {
    if (targetImpressions <= 0) return null;
    
    try {
      // Validate percentages sum to 100
      const countrySum = Object.values(distribution.countries).reduce((a, b) => a + b, 0);
      const deviceSum = Object.values(distribution.devices).reduce((a, b) => a + b, 0);
      const browserSum = Object.values(distribution.browsers).reduce((a, b) => a + b, 0);
      
      if (Math.abs(countrySum - 100) > 0.01 || Math.abs(deviceSum - 100) > 0.01 || Math.abs(browserSum - 100) > 0.01) {
        return null; // Invalid config
      }
      
      return calculateDistributionMatrix(distribution, targetImpressions);
    } catch (error) {
      console.error('Error calculating distribution matrix:', error);
      return null;
    }
  }, [distribution, targetImpressions]);

  // Get selected profit config
  const selectedConfig = profitConfigs.find(c => c.id === selectedProfitConfigId);

  // Apply selected config when changed - auto-populate ALL fields
  useEffect(() => {
    if (selectedConfig) {
      setTotalBots(selectedConfig.totalBots);
      setSessionsPerBot(selectedConfig.sessionsPerBot);
      setTargetImpressions(selectedConfig.targetImpressions);
      setMinScrollWait(selectedConfig.minScrollWait);
      setMaxScrollWait(selectedConfig.maxScrollWait);
      setMinAdWait(selectedConfig.minAdWait);
      setMaxAdWait(selectedConfig.maxAdWait);
      // Keep adsterraUrl pre-filled (don't change it)
    }
  }, [selectedConfig]);

  useEffect(() => {
    fetchRuns();
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/adsterra/runs');
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.warn('Expected runs array but got:', data);
        setRuns([]);
        return;
      }

      // Defensive: ignore any malformed run records (prevents /runs/undefined calls)
      const cleaned = data.filter((r: any) => r && typeof r.id === 'string' && r.id.trim().length > 0);
      if (cleaned.length !== data.length) {
        console.warn(`Filtered out ${data.length - cleaned.length} malformed run(s) missing id.`);
      }
      setRuns(cleaned);
      
      // Fetch stats for each run in parallel
      const statsPromises = cleaned.map((run: any) =>
        fetch(`/api/adsterra/runs/${run.id}/stats`)
          .then(res => res.json())
          .then(stats => ({ runId: run.id, stats }))
          .catch(err => {
            console.error(`Failed to fetch stats for run ${run.id}:`, err);
            return { runId: run.id, stats: null };
          })
      );
      
      const allStats = await Promise.all(statsPromises);
      const statsMap: { [key: string]: any } = {};
      allStats.forEach(({ runId, stats }) => {
        statsMap[runId] = stats;
      });
      setRunStats(statsMap);
    } catch (error) {
      console.error('Error fetching runs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!adsterraUrl.trim()) {
      alert('Please enter the Adsterra Smart Link URL');
      return;
    }

    setCreating(true);
    setSuccess(null);

    // Validate distribution percentages
    const countrySum = Object.values(distribution.countries).reduce((a, b) => a + b, 0);
    const deviceSum = Object.values(distribution.devices).reduce((a, b) => a + b, 0);
    const browserSum = Object.values(distribution.browsers).reduce((a, b) => a + b, 0);

    if (Math.abs(countrySum - 100) > 0.01) {
      alert(`Country percentages must sum to 100% (currently ${countrySum.toFixed(1)}%)`);
      setCreating(false);
      return;
    }
    if (Math.abs(deviceSum - 100) > 0.01) {
      alert(`Device percentages must sum to 100% (currently ${deviceSum.toFixed(1)}%)`);
      setCreating(false);
      return;
    }
    if (Math.abs(browserSum - 100) > 0.01) {
      alert(`Browser percentages must sum to 100% (currently ${browserSum.toFixed(1)}%)`);
      setCreating(false);
      return;
    }

    try {
      const payload = {
        name: runName || `Adsterra Run ${new Date().toLocaleString()}`,
        config: {
          adsterraUrl: adsterraUrl.trim(),
          totalBots,
          sessionsPerBot,
          targetImpressions,
          browserHeadless,
          minScrollWait,
          maxScrollWait,
          minAdWait,
          maxAdWait,
          pacingMode,
          pacingHours: pacingMode === 'human' ? pacingHours : undefined, // Only include for human mode
          distribution, // Include distribution config
        },
        ...(assignedWorkerIds.length > 0 && { assignedWorkerIds }), // Include worker IDs if any selected
      };

      const res = await fetch('/api/adsterra/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create run');
      }

      const data = await res.json();
      setSuccess(`Run created successfully! ID: ${data.id}`);
      
      // Reset form
      setRunName('');
      setAssignedWorkerIds([]); // Reset worker selection
      // Keep adsterraUrl pre-filled
      
      // Refresh runs
      await fetchRuns();
    } catch (error) {
      console.error('Error creating run:', error);
      alert(error instanceof Error ? error.message : 'Failed to create run');
    } finally {
      setCreating(false);
    }
  };

  const handleStartRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}/start`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to start run');
      await fetchRuns();
    } catch (error) {
      alert('Failed to start run');
    }
  };

  const handleTestLocally = async (runId: string) => {
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
      await fetchRuns();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to start local test');
    }
  };

  const handleStopRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}/stop`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to stop run');
      await fetchRuns();
    } catch (error) {
      alert('Failed to stop run');
    }
  };

  const handleDeleteRun = async (runId: string) => {
    if (!confirm('Are you sure you want to delete this run? All associated jobs will be deleted too.')) return;
    
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error('Failed to delete run');
      
      // Show success message with job deletion info
      const jobInfo = data.jobsDeleted > 0 ? ` and ${data.jobsDeleted} jobs` : '';
      setSuccess(`✅ Run deleted successfully${jobInfo}!`);
      setTimeout(() => setSuccess(null), 4000);
      
      await fetchRuns();
    } catch (error) {
      alert(`Failed to delete run: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleClearAllJobs = async () => {
    if (!confirm('⚠️ This will delete ALL jobs from DynamoDB. Are you sure?')) return;
    if (!confirm('🚨 LAST WARNING: This action cannot be undone. Delete all jobs?')) return;
    
    setIsClearing(true);
    setClearingProgress({
      status: 'scanning',
      jobsFound: 0,
      jobsDeleted: 0,
      jobsFailed: 0,
      currentBatch: 0,
      totalBatches: 0,
      message: '🔍 Scanning for jobs in DynamoDB...',
    });
    
    try {
      const res = await fetch('/api/jobs/clear', {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (!res.ok) {
        setClearingProgress({
          status: 'error',
          jobsFound: 0,
          jobsDeleted: 0,
          jobsFailed: 0,
          currentBatch: 0,
          totalBatches: 0,
          message: `❌ Error: ${data.message}`,
        });
        return;
      }
      
      setClearingProgress({
        status: 'complete',
        jobsFound: data.jobsFound || data.deletedCount + data.failedCount,
        jobsDeleted: data.deletedCount,
        jobsFailed: data.failedCount,
        currentBatch: 0,
        totalBatches: 0,
        message: data.message,
      });
      
      setTimeout(() => {
        setIsClearing(false);
        setClearingProgress(null);
        setSuccess(`✨ ${data.message}`);
        setTimeout(() => setSuccess(null), 5000);
      }, 2000);
      
      await fetchRuns();
    } catch (error) {
      setClearingProgress({
        status: 'error',
        jobsFound: 0,
        jobsDeleted: 0,
        jobsFailed: 0,
        currentBatch: 0,
        totalBatches: 0,
        message: `❌ Failed to clear jobs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  const handleViewSchedule = async (runId: string) => {
    setShowSchedule(runId);
    setScheduleLoading(true);
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}/schedule`);
      if (!res.ok) throw new Error('Failed to fetch schedule');
      const data = await res.json();
      setScheduleData(data);
    } catch (error) {
      alert('Failed to fetch schedule');
      setShowSchedule(null);
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleOpenEnvModal = async () => {
    setShowEnvModal(true);
    setEnvLoading(true);
    try {
      const res = await fetch('/api/env');
      const data = await res.json();
      setEnvVariables(data.variables || {});
    } catch (error) {
      alert('Failed to load environment variables');
      setShowEnvModal(false);
    } finally {
      setEnvLoading(false);
    }
  };

  const handleSaveEnvVariables = async () => {
    setEnvSaving(true);
    try {
      const res = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: envVariables }),
      });
      if (!res.ok) {
        throw new Error('Failed to save environment variables');
      }
      setSuccess('✅ Environment variables saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
      setShowEnvModal(false);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to save: ${errorMsg}`);
    } finally {
      setEnvSaving(false);
    }
  };

  const isSubmitDisabled = creating || !adsterraUrl.trim();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 transition-colors ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex justify-between items-center flex-wrap gap-3">
          <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>🤖 AIX Bot System</h1>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-3 py-2 rounded font-medium ${darkMode ? 'bg-slate-700 text-yellow-400 hover:bg-slate-600' : 'bg-gray-300 text-gray-900 hover:bg-gray-400'}`}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button
              onClick={handleOpenEnvModal}
              className={`px-3 py-2 rounded font-medium ${darkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-200 text-slate-900 hover:bg-slate-300'}`}
              title="Edit environment variables"
            >
              ⚙️ ENV
            </button>
            <button
              onClick={handleClearAllJobs}
              className="px-3 py-2 rounded font-medium bg-red-600 text-white hover:bg-red-700"
              title="Delete all jobs from DynamoDB"
            >
              🗑️ Clear All Jobs
            </button>
            <Link
              href="/admin/workers"
              className={`px-3 py-2 rounded font-medium ${darkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-200 text-slate-900 hover:bg-slate-300'}`}
            >
              ⚙️ Workers
            </Link>
          </div>
        </div>

        {success && (
          <div className={`mb-4 p-3 rounded text-sm border ${darkMode ? 'bg-green-900 border-green-700 text-green-200' : 'bg-green-50 border-green-200 text-green-800'}`}>
            ✅ {success}
          </div>
        )}

        {/* Clear Jobs Progress Modal */}
        {clearingProgress && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`rounded-lg p-8 max-w-2xl w-full mx-4 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}`}>
              <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {clearingProgress.status === 'scanning' && '🔍 Scanning Jobs'}
                {clearingProgress.status === 'deleting' && '🗑️ Deleting Jobs'}
                {clearingProgress.status === 'complete' && '✅ Operation Complete'}
                {clearingProgress.status === 'error' && '❌ Error'}
              </h2>

              {/* Status Message */}
              <div className={`mb-6 p-4 rounded-lg ${
                clearingProgress.status === 'error' ? 
                  (darkMode ? 'bg-red-900 border border-red-700' : 'bg-red-50 border border-red-200') :
                  (darkMode ? 'bg-slate-700 border border-slate-600' : 'bg-gray-100 border border-gray-300')
              }`}>
                <p className={`text-lg font-semibold ${
                  clearingProgress.status === 'error' ?
                    (darkMode ? 'text-red-200' : 'text-red-800') :
                    (darkMode ? 'text-gray-200' : 'text-gray-700')
                }`}>
                  {clearingProgress.message}
                </p>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Jobs Found</p>
                  <p className={`text-3xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                    {clearingProgress.jobsFound.toLocaleString()}
                  </p>
                </div>

                <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Deleted</p>
                  <p className={`text-3xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                    {clearingProgress.jobsDeleted.toLocaleString()}
                  </p>
                </div>

                <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Failed</p>
                  <p className={`text-3xl font-bold ${clearingProgress.jobsFailed > 0 ? (darkMode ? 'text-orange-400' : 'text-orange-600') : (darkMode ? 'text-green-400' : 'text-green-600')}`}>
                    {clearingProgress.jobsFailed.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              {clearingProgress.status !== 'complete' && clearingProgress.status !== 'error' && (
                <div className="mb-6">
                  <div className={`w-full h-3 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-gray-300'}`}>
                    <div className={`h-full bg-blue-500 transition-all duration-300`} 
                         style={{width: '50%'}}></div>
                  </div>
                  <p className={`text-sm mt-2 text-center ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Processing...
                  </p>
                </div>
              )}

              {/* Success Progress Bar */}
              {clearingProgress.status === 'complete' && clearingProgress.jobsFound > 0 && (
                <div className="mb-6">
                  <div className={`w-full h-3 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-gray-300'}`}>
                    <div className={`h-full bg-green-500`} 
                         style={{width: '100%'}}></div>
                  </div>
                  <p className={`text-sm mt-2 text-center ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                    Success! {((clearingProgress.jobsDeleted / clearingProgress.jobsFound) * 100).toFixed(1)}% deleted successfully
                  </p>
                </div>
              )}

              {/* Close Button */}
              {(clearingProgress.status === 'complete' || clearingProgress.status === 'error') && (
                <button
                  onClick={() => {
                    setIsClearing(false);
                    setClearingProgress(null);
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        )}

        {/* ENV Configuration Modal */}
        {showEnvModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}`}>
              <div className="sticky top-0 flex justify-between items-center p-4 border-b" style={{borderColor: darkMode ? '#374151' : '#e5e7eb'}}>
                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>⚙️ Environment Configuration</h2>
                <button
                  onClick={() => setShowEnvModal(false)}
                  className={`text-xl hover:opacity-70 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                {envLoading ? (
                  <div className="text-center py-8">
                    <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Loading environment variables...</p>
                  </div>
                ) : (
                  <>
                    {/* Proxy Settings */}
                    <div className={`rounded-lg p-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Proxy Configuration</h3>
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Proxy Provider</label>
                          <select
                            value={envVariables['PROXY_PROVIDER'] || 'brightdata'}
                            onChange={(e) => setEnvVariables({...envVariables, PROXY_PROVIDER: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          >
                            <option value="brightdata">BrightData</option>
                            <option value="dataimpulse">DataImpulse</option>
                            <option value="iproyal">IPRoyal</option>
                          </select>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>BrightData Host</label>
                          <input
                            type="text"
                            value={envVariables['BRIGHTDATA_HOST'] || ''}
                            onChange={(e) => setEnvVariables({...envVariables, BRIGHTDATA_HOST: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>BrightData Port</label>
                          <input
                            type="text"
                            value={envVariables['BRIGHTDATA_PORT'] || ''}
                            onChange={(e) => setEnvVariables({...envVariables, BRIGHTDATA_PORT: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>BrightData Username</label>
                          <input
                            type="text"
                            value={envVariables['BRIGHTDATA_USERNAME'] || ''}
                            onChange={(e) => setEnvVariables({...envVariables, BRIGHTDATA_USERNAME: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>BrightData Password</label>
                          <input
                            type="password"
                            value={envVariables['BRIGHTDATA_PASSWORD'] || ''}
                            onChange={(e) => setEnvVariables({...envVariables, BRIGHTDATA_PASSWORD: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>BrightData Zone</label>
                          <input
                            type="text"
                            value={envVariables['BRIGHTDATA_ZONE'] || ''}
                            onChange={(e) => setEnvVariables({...envVariables, BRIGHTDATA_ZONE: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* AWS Configuration */}
                    <div className={`rounded-lg p-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>AWS Configuration</h3>
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>AWS Region</label>
                          <select
                            value={envVariables['AWS_REGION'] || 'us-east-1'}
                            onChange={(e) => setEnvVariables({...envVariables, AWS_REGION: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          >
                            <option value="us-east-1">US East (N. Virginia)</option>
                            <option value="us-west-2">US West (Oregon)</option>
                            <option value="eu-west-1">EU (Ireland)</option>
                            <option value="eu-central-1">EU (Frankfurt)</option>
                          </select>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>AWS Access Key ID</label>
                          <input
                            type="password"
                            value={envVariables['AWS_ACCESS_KEY_ID'] || ''}
                            onChange={(e) => setEnvVariables({...envVariables, AWS_ACCESS_KEY_ID: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>AWS Secret Access Key</label>
                          <input
                            type="password"
                            value={envVariables['AWS_SECRET_ACCESS_KEY'] || ''}
                            onChange={(e) => setEnvVariables({...envVariables, AWS_SECRET_ACCESS_KEY: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bot Configuration */}
                    <div className={`rounded-lg p-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Bot Configuration</h3>
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Browser Headless</label>
                          <select
                            value={envVariables['BROWSER_HEADLESS'] === 'true' ? 'true' : 'false'}
                            onChange={(e) => setEnvVariables({...envVariables, BROWSER_HEADLESS: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          >
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Browser Timeout (ms)</label>
                          <input
                            type="number"
                            value={envVariables['BROWSER_TIMEOUT'] || '30000'}
                            onChange={(e) => setEnvVariables({...envVariables, BROWSER_TIMEOUT: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Max Worker Threads</label>
                          <input
                            type="number"
                            value={envVariables['MAX_WORKER_THREADS'] || '5'}
                            onChange={(e) => setEnvVariables({...envVariables, MAX_WORKER_THREADS: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Timing Configuration */}
                    <div className={`rounded-lg p-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Timing Configuration</h3>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Min Scroll Wait (ms)</label>
                            <input
                              type="number"
                              value={envVariables['MIN_SCROLL_WAIT'] || '500'}
                              onChange={(e) => setEnvVariables({...envVariables, MIN_SCROLL_WAIT: e.target.value})}
                              className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Max Scroll Wait (ms)</label>
                            <input
                              type="number"
                              value={envVariables['MAX_SCROLL_WAIT'] || '1500'}
                              onChange={(e) => setEnvVariables({...envVariables, MAX_SCROLL_WAIT: e.target.value})}
                              className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Min Ad Wait (ms)</label>
                            <input
                              type="number"
                              value={envVariables['MIN_AD_WAIT'] || '10000'}
                              onChange={(e) => setEnvVariables({...envVariables, MIN_AD_WAIT: e.target.value})}
                              className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Max Ad Wait (ms)</label>
                            <input
                              type="number"
                              value={envVariables['MAX_AD_WAIT'] || '30000'}
                              onChange={(e) => setEnvVariables({...envVariables, MAX_AD_WAIT: e.target.value})}
                              className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nav Retries</label>
                            <input
                              type="number"
                              value={envVariables['NAV_RETRIES'] || '5'}
                              onChange={(e) => setEnvVariables({...envVariables, NAV_RETRIES: e.target.value})}
                              className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nav Backoff (ms)</label>
                            <input
                              type="number"
                              value={envVariables['NAV_BACKOFF_MS'] || '500'}
                              onChange={(e) => setEnvVariables({...envVariables, NAV_BACKOFF_MS: e.target.value})}
                              className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Min Interactions</label>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={envVariables['MIN_INTERACTIONS'] || '0'}
                              onChange={(e) => setEnvVariables({...envVariables, MIN_INTERACTIONS: e.target.value})}
                              className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            />
                            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>Random per bot</p>
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Max Interactions</label>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={envVariables['MAX_INTERACTIONS'] || '6'}
                              onChange={(e) => setEnvVariables({...envVariables, MAX_INTERACTIONS: e.target.value})}
                              className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            />
                            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>Random per bot</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Queue Configuration */}
                    <div className={`rounded-lg p-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Queue Configuration</h3>
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Queue Poll Interval (ms)</label>
                          <input
                            type="number"
                            value={envVariables['QUEUE_POLL_INTERVAL'] || '1000'}
                            onChange={(e) => setEnvVariables({...envVariables, QUEUE_POLL_INTERVAL: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Max Retries</label>
                          <input
                            type="number"
                            value={envVariables['MAX_RETRIES'] || '3'}
                            onChange={(e) => setEnvVariables({...envVariables, MAX_RETRIES: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* DynamoDB Configuration */}
                    <div className={`rounded-lg p-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>DynamoDB Tables</h3>
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Runs Table</label>
                          <input
                            type="text"
                            value={envVariables['DYNAMODB_ADSTERRA_RUNS_TABLE'] || 'AdsterraRuns'}
                            onChange={(e) => setEnvVariables({...envVariables, DYNAMODB_ADSTERRA_RUNS_TABLE: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Jobs Table</label>
                          <input
                            type="text"
                            value={envVariables['DYNAMODB_ADSTERRA_JOBS_TABLE'] || 'AdsterraJobs'}
                            onChange={(e) => setEnvVariables({...envVariables, DYNAMODB_ADSTERRA_JOBS_TABLE: e.target.value})}
                            className={`w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {!envLoading && (
                <div className="sticky bottom-0 flex gap-2 p-4 border-t" style={{borderColor: darkMode ? '#374151' : '#e5e7eb', background: darkMode ? '#1e293b' : '#f9fafb'}}>
                  <button
                    onClick={() => setShowEnvModal(false)}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium ${darkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-gray-200 text-gray-900 hover:bg-gray-300'}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEnvVariables}
                    disabled={envSaving}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {envSaving ? 'Saving...' : '💾 Save'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Runs List - Active Runs at Top */}
        <div className={`rounded-lg p-2 mb-3 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}`}>
          <h2 className={`text-lg font-semibold mb-1.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Active Runs</h2>
          {runs.length === 0 ? (
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>No runs yet. Create one below.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {runs.map((run) => {
                const totalSessions = (run?.config?.totalBots || 0) * (run?.config?.sessionsPerBot || 0);
                const createdAt = run.createdAt ? new Date(run.createdAt).toLocaleString() : null;
                
                return (
                <>
                  {run.status === 'running' && (
                    <style>{`
                      @keyframes greenPulse {
                        0%, 100% { 
                          box-shadow: 0 0 0 2px rgb(31, 41, 55), 0 0 15px 4px rgba(34, 197, 94, 0.8);
                          border-color: rgba(34, 197, 94, 0.8);
                        }
                        50% { 
                          box-shadow: 0 0 0 2px rgb(31, 41, 55), 0 0 25px 8px rgba(34, 197, 94, 1);
                          border-color: rgba(34, 197, 94, 1);
                        }
                      }
                      #run-${run.id} {
                        position: relative;
                        animation: greenPulse 2s ease-in-out infinite;
                      }
                    `}</style>
                  )}
                  <div key={run.id} id={`run-${run.id}`} className={`border rounded p-1 transition-all ${run.status === 'running' ? 'relative' : ''} ${darkMode ? (run.status === 'running' ? 'bg-slate-700 hover:bg-slate-650' : 'border-slate-600 bg-slate-700 hover:bg-slate-650') : (run.status === 'running' ? 'bg-white hover:shadow-md shadow-lg' : 'border-gray-200 bg-white hover:shadow-md')}`}>
                <div className="flex justify-between items-start gap-1 mb-0.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap mb-0.5">
                        {editingRunId === run.id ? (
                          <input
                            type="text"
                            value={editingRunName}
                            onChange={(e) => setEditingRunName(e.target.value)}
                            onBlur={async () => {
                              // ЗАДАЧА: Переименование Run
                              // API endpoint: PATCH /api/adsterra/runs/:runId
                              // Отправляет: { name: editingRunName }
                              // TODO: Проверить, что API правильно сохраняет имя в БД
                              // и возвращает обновленные данные
                              try {
                                const res = await fetch(`/api/adsterra/runs/${run.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: editingRunName })
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  // Обновляем список runs с новым именем
                                  setRuns(prevRuns => 
                                    prevRuns.map(r => 
                                      r.id === run.id ? { ...r, name: editingRunName } : r
                                    )
                                  );
                                  setEditingRunId(null);
                                  // Перезагружаем для уверенности
                                  await fetchRuns();
                                } else {
                                  const error = await res.json();
                                  console.error('API Error:', error);
                                  alert(`Ошибка сохранения: ${error.error || 'Unknown error'}`);
                                }
                              } catch (error) {
                                console.error('Failed to update run name:', error);
                                alert(`Ошибка: ${error instanceof Error ? error.message : 'Failed to save name'}`);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            autoFocus
                            className={`text-sm font-bold px-2 py-1 rounded border ${darkMode ? 'bg-yellow-900 border-yellow-700 text-yellow-100' : 'bg-yellow-100 border-yellow-300 text-gray-900'}`}
                          />
                        ) : (
                          <h3 
                            className={`font-bold text-sm cursor-pointer transition-colors ${darkMode ? 'text-white hover:text-yellow-300' : 'text-gray-900 hover:text-blue-600'}`}
                            onClick={() => {
                              setEditingRunId(run.id);
                              setEditingRunName(run.name || 'Unnamed Run');
                            }}
                            title="Click to rename"
                          >
                            {run.name || 'Unnamed Run'}
                          </h3>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      run.status === 'running' ? (darkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800') :
                      run.status === 'paused' ? (darkMode ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800') :
                      run.status === 'completed' ? (darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800') :
                          run.status === 'failed' ? (darkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800') :
                      (darkMode ? 'bg-slate-600 text-slate-200' : 'bg-gray-100 text-gray-800')
                    }`}>
                          {run.status?.toUpperCase() || 'PENDING'}
                    </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs flex-wrap">
                        {createdAt && (
                          <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Created: {createdAt}</span>
                        )}
                        <span className={`font-mono ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>ID: {run.id}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Key Metrics - Enlarged & More Visible */}
                  <div className={`mb-1 p-1 rounded border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mb-1">
                      {/* Row 1: Worker & Target & Sessions & Config */}
                      <div className={`p-1 rounded text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>👷 Worker</p>
                        <div className="flex items-center justify-center gap-1">
                          <p className={`font-bold text-sm px-1.5 py-0.5 rounded ${darkMode ? 'bg-green-900/50 text-green-300 border border-green-700' : 'bg-green-100 text-green-800 border border-green-300'}`}>
                            {run?.assignedWorkerIds?.[0] ?? 'Any Worker'}
                          </p>
                          {run.status === 'running' && (
                            <style>{`
                              @keyframes pulse-indicator {
                                0%, 100% { opacity: 1; }
                                50% { opacity: 0.3; }
                              }
                              .worker-pulse { animation: pulse-indicator 1.5s ease-in-out infinite; }
                            `}</style>
                          )}
                          {run.status === 'running' && (
                            <span className="worker-pulse text-lg" title="Worker is executing">🔄</span>
                          )}
                        </div>
                      </div>

                      <div className={`p-1 rounded text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>👁️ Target</p>
                        <p className={`font-bold text-sm ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                          {typeof run?.config?.targetImpressions === 'number'
                            ? (run.config.targetImpressions / 1000).toFixed(1) + 'k'
                            : '—'}
                        </p>
                      </div>

                      <div className={`p-1 rounded text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>📊 Sessions</p>
                        <p className={`font-bold text-sm ${darkMode ? 'text-purple-300' : 'text-purple-600'}`}>
                          {totalSessions > 0 ? (totalSessions / 1000).toFixed(1) + 'k' : '—'}
                        </p>
                      </div>

                      <div className={`p-1 rounded text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>⚙️ Config</p>
                        <p className={`font-bold text-sm ${darkMode ? 'text-amber-300' : 'text-amber-600'}`}>
                          {run?.config?.totalBots || '—'} × {run?.config?.sessionsPerBot || '—'}
                        </p>
                      </div>
                    </div>

                    {/* Row 2: Pacing, Mode, Bot Index, Status */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                      <div className={`p-1 rounded text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>🐇 Pacing</p>
                        <p className={`font-bold text-sm capitalize ${darkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>
                          {run?.config?.pacingMode === 'human' ? 'Human' : run?.config?.pacingMode === 'fast' ? 'Fast' : 'Standard'}
                        </p>
                      </div>

                      <div className={`p-1 rounded text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>🖥️ Browser</p>
                        <p className={`font-bold text-sm ${run?.config?.browserHeadless !== false ? (darkMode ? 'text-gray-300' : 'text-gray-600') : (darkMode ? 'text-yellow-300' : 'text-yellow-600')}`}>
                          {run?.config?.browserHeadless !== false ? 'Headless' : 'UI'}
                        </p>
                      </div>

                      <div className={`p-1 rounded text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>📍 Bot #</p>
                        <p className={`font-bold text-sm ${darkMode ? 'text-cyan-300' : 'text-cyan-600'}`}>
                          {run?.config?.currentBotIndex !== undefined && run?.config?.currentBotIndex !== null 
                            ? `${(run.config.currentBotIndex || 0) + 1}` 
                            : (run?.config?.totalBots ? 'Ready' : '—')}
                        </p>
                      </div>

                      <div className={`p-1 rounded text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>✨ Status</p>
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                          run.status === 'running' ? (darkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800') :
                          run.status === 'paused' ? (darkMode ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800') :
                          run.status === 'completed' ? (darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800') :
                          run.status === 'failed' ? (darkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800') :
                          (darkMode ? 'bg-slate-600 text-slate-200' : 'bg-gray-100 text-gray-800')
                        }`}>
                          {run.status?.toUpperCase() || 'PENDING'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats if available */}
                  {runStats[run.id] && (
                    <div className={`mb-1 p-1 rounded border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                      <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>📊 Job Queue Status</p>
                      <div className="grid grid-cols-4 gap-1">
                        <div 
                          className={`rounded px-1 py-0.5 text-center cursor-help transition-opacity hover:opacity-80 ${darkMode ? 'bg-slate-600 text-yellow-300' : 'bg-white text-yellow-600'}`}
                          title="Waiting: Jobs in queue, not yet started"
                        >
                          <span className="block font-semibold text-base">⏳</span>
                          <p className="font-bold text-sm">
                            {(runStats[run.id]?.total || totalSessions) - (runStats[run.id]?.active || 0) - (runStats[run.id]?.completed || 0) - (runStats[run.id]?.failed || 0)}
                          </p>
                          <p className="text-xs">Waiting</p>
                        </div>
                        <div 
                          className={`rounded px-1 py-0.5 text-center cursor-help transition-opacity hover:opacity-80 ${darkMode ? 'bg-slate-600 text-green-300' : 'bg-white text-green-600'}`}
                          title="Active: Jobs currently running in browsers"
                        >
                          <span className="block font-semibold text-base">🟢</span>
                          <p className="font-bold text-sm">
                            {runStats[run.id]?.active || 0}
                          </p>
                          <p className="text-xs">Active</p>
                        </div>
                        <div 
                          className={`rounded px-1 py-0.5 text-center cursor-help transition-opacity hover:opacity-80 ${darkMode ? 'bg-slate-600 text-blue-300' : 'bg-white text-blue-600'}`}
                          title="Completed: Successful job executions"
                        >
                          <span className="block font-semibold text-base">✅</span>
                          <p className="font-bold text-sm">
                            {runStats[run.id]?.completed || 0}
                          </p>
                          <p className="text-xs">Completed</p>
                        </div>
                        <div 
                          className={`rounded px-1 py-0.5 text-center cursor-help transition-opacity hover:opacity-80 ${darkMode ? 'bg-slate-600 text-red-300' : 'bg-white text-red-600'}`}
                          title="Failed: Jobs that encountered errors"
                        >
                          <span className="block font-semibold text-base">❌</span>
                          <p className="font-bold text-sm">
                            {runStats[run.id]?.failed || 0}
                          </p>
                          <p className="text-xs">Failed</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Configuration Details */}
                  <div className="mb-1">
                    <details className={`cursor-pointer font-medium ${darkMode ? 'text-slate-300 hover:text-slate-100' : 'text-gray-600 hover:text-gray-900'}`}>
                      <summary className={`py-0.5 px-2 rounded-lg font-semibold text-xs uppercase tracking-wide transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'}`}>
                        ⚙️ Config
                      </summary>
                      <div className={`mt-0.5 p-1 rounded-lg space-y-1 ${darkMode ? 'bg-slate-700 border border-slate-600 text-slate-200' : 'bg-white border border-gray-200 text-gray-700'}`}>
                        <div>
                          <p className={`text-xs font-semibold uppercase mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>🔗 URL</p>
                          <p className="break-all font-mono text-xs px-1 py-0.5 rounded bg-opacity-50 bg-slate-900">{run?.config?.adsterraUrl || 'N/A'}</p>
                        </div>
                        {run?.config?.distribution && (
                          <p className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                            🌍 {Object.keys(run.config.distribution.countries || {}).length} countries | 🖥️ {Object.keys(run.config.distribution.devices || {}).length} devices | 🌐 {Object.keys(run.config.distribution.browsers || {}).length} browsers
                          </p>
                        )}
                      </div>
                    </details>
                  </div>

                  <div className="flex gap-1 mt-1 flex-wrap">
                    <Link
                      href={`/adsterra/${run.id}`}
                      className={`px-2 py-1 rounded-lg font-semibold text-xs transition-all transform hover:scale-105 ${darkMode ? 'bg-blue-700 hover:bg-blue-600 text-white shadow' : 'bg-blue-600 hover:bg-blue-700 text-white shadow'}`}
                    >
                      Details
                    </Link>
                    <button
                      onClick={() => handleViewSchedule(run.id)}
                      className={`px-2 py-1 rounded-lg font-semibold text-xs transition-all transform hover:scale-105 ${darkMode ? 'bg-indigo-700 hover:bg-indigo-600 text-white shadow' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow'}`}
                    >
                      Schedule
                    </button>
                    {run.status === 'running' ? (
                      <button
                        onClick={() => handleStopRun(run.id)}
                        className={`px-2 py-1 rounded-lg font-semibold text-xs transition-all transform hover:scale-105 ${darkMode ? 'bg-red-700 hover:bg-red-600 text-white shadow' : 'bg-red-600 hover:bg-red-700 text-white shadow'}`}
                      >
                        Stop
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartRun(run.id)}
                          className={`px-2 py-1 rounded-lg font-semibold text-xs transition-all transform hover:scale-105 ${darkMode ? 'bg-green-700 hover:bg-green-600 text-white shadow' : 'bg-green-600 hover:bg-green-700 text-white shadow'}`}
                        >
                          Start
                        </button>
                        <button
                          onClick={() => handleTestLocally(run.id)}
                          className={`px-2 py-1 rounded-lg font-semibold text-xs transition-all transform hover:scale-105 ${darkMode ? 'bg-purple-700 hover:bg-purple-600 text-white shadow' : 'bg-purple-600 hover:bg-purple-700 text-white shadow'}`}
                        >
                          Test
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteRun(run.id)}
                      className={`px-2 py-1 rounded-lg font-semibold text-xs transition-all transform hover:scale-105 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white shadow' : 'bg-gray-600 hover:bg-gray-700 text-white shadow'}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                </>
                );
              })}
            </div>
          )}
        </div>

        {/* Create Run Form - Collapsible & Compact - APPEARS FIRST */}
        <div className={`rounded-lg mb-8 border transition-all ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          {/* Header with Toggle */}
          <button
            onClick={() => setShowCreateRunForm(!showCreateRunForm)}
            className={`w-full px-4 py-3 flex justify-between items-center font-semibold transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-50 text-gray-900'
            }`}
          >
            <span>🚀 Create New Run</span>
            <span className={`transition-transform ${showCreateRunForm ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {/* Collapsible Form */}
          {showCreateRunForm && (
            <div className={`p-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Mode Selection - Compact */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setConfigMode('template')}
                    className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      configMode === 'template'
                        ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                        : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigMode('custom')}
                    className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      configMode === 'custom'
                        ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                        : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {/* Pacing Mode - Compact */}
                <div className={`p-3 rounded text-sm ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                  <p className={`font-medium mb-2 text-xs uppercase ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Pacing</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPacingMode('human')}
                      className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
                        pacingMode === 'human'
                          ? darkMode ? 'bg-green-600 text-white' : 'bg-green-600 text-white'
                          : darkMode ? 'bg-slate-600 text-slate-300' : 'bg-white border border-gray-300'
                      }`}
                    >
                      Human
                    </button>
                    <button
                      type="button"
                      onClick={() => setPacingMode('fast')}
                      className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
                        pacingMode === 'fast'
                          ? darkMode ? 'bg-green-600 text-white' : 'bg-green-600 text-white'
                          : darkMode ? 'bg-slate-600 text-slate-300' : 'bg-white border border-gray-300'
                      }`}
                    >
                      Fast
                    </button>
                  </div>
                </div>

                {/* Worker Assignment - Collapsible Compact */}
                <div className="space-y-2">
                  {(() => {
                    // Get list of active workers (currently running)
                    const activeWorkers = new Set<string>();
                    // Get list of used workers (any task that isn't completed or failed)
                    const usedWorkers = new Set<string>();
                    
                    runs.forEach(run => {
                      if (run.assignedWorkerIds) {
                        // Active: only running tasks
                        if (run.status === 'running') {
                          run.assignedWorkerIds.forEach(id => activeWorkers.add(id));
                        }
                        // Used: any task that isn't completed or failed (pending, running, paused, etc)
                        if (run.status !== 'completed' && run.status !== 'failed') {
                          run.assignedWorkerIds.forEach(id => usedWorkers.add(id));
                        }
                      }
                    });
                    
                    return (
                      <>
                        <style>{`
                          @keyframes pulse-red {
                            0%, 100% { background-color: rgb(30, 41, 59); color: rgb(100, 116, 139); border-color: rgb(51, 65, 85); }
                            50% { background-color: rgb(127, 29, 29); color: rgb(254, 128, 125); border-color: rgb(153, 27, 27); }
                          }
                          .worker-pulse-btn {
                            animation: pulse-red 1.5s ease-in-out infinite;
                          }
                        `}</style>
                        <button
                          type="button"
                          onClick={() => setShowWorkerSelector(!showWorkerSelector)}
                          className={`w-full py-2 px-3 rounded-lg font-semibold text-sm flex items-center justify-between transition-all ${
                            assignedWorkerIds.length > 0
                              ? darkMode ? 'bg-indigo-900 text-indigo-100 border border-indigo-600 hover:bg-indigo-800' : 'bg-indigo-100 text-indigo-900 border border-indigo-300 hover:bg-indigo-50'
                              : `worker-pulse-btn ${darkMode ? 'border border-slate-700' : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-50'}`
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            ⚠️ Workers
                            {assignedWorkerIds.length > 0 && (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${darkMode ? 'bg-indigo-700 text-indigo-100' : 'bg-indigo-600 text-white'}`}>
                                {assignedWorkerIds.length}
                              </span>
                            )}
                            {assignedWorkerIds.length === 0 && (
                              <span className="text-xs font-bold">SELECT</span>
                            )}
                          </span>
                          <span className={`transition-transform ${showWorkerSelector ? 'rotate-180' : ''}`}>▼</span>
                        </button>
                        
                        {showWorkerSelector && (
                          <div className={`p-3 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} shadow-lg`}>
                            <div className="grid grid-cols-5 md:grid-cols-8 gap-2 mb-3">
                              {Array.from({length: 15}, (_, i) => `worker-${i}`).map((workerId) => {
                                const isRunning = activeWorkers.has(workerId);
                                const isUsed = usedWorkers.has(workerId);
                                const isDisabled = isUsed;
                                
                                return (
                                  <button
                                    key={workerId}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => {
                                      if (!isDisabled) {
                                        setAssignedWorkerIds(prev =>
                                          prev.includes(workerId)
                                            ? prev.filter(id => id !== workerId)
                                            : [...prev, workerId]
                                        );
                                      }
                                    }}
                                    className={`py-1.5 rounded font-bold text-xs transition-all ${
                                      isRunning
                                        ? darkMode ? 'bg-red-900/50 text-red-400 border border-red-700 cursor-not-allowed opacity-50 animate-pulse' : 'bg-red-100 text-red-400 border border-red-300 cursor-not-allowed opacity-50 animate-pulse'
                                        : isUsed
                                        ? darkMode ? 'bg-red-900/30 text-red-500 border border-red-700 cursor-not-allowed opacity-60' : 'bg-red-50 text-red-600 border border-red-300 cursor-not-allowed opacity-60'
                                        : assignedWorkerIds.includes(workerId)
                                        ? darkMode ? 'bg-indigo-600 text-white shadow' : 'bg-indigo-600 text-white shadow'
                                        : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    }`}
                                    title={isRunning ? 'Running - unavailable' : isUsed ? 'Already assigned - unavailable' : undefined}
                                  >
                                    {workerId.replace('worker-', '')}
                                  </button>
                                );
                              })}
                            </div>
                            {(activeWorkers.size > 0 || usedWorkers.size > 0) && (
                              <div className={`text-xs px-2 py-1.5 rounded mb-2 space-y-1`}>
                                {activeWorkers.size > 0 && (
                                  <div className={`${darkMode ? 'bg-red-900/50 text-red-300 border border-red-700' : 'bg-red-50 text-red-700 border border-red-200'} px-2 py-1 rounded`}>
                                    🔴 Running: {Array.from(activeWorkers).join(', ')}
                                  </div>
                                )}
                                {usedWorkers.size > activeWorkers.size && (
                                  <div className={`${darkMode ? 'bg-orange-900/50 text-orange-300 border border-orange-700' : 'bg-orange-50 text-orange-700 border border-orange-200'} px-2 py-1 rounded`}>
                                    ⏳ Pending: {Array.from(usedWorkers).filter(w => !activeWorkers.has(w)).join(', ')}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className={`text-xs px-2 py-1.5 rounded ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                              {assignedWorkerIds.length > 0 
                                ? `Selected: ${assignedWorkerIds.join(', ')} • Round-robin`
                                : ''}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* URL & Bot Config - Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Adsterra URL</label>
                    <input
                      type="url"
                      value={adsterraUrl}
                      onChange={(e) => setAdsterraUrl(e.target.value)}
                      className={`w-full px-2 py-1 text-sm rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Run Name</label>
                    <input
                      type="text"
                      value={runName}
                      onChange={(e) => setRunName(e.target.value)}
                      className={`w-full px-2 py-1 text-sm rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                      placeholder="Optional name"
                    />
                  </div>
                </div>

                {/* Bot Configuration */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Total Bots</label>
                    <input
                      type="number"
                      value={totalBots}
                      onChange={(e) => setTotalBots(Math.max(1, parseInt(e.target.value) || 1))}
                      className={`w-full px-2 py-1 text-sm rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                      min="1"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Sessions</label>
                    <input
                      type="number"
                      value={sessionsPerBot}
                      onChange={(e) => setSessionsPerBot(Math.max(1, parseInt(e.target.value) || 1))}
                      className={`w-full px-2 py-1 text-sm rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                      min="1"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Impressions</label>
                    <input
                      type="number"
                      value={targetImpressions}
                      onChange={(e) => setTargetImpressions(Math.max(1, parseInt(e.target.value) || 1))}
                      className={`w-full px-2 py-1 text-sm rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                      min="1"
                    />
                  </div>
                </div>

                {/* Timing Config - Minimal */}
                <details className="text-xs">
                  <summary className={`cursor-pointer font-medium ${darkMode ? 'text-slate-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'}`}>
                    ⏱️ Timing Settings
                  </summary>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Min Scroll (ms)</label>
                      <input type="number" value={minScrollWait} onChange={(e) => setMinScrollWait(Math.max(0, parseInt(e.target.value) || 0))} className={`w-full px-1 py-0.5 text-xs rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`} />
                    </div>
                    <div>
                      <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Max Scroll (ms)</label>
                      <input type="number" value={maxScrollWait} onChange={(e) => setMaxScrollWait(Math.max(0, parseInt(e.target.value) || 0))} className={`w-full px-1 py-0.5 text-xs rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`} />
                    </div>
                    <div>
                      <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Min Ad (ms)</label>
                      <input type="number" value={minAdWait} onChange={(e) => setMinAdWait(Math.max(0, parseInt(e.target.value) || 0))} className={`w-full px-1 py-0.5 text-xs rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`} />
                    </div>
                    <div>
                      <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Max Ad (ms)</label>
                      <input type="number" value={maxAdWait} onChange={(e) => setMaxAdWait(Math.max(0, parseInt(e.target.value) || 0))} className={`w-full px-1 py-0.5 text-xs rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`} />
                    </div>
                  </div>
                </details>

                {/* Browser & Headless */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className={`p-2 rounded ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                    <label className={`text-xs font-medium block mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Browser</label>
                    <button
                      type="button"
                      onClick={() => setBrowserHeadless(!browserHeadless)}
                      className={`w-full px-2 py-1 rounded text-xs font-medium ${
                        browserHeadless
                          ? darkMode ? 'bg-slate-600 text-slate-200' : 'bg-gray-200 text-gray-700'
                          : darkMode ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {browserHeadless ? 'Headless' : 'UI'}
                    </button>
                  </div>

                  <div className={`p-2 rounded ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                    <label className={`text-xs font-medium block mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Pacing Hours</label>
                    <input
                      type="number"
                      value={pacingHours}
                      onChange={(e) => setPacingHours(Math.max(0.25, parseFloat(e.target.value) || 0.5))}
                      step="0.25"
                      min="0.25"
                      className={`w-full px-2 py-1 text-xs rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitDisabled}
                  className={`w-full py-2 px-4 rounded-lg font-semibold transition-colors ${
                    isSubmitDisabled
                      ? darkMode ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : darkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {creating ? '⏳ Creating...' : '🚀 Create Run'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Profit Target Selection - Collapsible - APPEARS SECOND */}
        {configMode === 'template' && (
        <div className={`rounded-lg mb-6 border transition-all ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          {/* Header with Toggle */}
          <button
            onClick={() => setShowProfitSelector(!showProfitSelector)}
            className={`w-full px-4 py-3 flex justify-between items-center font-semibold transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-white' : 'hover:bg-gray-50 text-gray-900'
            }`}
          >
            <span className="flex items-center gap-2">
              💰 Select Profit Target {selectedConfig && <span className="text-xs px-2 py-0.5 rounded bg-green-600 text-white">{selectedConfig.name}</span>}
            </span>
            <span className={`transition-transform ${showProfitSelector ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {/* Collapsible Content */}
          {showProfitSelector && (
            <div className={`p-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              {/* Compact Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {profitConfigs.map((config) => (
                  <button
                    key={config.id}
                    type="button"
                    onClick={() => setSelectedProfitConfigId(config.id)}
                    className={`p-3 rounded transition-all text-left text-sm ${
                      selectedProfitConfigId === config.id
                        ? darkMode 
                          ? 'border-2 border-blue-500 bg-blue-900/30' 
                          : 'border-2 border-blue-600 bg-blue-50'
                        : darkMode 
                          ? 'border border-slate-600 bg-slate-700 hover:border-blue-500' 
                          : 'border border-gray-300 bg-white hover:border-blue-400'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className={`font-bold ${selectedProfitConfigId === config.id ? (darkMode ? 'text-blue-300' : 'text-blue-600') : (darkMode ? 'text-white' : 'text-gray-900')}`}>
                        {config.name}
                      </span>
                      {selectedProfitConfigId === config.id && <span className="text-lg">✓</span>}
                    </div>
                    <p className={`text-xs mb-2 line-clamp-1 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{config.description}</p>
                    <div className={`space-y-1 text-xs ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                      <div className="flex justify-between">
                        <span>Bots:</span>
                        <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{(config.totalBots / 1000).toFixed(1)}k</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Profit:</span>
                        <span className="font-semibold text-green-500">${config.estimatedDailyProfit.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Revenue:</span>
                        <span className="font-semibold text-blue-500">${config.estimatedDailyRevenue.toFixed(0)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Selected Config Details - Minimal */}
              {selectedConfig && (
                <div className={`mt-3 p-3 rounded text-sm border-t ${darkMode ? 'border-slate-700 bg-slate-700/50' : 'border-gray-200 bg-gray-50'}`}>
                  <p className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Selected: {selectedConfig.name}</p>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                    <div>
                      <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Bots</span>
                      <p className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{(selectedConfig.totalBots / 1000).toFixed(0)}k</p>
                    </div>
                    <div>
                      <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Sessions</span>
                      <p className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{selectedConfig.sessionsPerBot}</p>
                    </div>
                    <div>
                      <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Impressions</span>
                      <p className={`font-bold ${darkMode ? 'text-purple-300' : 'text-purple-600'}`}>{(selectedConfig.targetImpressions / 1000).toFixed(0)}k</p>
                    </div>
                    <div>
                      <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Profit/day</span>
                      <p className={`font-bold text-green-500`}>${selectedConfig.estimatedDailyProfit.toFixed(0)}</p>
                    </div>
                    <div>
                      <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Revenue/day</span>
                      <p className={`font-bold text-blue-500`}>${selectedConfig.estimatedDailyRevenue.toFixed(0)}</p>
                    </div>
                    <div>
                      <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Cost/day</span>
                      <p className={`font-bold text-orange-500`}>${(selectedConfig.dataUsedGB * 8).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Custom Configuration Form */}
        {configMode === 'custom' && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">Custom Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Total Bots</label>
              <input
                type="number"
                value={totalBots}
                onChange={(e) => setTotalBots(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Sessions Per Bot</label>
              <input
                type="number"
                value={sessionsPerBot}
                onChange={(e) => setSessionsPerBot(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Target Impressions</label>
              <input
                type="number"
                value={targetImpressions}
                onChange={(e) => setTargetImpressions(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Min Ad Page Wait (ms)</label>
              <input
                type="number"
                value={minAdWait}
                onChange={(e) => setMinAdWait(Math.max(1000, parseInt(e.target.value) || 10000))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1000"
                step="1000"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Max Ad Page Wait (ms)</label>
              <input
                type="number"
                value={maxAdWait}
                onChange={(e) => setMaxAdWait(Math.max(1000, parseInt(e.target.value) || 30000))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1000"
                step="1000"
              />
            </div>
          </div>
          
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-700">
              <strong>Total Sessions:</strong> {(totalBots * sessionsPerBot).toLocaleString()} 
              {' '}<span className="text-gray-500">({totalBots.toLocaleString()} bots × {sessionsPerBot} sessions)</span>
            </p>
            <p className="text-sm text-gray-700 mt-2">
              <strong>Target Impressions:</strong> {targetImpressions.toLocaleString()}
            </p>
            <p className="text-sm text-gray-700 mt-2">
              <strong>Recommended Concurrency:</strong> <span className="font-bold text-indigo-600">{calculateOptimalConcurrency(targetImpressions)}</span>
            </p>
          </div>
        </div>
        )}

      </div>

      {/* Schedule Modal */}
      {showSchedule && scheduleData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-black'}`}>
            <div className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold">Task Schedule</h2>
                <button
                  onClick={() => setShowSchedule(null)}
                  className={`text-xl hover:opacity-70 ${darkMode ? 'text-slate-300' : 'text-gray-500'}`}
                >
                  ✕
                </button>
              </div>

              {scheduleLoading ? (
                <div className="text-center py-6">
                  <div className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Loading schedule...</div>
                </div>
              ) : (
                <>
                  <div className={`grid grid-cols-2 gap-3 mb-4 text-sm p-2 rounded ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                    <div>
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Total Tasks:</span>
                      <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{scheduleData.totalTasks}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Pending</span>
                        <p className="text-xl font-bold text-yellow-600">{scheduleData.stats.pending}</p>
                      </div>
                      <div>
                        <span className="text-gray-600 text-xs">Active</span>
                        <p className="text-xl font-bold text-green-600">{scheduleData.stats.active}</p>
                      </div>
                      <div>
                        <span className="text-gray-600 text-xs">Completed</span>
                        <p className="text-xl font-bold text-blue-600">{scheduleData.stats.completed}</p>
                      </div>
                      <div>
                        <span className="text-gray-600 text-xs">Failed</span>
                        <p className="text-xl font-bold text-red-600">{scheduleData.stats.failed}</p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="px-4 py-2 text-left">#</th>
                          <th className="px-4 py-2 text-left">Bot</th>
                          <th className="px-4 py-2 text-left">Session</th>
                          <th className="px-4 py-2 text-left">Scheduled (Local)</th>
                          <th className="px-4 py-2 text-left">Delay</th>
                          <th className="px-4 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleData.tasks.map((task: any, idx: number) => (
                          <tr key={task.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2">{idx + 1}</td>
                            <td className="px-4 py-2 font-mono text-xs">{task.botId}</td>
                            <td className="px-4 py-2 text-center">{task.sessionNumber}</td>
                            <td className="px-4 py-2">{task.scheduledTimeLocal}</td>
                            <td className="px-4 py-2 text-sm">
                              <span className={task.delay < 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                {task.delayFormatted}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                task.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                task.status === 'active' ? 'bg-green-100 text-green-800' :
                                task.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {task.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
