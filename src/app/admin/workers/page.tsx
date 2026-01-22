'use client';

import { useState, useEffect } from 'react';
import type { WorkerConfig } from '@/types/adsterra';

const WORKER_IDS = Array.from({ length: 15 }, (_, i) => `worker-${i}`);

export default function WorkersAdminPage() {
  const [configs, setConfigs] = useState<Record<string, WorkerConfig>>({});
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<string>(WORKER_IDS[0]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load all worker configs on mount
  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/workers');
      if (!response.ok) throw new Error('Failed to load configs');
      const data = await response.json();
      
      const configMap: Record<string, WorkerConfig> = {};
      data.forEach((config: WorkerConfig) => {
        configMap[config.workerId] = config;
      });
      setConfigs(configMap);
    } catch (error: any) {
      console.error('Error loading configs:', error);
      // Don't set error message on first load - table might not exist yet
      // which is OK, just means no configs configured
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(workerId: string, updates: Partial<WorkerConfig>) {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/workers/${workerId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to save config');
      const updated = await response.json();
      
      setConfigs(prev => ({
        ...prev,
        [workerId]: updated,
      }));
      setMessage({ text: `✅ Config saved for ${workerId}`, type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Error saving config:', error);
      setMessage({ text: `❌ Failed to save config: ${error.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function deleteConfig(workerId: string) {
    if (!confirm(`Delete configuration for ${workerId}?`)) return;
    
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/workers/${workerId}/config`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete config');
      
      setConfigs(prev => {
        const updated = { ...prev };
        delete updated[workerId];
        return updated;
      });
      setMessage({ text: `✅ Config deleted for ${workerId}`, type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Error deleting config:', error);
      setMessage({ text: `❌ Failed to delete config: ${error.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-white text-center">Loading worker configurations...</div>
        </div>
      </div>
    );
  }

  const currentConfig = configs[selectedWorker];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">⚙️ Worker Configuration</h1>
          <p className="text-slate-400">Manage individual configurations for each bot worker</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-900/30 border border-green-500 text-green-200' 
              : 'bg-red-900/30 border border-red-500 text-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Worker List */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Workers</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {WORKER_IDS.map(id => (
                  <button
                    key={id}
                    onClick={() => setSelectedWorker(id)}
                    className={`w-full text-left px-4 py-2 rounded transition-colors ${
                      selectedWorker === id
                        ? 'bg-blue-600 text-white font-medium'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span className={configs[id] ? '✅ ' : '⭕ '} />
                    {id}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Config Form */}
          <div className="lg:col-span-3">
            <WorkerConfigForm
              workerId={selectedWorker}
              config={currentConfig}
              onSave={saveConfig}
              onDelete={deleteConfig}
              saving={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface WorkerConfigFormProps {
  workerId: string;
  config: WorkerConfig | undefined;
  onSave: (workerId: string, updates: Partial<WorkerConfig>) => Promise<void>;
  onDelete: (workerId: string) => Promise<void>;
  saving: boolean;
}

function WorkerConfigForm({ workerId, config, onSave, onDelete, saving }: WorkerConfigFormProps) {
  const [formData, setFormData] = useState<Partial<WorkerConfig>>(config || {});

  useEffect(() => {
    setFormData(config || {});
  }, [config, workerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(workerId, formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">
          {config ? `${workerId} Configuration` : `Create ${workerId} Configuration`}
        </h2>
      </div>

      {/* Smart Link URL */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Smart Link URL *
        </label>
        <input
          type="url"
          placeholder="https://example.adsterra.com/..."
          value={formData.adsterraUrl || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, adsterraUrl: e.target.value }))}
          required
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <p className="text-sm text-slate-400 mt-1">Unique smart link for this worker</p>
      </div>

      {/* Browser Settings */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            <input
              type="checkbox"
              checked={formData.browserHeadless ?? true}
              onChange={(e) => setFormData(prev => ({ ...prev, browserHeadless: e.target.checked }))}
              className="mr-2"
            />
            Headless Browser
          </label>
          <p className="text-sm text-slate-400">Run browser without GUI</p>
        </div>
      </div>

      {/* Scroll Wait Times */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Scroll Wait Times (ms)</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Min Scroll Wait
            </label>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="2000"
              value={formData.minScrollWait || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, minScrollWait: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Max Scroll Wait
            </label>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="5000"
              value={formData.maxScrollWait || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, maxScrollWait: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Ad Wait Times */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Ad Wait Times (ms)</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Min Ad Wait
            </label>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="8000"
              value={formData.minAdWait || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, minAdWait: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Max Ad Wait
            </label>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="15000"
              value={formData.maxAdWait || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, maxAdWait: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Pacing Configuration */}
      <div className="border-t border-slate-700 pt-6">
        <h3 className="text-lg font-semibold text-white mb-4">Pacing Configuration</h3>
        <p className="text-sm text-slate-400 mb-4">
          Control how impressions are paced: fast (immediate) or human (spread out with jitter)
        </p>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Pacing Mode</label>
            <select
              value={formData.pacingMode || 'human'}
              onChange={(e) => setFormData(prev => ({ ...prev, pacingMode: e.target.value as 'fast' | 'human' }))}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
            >
              <option value="human">Human (Spread with Jitter)</option>
              <option value="fast">Fast (Immediate)</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">Human mode spreads impressions over time with random jitter</p>
          </div>
          
          {formData.pacingMode === 'human' && (
            <div className="mt-4 p-4 bg-blue-900/30 rounded-lg border border-blue-700">
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Spread Over (hours)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0.5"
                  max="24"
                  step="0.5"
                  value={formData.pacingHours || 0.5}
                  onChange={(e) => setFormData(prev => ({ ...prev, pacingHours: parseFloat(e.target.value) }))}
                  className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-lg font-bold text-blue-400 w-20 text-center">
                  {formData.pacingHours === 0.5 ? '30m' : `${formData.pacingHours}h`}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>30m (fast)</span>
                <span>12-16h (recommended)</span>
                <span>24h (slow)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Distribution Configuration */}
      <div className="border-t border-slate-700 pt-6">
        <h3 className="text-lg font-semibold text-white mb-4">Traffic Distribution (Optional)</h3>
        <p className="text-sm text-slate-400 mb-4">
          Override global distribution settings for this worker. Leave empty to use run defaults.
        </p>

        {!formData.distribution && (
          <div className="mb-4 p-3 bg-slate-700 rounded border border-slate-600">
            <button
              type="button"
              onClick={() => setFormData(prev => ({
                ...prev,
                distribution: {
                  countries: { us: 50, uk: 17, fr: 11, es: 9, ie: 8, au: 5 },
                  devices: { mobile: 70, tablet: 15, desktop: 15 },
                  browsers: { safari: 60, chrome: 40 }
                }
              }))}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
            >
              ➕ Add Custom Distribution
            </button>
          </div>
        )}

        {formData.distribution && (
          <div className="space-y-4">
            {/* Countries */}
            <div className="bg-slate-700 p-4 rounded border border-slate-600">
              <h4 className="text-sm font-semibold text-slate-200 mb-3">Countries</h4>
              <div className="space-y-2">
                {Object.entries(formData.distribution.countries).map(([code, value]) => {
                  const countryNames: Record<string, string> = {
                    us: 'United States',
                    uk: 'United Kingdom',
                    fr: 'France',
                    es: 'Spain',
                    ie: 'Ireland',
                    au: 'Australia',
                  };
                  return (
                    <div key={code} className="flex items-center gap-2">
                      <label className="text-xs text-slate-300 w-20 flex-shrink-0">
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
                          setFormData(prev => ({
                            ...prev,
                            distribution: {
                              ...prev.distribution!,
                              countries: {
                                ...prev.distribution!.countries,
                                [code]: newValue,
                              },
                            },
                          }));
                        }}
                        className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-400 w-8">%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Devices */}
            <div className="bg-slate-700 p-4 rounded border border-slate-600">
              <h4 className="text-sm font-semibold text-slate-200 mb-3">Devices</h4>
              <div className="space-y-2">
                {Object.entries(formData.distribution.devices).map(([type, value]) => {
                  const deviceNames: Record<string, string> = {
                    mobile: 'Mobile',
                    tablet: 'Tablet',
                    desktop: 'Desktop',
                  };
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <label className="text-xs text-slate-300 w-20 flex-shrink-0">
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
                          setFormData(prev => ({
                            ...prev,
                            distribution: {
                              ...prev.distribution!,
                              devices: {
                                ...prev.distribution!.devices,
                                [type]: newValue,
                              },
                            },
                          }));
                        }}
                        className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-400 w-8">%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Browsers */}
            <div className="bg-slate-700 p-4 rounded border border-slate-600">
              <h4 className="text-sm font-semibold text-slate-200 mb-3">Browsers</h4>
              <div className="space-y-2">
                {Object.entries(formData.distribution.browsers).map(([browser, value]) => {
                  const browserNames: Record<string, string> = {
                    safari: 'Safari',
                    firefox: 'Firefox',
                    chrome: 'Chrome',
                  };
                  return (
                    <div key={browser} className="flex items-center gap-2">
                      <label className="text-xs text-slate-300 w-20 flex-shrink-0">
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
                          setFormData(prev => ({
                            ...prev,
                            distribution: {
                              ...prev.distribution!,
                              browsers: {
                                ...prev.distribution!.browsers,
                                [browser]: newValue,
                              },
                            },
                          }));
                        }}
                        className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-400 w-8">%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Clear Distribution Button */}
            <button
              type="button"
              onClick={() => setFormData(prev => {
                const updated = { ...prev };
                delete updated.distribution;
                return updated;
              })}
              className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded text-sm font-medium transition-colors"
            >
              ❌ Remove Custom Distribution
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={saving || !formData.adsterraUrl}
          className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-medium rounded transition-colors"
        >
          {saving ? '💾 Saving...' : '💾 Save Configuration'}
        </button>
        {config && (
          <button
            type="button"
            onClick={() => onDelete(workerId)}
            disabled={saving}
            className="px-6 py-3 bg-red-900 hover:bg-red-800 disabled:bg-slate-600 text-white font-medium rounded transition-colors"
          >
            {saving ? '🗑️ Deleting...' : '🗑️ Delete'}
          </button>
        )}
      </div>

      {config && (
        <div className="text-sm text-slate-400 pt-2 border-t border-slate-700">
          <p>Created: {new Date(config.createdAt || '').toLocaleString()}</p>
          <p>Updated: {new Date(config.updatedAt || '').toLocaleString()}</p>
        </div>
      )}
    </form>
  );
}
