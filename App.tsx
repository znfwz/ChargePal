import React, { useState, useEffect, useRef } from 'react';
import { AppState, ViewState, ChargingRecord, Vehicle } from './types';
import { loadState, saveState, clearState, DEFAULT_STATE, syncWithSupabase } from './services/storageService';
import { generateId, recalculateRecords } from './services/utils';
import Dashboard from './components/Dashboard';
import RecordForm from './components/RecordForm';
import RecordList from './components/RecordList';
import Settings from './components/Settings';
import { LayoutDashboard, PlusCircle, List, Settings as SettingsIcon, Zap, Sun, Moon, User, RefreshCw, Cloud } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    user: { name: '', onboarded: false, theme: 'system' },
    vehicles: [],
    records: [],
    deletedRecordIds: [],
    deletedVehicleIds: []
  });
  const [view, setView] = useState<ViewState>('dashboard');
  const [editingRecord, setEditingRecord] = useState<ChargingRecord | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Refs for access inside intervals/effects without stale closures
  const stateRef = useRef(state);
  const isSyncingRef = useRef(isSyncing);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);

  // Initialize
  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    if (!loaded.user.onboarded) {
      setView('onboarding');
    }
  }, []);

  // Persistence
  useEffect(() => {
    if (state.user.name) { // Simple check to ensure we don't overwrite with empty state on first render
        saveState(state);
    }
  }, [state]);

  // Auto-Sync Logic (Startup + Interval)
  useEffect(() => {
    const config = state.supabaseConfig;
    // Check if auto sync is enabled and valid
    if (!config?.autoSync || !config?.apiKey || !config?.projectUrl) return;

    const performAutoSync = async () => {
        if (isSyncingRef.current) return;
        
        // Use ref to get latest state for sync
        const currentState = stateRef.current;
        if (!currentState.supabaseConfig) return;

        setIsSyncing(true);
        try {
            const result = await syncWithSupabase(currentState.supabaseConfig, currentState);
            if (result.success && result.data) {
                setState(prev => ({ 
                    ...prev, 
                    ...result.data,
                    supabaseConfig: {
                        ...prev.supabaseConfig!,
                        lastSync: Date.now()
                    }
                }));
            }
        } catch (e) {
            console.error("Auto sync failed", e);
        } finally {
            setIsSyncing(false);
        }
    };

    // 1. Run immediately on enable/mount
    performAutoSync();

    // 2. Schedule interval
    const minutes = Math.max(1, Math.min(30, config.syncInterval || 15));
    const intervalId = setInterval(performAutoSync, minutes * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [state.supabaseConfig?.autoSync, state.supabaseConfig?.syncInterval, state.supabaseConfig?.apiKey, state.supabaseConfig?.projectUrl]);

  // Dark Mode Logic
  const isDarkMode = state.user.theme === 'dark' || 
    (state.user.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    const newTheme = isDarkMode ? 'light' : 'dark';
    handleUpdateState({ user: { ...state.user, theme: newTheme } });
  };

  // --- Actions ---

  const handleUpdateState = (newState: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...newState }));
  };

  const handleSaveRecord = (record: ChargingRecord) => {
    setState(prev => {
        const existingIdx = prev.records.findIndex(r => r.id === record.id);
        let newRecords;
        if (existingIdx >= 0) {
            newRecords = [...prev.records];
            newRecords[existingIdx] = record;
        } else {
            newRecords = [...prev.records, record];
        }
        
        // Recalculate distance driven chain to ensure data integrity
        // This fixes logic where inserting a record in the past affects future records' trip distance
        const recalculatedRecords = recalculateRecords(newRecords, prev.vehicles);

        return { ...prev, records: recalculatedRecords };
    });
    setView('records');
    setEditingRecord(null);
  };

  const handleDeleteRecord = (id: string) => {
    if (window.confirm("确定要删除这条记录吗？删除后将重新计算后续记录的行驶里程。")) {
        setState(prev => {
            const newRecords = prev.records.filter(r => r.id !== id);
            // Recalculate to fix any gaps in the odometer chain
            const recalculatedRecords = recalculateRecords(newRecords, prev.vehicles);
            
            // Add to deletion queue for Sync
            const currentDeleted = prev.deletedRecordIds || [];
            
            return { 
                ...prev, 
                records: recalculatedRecords,
                deletedRecordIds: [...currentDeleted, id] 
            };
        });
    }
  };

  const handleResetApp = () => {
    clearState();
    setState(DEFAULT_STATE);
    setView('onboarding');
  };

  const handleSync = async () => {
    if (!state.supabaseConfig) return;
    setIsSyncing(true);
    try {
        const result = await syncWithSupabase(state.supabaseConfig, state);
        if (result.success && result.data) {
             setState(prev => ({ 
                 ...prev, 
                 ...result.data,
                 supabaseConfig: {
                    ...prev.supabaseConfig!,
                    lastSync: Date.now()
                 }
             }));
        }
        // Optional: Add toast notification here
    } catch (e) {
        console.error("Sync failed", e);
    } finally {
        setIsSyncing(false);
    }
  };

  const handleOnboarding = (name: string, vehicleName: string, capacity: string, initialOdometer: string, licensePlate: string) => {
    const newVehicle: Vehicle = { 
        id: generateId(), 
        name: vehicleName, 
        batteryCapacity: Number(capacity),
        initialOdometer: Number(initialOdometer) || 0,
        licensePlate: licensePlate || undefined
    };
    setState(prev => ({
        ...prev,
        user: { ...prev.user, name, onboarded: true },
        vehicles: [newVehicle]
    }));
    setView('dashboard');
  };

  // --- Rendering ---

  const isSyncConfigured = !!(state.supabaseConfig?.projectUrl && state.supabaseConfig?.apiKey);

  // Generate Tooltip for Sync Button
  const syncButtonTitle = React.useMemo(() => {
    if (isSyncing) return "正在同步数据...";
    if (!state.supabaseConfig?.lastSync) return "点击立即同步";
    
    const date = new Date(state.supabaseConfig.lastSync);
    const timeStr = date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    return `点击同步\n上次同步: ${timeStr}`;
  }, [isSyncing, state.supabaseConfig?.lastSync]);

  // Navigation Items Config
  const navItems = [
    { id: 'dashboard', label: '概览', icon: LayoutDashboard },
    { id: 'records', label: '明细', icon: List },
    { id: 'settings', label: '设置', icon: SettingsIcon },
  ] as const;

  if (view === 'onboarding') {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full border border-gray-100 dark:border-gray-700">
                <div className="flex justify-center mb-6">
                    <div className="p-3 bg-primary-100 dark:bg-primary-900 rounded-full">
                        <Zap className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    </div>
                </div>
                <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">欢迎使用 充小助</h1>
                <p className="text-center text-gray-500 mb-8">让我们开始设置您的车辆信息。</p>
                
                <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    handleOnboarding(
                        fd.get('username') as string, 
                        fd.get('carName') as string, 
                        fd.get('capacity') as string,
                        fd.get('initialOdometer') as string,
                        fd.get('licensePlate') as string
                    );
                }} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">您的昵称</label>
                        <input name="username" required className="w-full p-3 rounded-lg border dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="车主昵称" />
                    </div>
                    
                    <div className="pt-4 pb-2 border-t border-gray-100 dark:border-gray-700">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">车辆信息</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">车辆名称</label>
                        <input name="carName" required className="w-full p-3 rounded-lg border dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="例如 特斯拉 Model 3" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">电池容量 (kWh)</label>
                            <input name="capacity" type="number" step="0.1" required className="w-full p-3 rounded-lg border dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="例如 60" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">初始里程 (km)</label>
                            <input name="initialOdometer" type="number" defaultValue="0" required className="w-full p-3 rounded-lg border dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0" />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">车牌号码 (选填)</label>
                        <input name="licensePlate" className="w-full p-3 rounded-lg border dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="例如 京A88888" />
                    </div>

                    <button type="submit" className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition-colors mt-4">
                        开始使用
                    </button>
                </form>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex text-gray-900 dark:text-gray-100 font-sans">
      
      {/* --- Desktop Sidebar (Visible only on MD+) --- */}
      <aside className="hidden md:flex flex-col w-64 fixed inset-y-0 left-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-30 transition-all">
        <div className="h-16 flex items-center px-6 border-b border-gray-100 dark:border-gray-700">
             <Zap className="w-6 h-6 text-primary-600 mr-2" />
             <span className="font-bold text-xl tracking-tight text-gray-900 dark:text-white">充小助</span>
        </div>

        <div className="p-4">
             <button 
                onClick={() => { setEditingRecord(null); setView('add_record'); }}
                className="w-full flex items-center justify-center py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl shadow-md transition-all group"
             >
                <PlusCircle className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                <span className="font-medium">记一笔</span>
             </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            {navItems.map(item => (
                <button
                    key={item.id}
                    onClick={() => { setView(item.id as ViewState); setEditingRecord(null); }}
                    className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                        view === item.id 
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50'
                    }`}
                >
                    <item.icon className={`w-5 h-5 mr-3 ${view === item.id ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`} />
                    {item.label}
                </button>
            ))}
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-gray-700">
             <div className="flex items-center justify-between px-2">
                 <div className="flex items-center space-x-3">
                     <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm">
                         {state.user.name.slice(0, 1).toUpperCase() || <User className="w-5 h-5"/>}
                     </div>
                     <div className="flex flex-col">
                        <span className="text-sm font-medium truncate max-w-[90px] text-gray-900 dark:text-gray-100">
                            {state.user.name}
                        </span>
                     </div>
                 </div>
                 <div className="flex items-center gap-1">
                     {isSyncConfigured && (
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className={`p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors ${isSyncing ? 'opacity-50' : ''}`}
                            title={syncButtonTitle}
                        >
                            <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin text-primary-600' : ''}`} />
                        </button>
                     )}
                     <button 
                        onClick={toggleTheme}
                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                        title={isDarkMode ? "切换到浅色模式" : "切换到深色模式"}
                    >
                        {isDarkMode ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
                    </button>
                 </div>
             </div>
        </div>
      </aside>

      {/* --- Main Content Layout --- */}
      <div className="flex-1 flex flex-col md:ml-64 min-w-0 transition-all duration-300">
        
        {/* Mobile Header (Hidden on MD+) */}
        <header className="md:hidden bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20">
            <div className="px-4 h-16 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <Zap className="w-6 h-6 text-primary-600" />
                    <span className="font-bold text-lg text-gray-900 dark:text-white">充小助</span>
                </div>
                
                <div className="flex items-center gap-4">
                     {isSyncConfigured && (
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className={`p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors ${isSyncing ? 'opacity-50' : ''}`}
                            title={syncButtonTitle}
                        >
                            <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin text-primary-600' : ''}`} />
                        </button>
                     )}
                    <button 
                        onClick={toggleTheme}
                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                    >
                        {isDarkMode ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
                    </button>
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {state.user.name}
                    </div>
                </div>
            </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 md:p-6 lg:p-8 overflow-x-hidden mb-20 md:mb-0">
            {view === 'dashboard' && <Dashboard state={state} />}
            
            {/* Center constrained widths for forms and lists to look good on wide screens */}
            {view === 'add_record' && (
                <div className="max-w-2xl mx-auto">
                    <RecordForm 
                        state={state} 
                        onSave={handleSaveRecord} 
                        onCancel={() => { setView('records'); setEditingRecord(null); }}
                        initialRecord={editingRecord}
                    />
                </div>
            )}
            
            {view === 'records' && (
                <div className="w-full">
                    <RecordList 
                        state={state} 
                        onEdit={(r) => { setEditingRecord(r); setView('add_record'); }} 
                        onDelete={handleDeleteRecord}
                    />
                </div>
            )}

            {view === 'settings' && (
                <div className="max-w-6xl mx-auto">
                    <Settings 
                        state={state} 
                        onUpdateState={handleUpdateState} 
                        onReset={handleResetApp}
                    />
                </div>
            )}
        </main>
      </div>

      {/* --- Mobile Bottom Nav (Hidden on MD+) --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-30 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex justify-around items-center px-2 h-16">
          <button 
            onClick={() => { setView('dashboard'); setEditingRecord(null); }}
            className={`flex flex-col items-center justify-center space-y-1 w-full py-2 transition-colors ${
                view === 'dashboard' 
                ? 'text-primary-600 dark:text-primary-400' 
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
          >
            <LayoutDashboard className="w-6 h-6" />
            <span className="text-[10px] font-medium">概览</span>
          </button>
          
          <button 
             onClick={() => { setEditingRecord(null); setView('add_record'); }}
             className="flex flex-col items-center justify-center -mt-8"
          >
             <div className="bg-primary-600 text-white p-4 rounded-full shadow-lg shadow-primary-600/30 hover:bg-primary-700 active:scale-95 transition-all border-4 border-gray-50 dark:border-gray-900">
                <PlusCircle className="w-6 h-6" />
             </div>
             <span className="text-[10px] font-medium text-gray-500 mt-1 dark:text-gray-400">记一笔</span>
          </button>

          <button 
            onClick={() => { setView('records'); setEditingRecord(null); }}
            className={`flex flex-col items-center justify-center space-y-1 w-full py-2 transition-colors ${
                view === 'records' 
                ? 'text-primary-600 dark:text-primary-400' 
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
          >
            <List className="w-6 h-6" />
            <span className="text-[10px] font-medium">明细</span>
          </button>

          <button 
            onClick={() => { setView('settings'); setEditingRecord(null); }}
            className={`flex flex-col items-center justify-center space-y-1 w-full py-2 transition-colors ${
                view === 'settings' 
                ? 'text-primary-600 dark:text-primary-400' 
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
          >
            <SettingsIcon className="w-6 h-6" />
            <span className="text-[10px] font-medium">设置</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;