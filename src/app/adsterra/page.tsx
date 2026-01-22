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
  const [darkMode, setDarkMode] = useState(true);
  
  // Schedule view state
  const [showSchedule, setShowSchedule] = useState<string | null>(null);
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  
  // Stats state
  const [runStats, setRunStats] = useState<{ [runId: string]: any }>({});
  
  // Edit run name state
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [editingRunName, setEditingRunName] = useState('');

  // Form state
  const [runName, setRunName] = useState('');
  const [adsterraUrl, setAdsterraUrl] = useState('https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221');
  const [totalBots, setTotalBots] = useState(16000);
  const [sessionsPerBot, setSessionsPerBot] = useState(10);
  const [targetImpressions, setTargetImpressions] = useState(160000);
  const [browserHeadless, setBrowserHeadless] = useState(false);
  const [pacingMode, setPacingMode] = useState<NonNullable<AdsterraConfig['pacingMode']>>('human');
  const [pacingHours, setPacingHours] = useState(0.5); // Default: 30 minutes (0.5 hours) for reasonable pacing
  const [assignedWorkerIds, setAssignedWorkerIds] = useState<string[]>([]); // Worker IDs for assignment
  
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
    if (!confirm('Are you sure you want to delete this run?')) return;
    
    try {
      const res = await fetch(`/api/adsterra/runs/${runId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete run');
      await fetchRuns();
    } catch (error) {
      alert('Failed to delete run');
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

  const isSubmitDisabled =
    creating ||
    !adsterraUrl.trim() ||
    (configMode === 'template' && !selectedConfig);

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
          <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>🤖 Adsterra Bot System</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-3 py-2 rounded font-medium ${darkMode ? 'bg-slate-700 text-yellow-400 hover:bg-slate-600' : 'bg-gray-300 text-gray-900 hover:bg-gray-400'}`}
            >
              {darkMode ? '☀️' : '🌙'}
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

        {/* Runs List - Active Runs at Top */}
        <div className={`rounded-lg p-4 mb-6 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}`}>
          <h2 className={`text-lg font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Active Runs</h2>
          {runs.length === 0 ? (
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>No runs yet. Create one below.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => {
                const totalSessions = (run?.config?.totalBots || 0) * (run?.config?.sessionsPerBot || 0);
                const createdAt = run.createdAt ? new Date(run.createdAt).toLocaleString() : null;
                
                return (
                <div key={run.id} className={`border rounded-lg p-3 transition-all ${darkMode ? 'border-slate-600 bg-slate-700 hover:bg-slate-650' : 'border-gray-200 bg-white hover:shadow-md'}`}>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
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
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        {createdAt && (
                          <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Created: {createdAt}</span>
                        )}
                        <span className={`font-mono ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>ID: {run.id}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Key Metrics - Enlarged & More Visible */}
                  <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 p-4 rounded ${darkMode ? 'bg-slate-700 text-slate-200' : 'bg-gray-50 text-gray-700'}`}>
                                        <div>
                      <span className={`block mb-1 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>🤖 Current Worker</span>
                      <p className={`font-bold text-lg px-3 py-1 rounded-lg ${darkMode ? 'text-green-300 bg-green-900/40 border border-green-700 shadow-lg' : 'text-green-900 bg-green-100 border border-green-300 shadow-md'}`}>
                        {run?.assignedWorkerIds?.[0] ?? 'Any'}
                      </p>
                    </div>
                    <div>
                      <span className={`block mb-1 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>👁️ Target</span>
                      <p className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-blue-600'}`}>
                        {typeof run?.config?.targetImpressions === 'number'
                          ? (run.config.targetImpressions / 1000).toFixed(0) + 'k'
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <span className={`block mb-1 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>📊 Sessions</span>
                      <p className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-purple-600'}`}>
                        {totalSessions > 0 ? (totalSessions / 1000).toFixed(1) + 'k' : '—'}
                      </p>
                    </div>

                    <div>
                      <span className={`block mb-1 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>⚙️ Config</span>
                      <p className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-700'}`}>
                        {run?.config?.totalBots || '—'} × {run?.config?.sessionsPerBot || '—'}
                      </p>
                    </div>
                    <div>
                      <span className={`block mb-1 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>🐇 Pacing</span>
                      <p className={`font-bold text-lg capitalize ${darkMode ? 'text-white' : 'text-gray-700'}`}>
                        {run?.config?.pacingMode ?? 'human'}
                      </p>
                    </div>
                    <div>
                      <span className={`block mb-1 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>🖥️ Mode</span>
                      <p className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-700'}`}>
                        {run?.config?.browserHeadless !== false ? 'Headless' : 'UI'}
                      </p>
                    </div>
                    <div>
                      <span className={`block mb-1 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>👷 Bot Index</span>
                      <p className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-blue-600'}`}>
                        {run?.config?.currentBotIndex !== undefined && run?.config?.currentBotIndex !== null 
                          ? `#${(run.config.currentBotIndex || 0) + 1}` 
                          : (run?.config?.totalBots ? 'Ready' : '—')}
                      </p>
                    </div>
                  </div>

                  {/* Stats if available */}
                  {runStats[run.id] && (
                    <div className={`mb-3 p-3 rounded border grid grid-cols-4 gap-3 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                      <div className={`rounded px-2 py-2 ${darkMode ? 'bg-slate-600 text-yellow-300' : 'bg-white text-yellow-600'}`}>
                        <span className="block font-semibold text-lg">⏳</span>
                        <p className="font-bold text-lg">
                          {(runStats[run.id]?.total || totalSessions) - (runStats[run.id]?.active || 0) - (runStats[run.id]?.completed || 0) - (runStats[run.id]?.failed || 0)}
                        </p>
                      </div>
                      <div className={`rounded px-1.5 py-1 ${darkMode ? 'bg-slate-600 text-green-300' : 'bg-white text-green-600'}`}>
                        <span className="block font-semibold">🟢</span>
                        <p className="font-bold">
                          {runStats[run.id]?.active || 0}
                        </p>
                      </div>
                      <div className={`rounded px-1.5 py-1 ${darkMode ? 'bg-slate-600 text-blue-300' : 'bg-white text-blue-600'}`}>
                        <span className="block font-semibold">✅</span>
                        <p className="font-bold">
                          {runStats[run.id]?.completed || 0}
                        </p>
                      </div>
                      <div className={`rounded px-1.5 py-1 ${darkMode ? 'bg-slate-600 text-red-300' : 'bg-white text-red-600'}`}>
                        <span className="block font-semibold">❌</span>
                        <p className="font-bold">
                          {runStats[run.id]?.failed || 0}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Configuration Details */}
                  <div className="mb-2">
                    <details className="text-xs">
                      <summary className={`cursor-pointer font-medium ${darkMode ? 'text-slate-300 hover:text-slate-100' : 'text-gray-600 hover:text-gray-900'}`}>
                        Config
                      </summary>
                      <div className={`mt-1.5 p-2 rounded text-xs space-y-1 ${darkMode ? 'bg-slate-700 text-slate-200' : 'bg-gray-50 text-gray-700'}`}>
                        <p className="break-all font-mono text-xs">{run?.config?.adsterraUrl?.substring(0, 60)}...</p>
                        {run?.config?.distribution && (
                          <p className={`${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                            🌍 {Object.keys(run.config.distribution.countries || {}).length} | 🖥️ {Object.keys(run.config.distribution.devices || {}).length} | 🌐 {Object.keys(run.config.distribution.browsers || {}).length}
                          </p>
                        )}
                      </div>
                    </details>
                  </div>

                  <div className="flex gap-1.5 mt-2 flex-wrap text-xs">
                    <Link
                      href={`/adsterra/${run.id}`}
                      className={`px-2 py-1 rounded transition-colors ${darkMode ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                    >
                      Details
                    </Link>
                    <button
                      onClick={() => handleViewSchedule(run.id)}
                      className={`px-2 py-1 rounded transition-colors ${darkMode ? 'bg-indigo-700 hover:bg-indigo-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                    >
                      Schedule
                    </button>
                    {run.status === 'running' ? (
                      <button
                        onClick={() => handleStopRun(run.id)}
                        className={`px-2 py-1 rounded transition-colors ${darkMode ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                      >
                        Stop
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartRun(run.id)}
                          className={`px-2 py-1 rounded transition-colors ${darkMode ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                        >
                          Start
                        </button>
                        <button
                          onClick={() => handleTestLocally(run.id)}
                          className={`px-2 py-1 rounded transition-colors ${darkMode ? 'bg-purple-700 hover:bg-purple-600 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                        >
                          Test
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteRun(run.id)}
                      className={`px-2 py-1 rounded transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white'}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mode Selector - Compact */}
        <div className={`rounded-lg p-4 mb-4 border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setConfigMode('template');
                setSelectedProfitConfigId('');
              }}
              className={`px-4 py-2 rounded font-semibold text-sm transition-all ${
                configMode === 'template'
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'bg-slate-700 text-gray-200 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              📋 Templates
            </button>
            <button
              onClick={() => setConfigMode('custom')}
              className={`px-4 py-2 rounded font-semibold text-sm transition-all ${
                configMode === 'custom'
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'bg-slate-700 text-gray-200 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ⚙️ Custom
            </button>
          </div>
        </div>

        {/* Profit Target Selection */}
        {configMode === 'template' && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">Select Profit Target</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profitConfigs.map((config) => (
              <button
                key={config.id}
                type="button"
                onClick={() => setSelectedProfitConfigId(config.id)}
                className={`p-6 rounded-lg border-2 transition-all text-left ${
                  selectedProfitConfigId === config.id
                    ? 'border-blue-600 bg-blue-50 shadow-lg'
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-gray-900">{config.name}</h3>
                  {selectedProfitConfigId === config.id && (
                    <span className="text-blue-600 text-2xl">✓</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-4">{config.description}</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bots:</span>
                    <span className="font-semibold text-gray-900">{config.totalBots.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Est. Profit:</span>
                    <span className="font-semibold text-green-600">${config.estimatedDailyProfit.toFixed(2)}/day</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Est. Revenue:</span>
                    <span className="font-semibold text-blue-600">${config.estimatedDailyRevenue.toFixed(2)}/day</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Proxy Cost:</span>
                    <span className="font-semibold text-orange-600">${(config.dataUsedGB * 8).toFixed(2)}/day</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Selected Config Details */}
          {selectedConfig && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Total Bots:</span>
                  <p className="font-bold text-gray-900">{selectedConfig.totalBots.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-600">Sessions/Bot:</span>
                  <p className="font-bold text-gray-900">{selectedConfig.sessionsPerBot}</p>
                </div>
                <div>
                  <span className="text-gray-600">Target Impressions:</span>
                  <p className="font-bold text-purple-600 text-lg">{selectedConfig.targetImpressions.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-600">Total Sessions:</span>
                  <p className="font-bold text-gray-900">{(selectedConfig.totalBots * selectedConfig.sessionsPerBot).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-600">Scroll Wait:</span>
                  <p className="font-bold text-gray-900">{selectedConfig.minScrollWait/1000}-{selectedConfig.maxScrollWait/1000}s</p>
                </div>
                <div>
                  <span className="text-gray-600">Ad Page Wait:</span>
                  <p className="font-bold text-gray-900">{selectedConfig.minAdWait/1000}-{selectedConfig.maxAdWait/1000}s</p>
                </div>
                <div>
                  <span className="text-gray-600">Data Usage:</span>
                  <p className="font-bold text-gray-900">~{selectedConfig.dataUsedGB} GB</p>
                </div>
                <div>
                  <span className="text-gray-600">Proxy Cost:</span>
                  <p className="font-bold text-orange-600">${(selectedConfig.dataUsedGB * 8).toFixed(2)}/day</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-gray-600">Recommended Concurrency:</span>
                  <p className="font-bold text-indigo-600 text-lg">
                    {calculateOptimalConcurrency(selectedConfig.targetImpressions)}
                  </p>
                  <span className="text-xs text-gray-500">
                    (auto-calculated for ~4 hour completion)
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <span className="text-gray-600">Target Impressions:</span>
                  <p className="font-bold text-purple-600 text-xl">{selectedConfig.targetImpressions.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-600">Est. Revenue:</span>
                  <p className="font-bold text-blue-600 text-xl">${selectedConfig.estimatedDailyRevenue.toFixed(2)}/day</p>
                </div>
                <div>
                  <span className="text-gray-600">Est. Profit:</span>
                  <p className="font-bold text-green-600 text-xl">${selectedConfig.estimatedDailyProfit.toFixed(2)}/day</p>
                </div>
              </div>
              {selectedConfig.notes && selectedConfig.notes.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Notes:</p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                    {selectedConfig.notes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
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

        {/* Create Run Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Run</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Pacing Mode */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Pacing Mode</p>
                  <p className="text-xs text-gray-600">
                    <strong>Human</strong> spreads sessions over hours with jitter. <strong>Fast</strong> schedules everything immediately.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPacingMode('human')}
                    className={`px-4 py-2 rounded-md text-sm font-medium border ${
                      pacingMode === 'human'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-white'
                    }`}
                  >
                    Human
                  </button>
                  <button
                    type="button"
                    onClick={() => setPacingMode('fast')}
                    className={`px-4 py-2 rounded-md text-sm font-medium border ${
                      pacingMode === 'fast'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-white'
                    }`}
                  >
                    Fast
                  </button>
                </div>
                
                {/* Pacing Hours - only shown in Human mode */}
                {pacingMode === 'human' && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Spread Impressions Across (hours)
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0.5"
                        max="24"
                        step="0.5"
                        value={pacingHours}
                        onChange={(e) => setPacingHours(parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-lg font-bold text-blue-600 w-16 text-center">
                        {pacingHours === 0.5 ? '30m' : `${pacingHours}h`}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>30m (very fast)</span>
                      <span>12-16h (recommended)</span>
                      <span>24h (very slow)</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      📊 At {pacingHours} hours with {targetImpressions.toLocaleString()} impressions: 
                      ~{Math.round(targetImpressions / pacingHours).toLocaleString()} impressions/hour
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Worker Assignment */}
            <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-900">Worker Assignment (Optional)</p>
                <p className="text-xs text-gray-600 mt-1">
                  Select specific workers to process these jobs. Leave empty for any worker to claim them.
                </p>
              </div>
              <div className="grid grid-cols-5 md:grid-cols-8 gap-2">
                {Array.from({length: 15}, (_, i) => `worker-${i}`).map((workerId) => (
                  <button
                    key={workerId}
                    type="button"
                    onClick={() => {
                      setAssignedWorkerIds(prev =>
                        prev.includes(workerId)
                          ? prev.filter(id => id !== workerId)
                          : [...prev, workerId]
                      );
                    }}
                    className={`py-2 px-2 rounded-md text-xs font-medium border transition-colors ${
                      assignedWorkerIds.includes(workerId)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {workerId}
                  </button>
                ))}
              </div>
              {assignedWorkerIds.length > 0 && (
                <div className="mt-3 p-2 bg-white rounded border border-blue-200">
                  <p className="text-xs text-gray-700">
                    <strong>Selected:</strong> {assignedWorkerIds.join(', ')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Jobs will be distributed round-robin across {assignedWorkerIds.length} worker(s)
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Config */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700">Basic Configuration</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Run Name (optional)
                  </label>
                  <input
                    type="text"
                    value={runName}
                    onChange={(e) => setRunName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                    placeholder="My Adsterra Run"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adsterra Smart Link URL *
                  </label>
                  <input
                    type="url"
                    value={adsterraUrl}
                    onChange={(e) => setAdsterraUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                    placeholder="https://www.effectivegatecpm.com/ma9efknwx?key=..."
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Direct link to Adsterra Smart Link (pre-filled with your link)
                  </p>
                </div>
              </div>

              {/* Bot Config */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700">Bot Configuration</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Bots
                  </label>
                  <input
                    type="number"
                    value={totalBots}
                    onChange={(e) => setTotalBots(parseInt(e.target.value) || 16000)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sessions per Bot
                  </label>
                  <input
                    type="number"
                    value={sessionsPerBot}
                    onChange={(e) => setSessionsPerBot(parseInt(e.target.value) || 10)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Impressions
                  </label>
                  <input
                    type="number"
                    value={targetImpressions}
                    onChange={(e) => setTargetImpressions(parseInt(e.target.value) || 160000)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                    min="1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calculated: {totalBots * sessionsPerBot} sessions
                  </p>
                  {targetImpressions > 0 && totalBots * sessionsPerBot !== targetImpressions && (
                    <p className="text-xs text-yellow-600 mt-1 font-semibold">
                      ⚠️ Mismatch! Total sessions ({totalBots * sessionsPerBot}) doesn't match target impressions ({targetImpressions.toLocaleString()}). 
                      The system will auto-adjust to create exactly {targetImpressions.toLocaleString()} jobs.
                    </p>
                  )}
                  {targetImpressions > 0 && totalBots * sessionsPerBot === targetImpressions && (
                    <p className="text-xs text-green-600 mt-1">✓ Sessions match target impressions</p>
                  )}
                  {selectedConfig && (
                    <p className="text-xs text-blue-600 mt-1">✓ Auto-filled from config</p>
                  )}
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="headless"
                    checked={browserHeadless}
                    onChange={(e) => setBrowserHeadless(e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="headless" className="text-sm text-gray-700">
                    Headless Browser (uncheck for testing)
                  </label>
                </div>
              </div>
            </div>

            {/* Timing Config - Hidden for direct link approach, values auto-set from config */}
            <input type="hidden" value={minScrollWait} />
            <input type="hidden" value={maxScrollWait} />
            <input type="hidden" value={minAdWait} />
            <input type="hidden" value={maxAdWait} />

            {/* Distribution Configuration */}
            <div className="border-t pt-6 mt-6">
              <h3 className="font-semibold text-gray-700 mb-4">Traffic Distribution</h3>
              <p className="text-sm text-gray-600 mb-4">
                Configure how impressions are distributed across countries, devices, and browsers. Percentages must sum to 100%.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Countries */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-800 mb-3">Countries</h4>
                  <div className="space-y-2">
                    {Object.entries(distribution.countries).map(([code, value]) => {
                      const countryNames: Record<string, string> = {
                        us: 'United States',
                        uk: 'United Kingdom',
                        fr: 'France',
                        es: 'Spain',
                        ie: 'Ireland',
                        au: 'Australia',
                      };
                      const count = Math.round(targetImpressions * (value / 100));
                      return (
                        <div key={code} className="flex items-center gap-2">
                          <label className="text-sm text-gray-700 w-24 flex-shrink-0">
                            {countryNames[code] || code.toUpperCase()}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={value}
                            onChange={(e) => {
                              const newValue = parseFloat(e.target.value) || 0;
                              setDistribution({
                                ...distribution,
                                countries: {
                                  ...distribution.countries,
                                  [code]: newValue,
                                },
                              });
                            }}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                          />
                          <span className="text-xs text-gray-600 w-12 text-right">%</span>
                          <span className="text-xs text-gray-500 w-16 text-right">{count.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    <div className="mt-2 pt-2 border-t border-gray-300 flex items-center justify-between text-sm font-semibold">
                      <span>Total:</span>
                      <span className={Math.abs(Object.values(distribution.countries).reduce((a, b) => a + b, 0) - 100) > 0.01 ? 'text-red-600' : 'text-green-600'}>
                        {Object.values(distribution.countries).reduce((a, b) => a + b, 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Devices */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-800 mb-3">Devices</h4>
                  <div className="space-y-2">
                    {Object.entries(distribution.devices).map(([type, value]) => {
                      const deviceNames: Record<string, string> = {
                        mobile: 'Mobile',
                        tablet: 'Tablet',
                        desktop: 'Desktop',
                      };
                      const count = Math.round(targetImpressions * (value / 100));
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <label className="text-sm text-gray-700 w-20 flex-shrink-0">
                            {deviceNames[type] || type}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={value}
                            onChange={(e) => {
                              const newValue = parseFloat(e.target.value) || 0;
                              setDistribution({
                                ...distribution,
                                devices: {
                                  ...distribution.devices,
                                  [type]: newValue,
                                },
                              });
                            }}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                          />
                          <span className="text-xs text-gray-600 w-12 text-right">%</span>
                          <span className="text-xs text-gray-500 w-16 text-right">{count.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    <div className="mt-2 pt-2 border-t border-gray-300 flex items-center justify-between text-sm font-semibold">
                      <span>Total:</span>
                      <span className={Math.abs(Object.values(distribution.devices).reduce((a, b) => a + b, 0) - 100) > 0.01 ? 'text-red-600' : 'text-green-600'}>
                        {Object.values(distribution.devices).reduce((a, b) => a + b, 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Browsers */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-800 mb-3">Browsers</h4>
                  <div className="space-y-2">
                    {Object.entries(distribution.browsers).map(([browser, value]) => {
                      const browserNames: Record<string, string> = {
                        safari: 'Safari',
                        firefox: 'Firefox',
                        chrome: 'Chrome',
                      };
                      const count = Math.round(targetImpressions * (value / 100));
                      return (
                        <div key={browser} className="flex items-center gap-2">
                          <label className="text-sm text-gray-700 w-20 flex-shrink-0">
                            {browserNames[browser] || browser}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={value}
                            onChange={(e) => {
                              const newValue = parseFloat(e.target.value) || 0;
                              setDistribution({
                                ...distribution,
                                browsers: {
                                  ...distribution.browsers,
                                  [browser]: newValue,
                                },
                              });
                            }}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                          />
                          <span className="text-xs text-gray-600 w-12 text-right">%</span>
                          <span className="text-xs text-gray-500 w-16 text-right">{count.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    <div className="mt-2 pt-2 border-t border-gray-300 flex items-center justify-between text-sm font-semibold">
                      <span>Total:</span>
                      <span className={Math.abs(Object.values(distribution.browsers).reduce((a, b) => a + b, 0) - 100) > 0.01 ? 'text-red-600' : 'text-green-600'}>
                        {Object.values(distribution.browsers).reduce((a, b) => a + b, 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Exact Distribution Matrix (matches backend) */}
              {distributionMatrix && distributionMatrix.total > 0 ? (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-2">Exact Distribution (Backend Calculation)</h4>
                  <p className="text-sm text-blue-800 mb-3">
                    This is the <strong>exact breakdown</strong> the backend will create for <strong>{distributionMatrix.total.toLocaleString()}</strong> impressions:
                  </p>
                  
                  {/* Aggregated Totals */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4 pb-4 border-b border-blue-300">
                    <div>
                      <p className="font-semibold text-blue-900 mb-1">By Country (Actual):</p>
                      <div className="space-y-1">
                        {(() => {
                          const countryTotals: Record<string, number> = {};
                          distributionMatrix.entries.forEach(entry => {
                            countryTotals[entry.country] = (countryTotals[entry.country] || 0) + entry.count;
                          });
                          const countryNames: Record<string, string> = {
                            us: 'USA', uk: 'UK', fr: 'France',
                            es: 'Spain', ie: 'Ireland', au: 'Australia',
                          };
                          return Object.entries(countryTotals)
                            .sort((a, b) => b[1] - a[1])
                            .map(([code, count]) => (
                              <div key={code} className="flex justify-between text-blue-700">
                                <span>{countryNames[code] || code.toUpperCase()}:</span>
                                <span className="font-semibold">{count.toLocaleString()}</span>
                              </div>
                            ));
                        })()}
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-blue-900 mb-1">By Device (Actual):</p>
                      <div className="space-y-1">
                        {(() => {
                          const deviceTotals: Record<string, number> = {};
                          distributionMatrix.entries.forEach(entry => {
                            deviceTotals[entry.deviceType] = (deviceTotals[entry.deviceType] || 0) + entry.count;
                          });
                          const deviceNames: Record<string, string> = {
                            mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop',
                          };
                          return Object.entries(deviceTotals)
                            .sort((a, b) => b[1] - a[1])
                            .map(([type, count]) => (
                              <div key={type} className="flex justify-between text-blue-700">
                                <span>{deviceNames[type] || type}:</span>
                                <span className="font-semibold">{count.toLocaleString()}</span>
                              </div>
                            ));
                        })()}
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-blue-900 mb-1">By Browser (Actual):</p>
                      <div className="space-y-1">
                        {(() => {
                          const browserTotals: Record<string, number> = {};
                          distributionMatrix.entries.forEach(entry => {
                            const browserName = entry.browserType === 'webkit' ? 'Safari' : 
                                               entry.browserType === 'chromium' ? 'Chrome' : 'Firefox';
                            browserTotals[browserName] = (browserTotals[browserName] || 0) + entry.count;
                          });
                          return Object.entries(browserTotals)
                            .sort((a, b) => b[1] - a[1])
                            .map(([browser, count]) => (
                              <div key={browser} className="flex justify-between text-blue-700">
                                <span>{browser}:</span>
                                <span className="font-semibold">{count.toLocaleString()}</span>
                              </div>
                            ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Detailed Combinations */}
                  <div className="mt-4">
                    <p className="font-semibold text-blue-900 mb-2 text-sm">
                      Detailed Combinations ({distributionMatrix.entries.length} unique combinations):
                    </p>
                    <div className="max-h-64 overflow-y-auto bg-white rounded border border-blue-200 p-2">
                      <div className="space-y-1 text-xs">
                        {distributionMatrix.entries
                          .sort((a, b) => b.count - a.count)
                          .map((entry, idx) => {
                            const countryNames: Record<string, string> = {
                              us: 'USA', uk: 'UK', ca: 'Canada', fr: 'France',
                              es: 'Spain', ie: 'Ireland', au: 'Australia',
                            };
                            const browserNames: Record<string, string> = {
                              webkit: 'Safari',
                              chromium: 'Chrome',
                              firefox: 'Firefox',
                            };
                            const deviceNames: Record<string, string> = {
                              mobile: 'Mobile',
                              tablet: 'Tablet',
                              desktop: 'Desktop',
                            };
                            return (
                              <div key={idx} className="flex justify-between items-center py-1 px-2 hover:bg-blue-50 rounded">
                                <span className="text-gray-700">
                                  <span className="font-medium">{countryNames[entry.country] || entry.country.toUpperCase()}</span>
                                  {' + '}
                                  <span className="font-medium">{deviceNames[entry.deviceType] || entry.deviceType}</span>
                                  {' + '}
                                  <span className="font-medium">{browserNames[entry.browserType] || entry.browserType}</span>
                                  {entry.deviceName && (
                                    <span className="text-gray-500 text-xs ml-1">({entry.deviceName})</span>
                                  )}
                                </span>
                                <span className="font-bold text-blue-700">{entry.count}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : targetImpressions > 0 ? (
                <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Distribution percentages must sum to 100% to see exact breakdown
                  </p>
                </div>
              ) : null}
            </div>

            {/* BrightData Proxy Info */}
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-700 mb-4">BrightData Proxy Configuration</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Note:</strong> BrightData proxy credentials are configured in your <code className="bg-gray-200 px-1 rounded">.env</code> file.
                </p>
                <p className="text-xs text-gray-500">
                  Each session automatically gets a unique IP address using BrightData's session parameter.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              {selectedConfig ? (
                <p className="text-sm text-blue-800">
                  <strong>Selected:</strong> {selectedConfig.name} | 
                  Estimated daily profit: <span className="font-bold text-green-600">${selectedConfig.estimatedDailyProfit.toFixed(2)}</span> | 
                  Proxy cost: <span className="font-bold text-orange-600">${(selectedConfig.dataUsedGB * 8).toFixed(2)}/day</span> | 
                  Estimated revenue: <span className="font-bold text-blue-600">${selectedConfig.estimatedDailyRevenue.toFixed(2)}</span>
                </p>
              ) : (
                <p className="text-sm text-blue-800">
                  💡 <strong>Tip:</strong> Select a profit target above to auto-configure your run settings
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Run'}
            </button>
          </form>
        </div>

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
