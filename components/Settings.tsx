import React, { useState, useRef, useEffect } from 'react';
import { AppState, Vehicle, SupabaseConfig, ChargingRecord, ChargingType } from '../types';
import { generateId, exportToCSV, parseCSV, calculateDuration, downloadCSVTemplate, calculateTheoreticalEnergy, recalculateRecords } from '../services/utils';
import { syncWithSupabase, getSupabaseSetupSQL } from '../services/storageService';
import { Cloud, Download, Plus, Trash2, Car, Database, AlertCircle, Check, Edit2, X, Save, Upload, FileText, User, Settings as SettingsIcon, Sun, Moon, Monitor, ChevronDown, ChevronUp, Copy, LogOut, AlertTriangle, Clock } from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (newState: Partial<AppState>) => void;
  onReset?: () => void;
}

const Settings: React.FC<Props> = ({ state, onUpdateState, onReset }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'vehicles' | 'data'>('general');
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleCap, setNewVehicleCap] = useState('');
  const [newVehicleOdo, setNewVehicleOdo] = useState('0');
  const [newVehiclePlate, setNewVehiclePlate] = useState('');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // User Profile
  const [userName, setUserName] = useState(state.user.name);
  
  // Reset Confirmation
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState('');
  
  // Supabase Form
  const [sbUrl, setSbUrl] = useState(state.supabaseConfig?.projectUrl || '');
  const [sbKey, setSbKey] = useState(state.supabaseConfig?.apiKey || '');
  const [sbAutoSync, setSbAutoSync] = useState(state.supabaseConfig?.autoSync || false);
  const [sbInterval, setSbInterval] = useState(state.supabaseConfig?.syncInterval || 15);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [importMsg, setImportMsg] = useState('');
  
  // SQL Guide UI State
  const [showSql, setShowSql] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  // Auto-collapse if configured
  useEffect(() => {
    if (state.supabaseConfig?.projectUrl && state.supabaseConfig?.apiKey) {
        setShowSql(false);
    } else {
        setShowSql(true);
    }
  }, []);

  const handleCopySql = async () => {
    try {
        await navigator.clipboard.writeText(getSupabaseSetupSQL());
        setSqlCopied(true);
        setTimeout(() => setSqlCopied(false), 2000);
    } catch (err) {
        console.error('Failed to copy', err);
    }
  };

  const handleSaveUser = () => {
    onUpdateState({ user: { ...state.user, name: userName } });
  };

  const handleAppReset = () => {
    if (resetInput === state.user.name && onReset) {
        onReset();
    } else {
        alert("用户昵称不匹配，操作取消。");
    }
  };

  const handleSaveVehicle = () => {
    if (!newVehicleName || !newVehicleCap) return;
    const now = Date.now();

    if (editingVehicleId) {
        // Update existing vehicle
        const updatedVehicles = state.vehicles.map(v => {
            if (v.id === editingVehicleId) {
                return {
                    ...v,
                    name: newVehicleName,
                    batteryCapacity: Number(newVehicleCap),
                    initialOdometer: Number(newVehicleOdo) || 0,
                    licensePlate: newVehiclePlate || undefined,
                    updatedAt: now
                };
            }
            return v;
        });
        onUpdateState({ vehicles: updatedVehicles });
    } else {
        // Add new vehicle
        const newV: Vehicle = {
            id: generateId(),
            name: newVehicleName,
            batteryCapacity: Number(newVehicleCap),
            initialOdometer: Number(newVehicleOdo) || 0,
            licensePlate: newVehiclePlate || undefined,
            updatedAt: now
        };
        onUpdateState({ vehicles: [...state.vehicles, newV] });
    }
    
    resetForm();
  };

  const startEditing = (v: Vehicle) => {
    setEditingVehicleId(v.id);
    setNewVehicleName(v.name);
    setNewVehicleCap(v.batteryCapacity.toString());
    setNewVehicleOdo(v.initialOdometer?.toString() || '0');
    setNewVehiclePlate(v.licensePlate || '');
  };

  const resetForm = () => {
    setEditingVehicleId(null);
    setNewVehicleName('');
    setNewVehicleCap('');
    setNewVehicleOdo('0');
    setNewVehiclePlate('');
  };

  const handleRemoveVehicle = (id: string) => {
    if (confirm("确定删除吗？这将隐藏车辆但保留历史记录。")) {
        const currentDeleted = state.deletedVehicleIds || [];
        onUpdateState({ 
            vehicles: state.vehicles.filter(v => v.id !== id),
            deletedVehicleIds: [...currentDeleted, id]
        });
        if (editingVehicleId === id) {
            resetForm();
        }
    }
  };

  const handleSync = async () => {
    // Validation before attempting sync
    const missingPlates = state.vehicles.filter(v => !v.licensePlate || !v.licensePlate.trim());
    if (missingPlates.length > 0) {
        setSyncMsg(`无法同步：请先为所有车辆（${missingPlates.map(v=>v.name).join(', ')}）填写车牌号码。`);
        return;
    }

    setIsSyncing(true);
    setSyncMsg('同步中...');
    
    const config: SupabaseConfig = { 
        projectUrl: sbUrl, 
        apiKey: sbKey,
        autoSync: sbAutoSync,
        syncInterval: sbInterval
    };
    
    // Save config first
    onUpdateState({ supabaseConfig: config });

    const result = await syncWithSupabase(config, state);
    
    if (result.success && result.data) {
        // Apply the merged data from Supabase to local state
        onUpdateState(result.data);
    }
    
    setSyncMsg(result.message);
    setIsSyncing(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const content = evt.target?.result as string;
            const parsedData = parseCSV(content);
            
            if (parsedData.length === 0) {
                setImportMsg("文件为空或格式不正确");
                return;
            }

            const newRecords: ChargingRecord[] = [];
            let successCount = 0;
            let failCount = 0;
            const now = Date.now();

            for (const row of parsedData) {
                // Find Vehicle
                const vehicleName = row['车辆'];
                const vehicle = state.vehicles.find(v => v.name === vehicleName);
                
                if (!vehicle) {
                    failCount++;
                    continue; // Skip records for unknown vehicles
                }

                try {
                    // Parse Start Time
                    const startStr = row['开始时间'] || row['日期']; // Backwards compatibility attempt or new field
                    const startTimeDate = new Date(startStr);
                    if (isNaN(startTimeDate.getTime())) {
                         failCount++;
                         continue;
                    }
                    const startTime = startTimeDate.toISOString();
                    
                    // Parse End Time
                    let endTime = '';
                    let durationMins = 0;
                    if (row['结束时间']) {
                        const endTimeDate = new Date(row['结束时间']);
                        if (!isNaN(endTimeDate.getTime())) {
                            endTime = endTimeDate.toISOString();
                            durationMins = calculateDuration(startTime, endTime);
                        }
                    } else if (row['时长(分)']) {
                        // Old template fallback
                        durationMins = Number(row['时长(分)']);
                        endTime = new Date(startTimeDate.getTime() + durationMins * 60000).toISOString();
                    } else {
                        // Default fallback
                        durationMins = 60;
                        endTime = new Date(startTimeDate.getTime() + 60 * 60000).toISOString();
                    }

                    // Parse Numerics
                    const startSoC = Number(row['开始电量%']);
                    const endSoC = Number(row['结束电量%']);
                    const energyCharged = Number(row['充电量(kWh)']);
                    const totalCost = Number(row['总价']) || Number(row['总费用(¥)']); // Handle both new and old headers
                    const pricePerKwh = Number(row['电费单价']) || Number(row['单价(¥/kWh)']); 
                    const odometer = Number(row['当前里程']) || Number(row['里程']);

                    // Calculate Derived Stats
                    const theoretical = calculateTheoreticalEnergy(vehicle.batteryCapacity, startSoC, endSoC);
                    const efficiencyLossPct = energyCharged > 0 ? ((energyCharged - theoretical) / energyCharged) * 100 : 0;

                    const record: ChargingRecord = {
                        id: generateId(),
                        vehicleId: vehicle.id,
                        type: (row['充电方式'] === '快充' || row['类型'] === '快充') ? ChargingType.FAST : ChargingType.SLOW,
                        startTime,
                        endTime,
                        startSoC,
                        endSoC,
                        energyCharged,
                        totalCost,
                        pricePerKwh,
                        odometer, // This is current odometer
                        location: row['地点'] || undefined,
                        temperature: row['温度'] ? Number(row['温度']) : undefined,
                        
                        // Calculated fields
                        durationMinutes: durationMins,
                        theoreticalEnergy: theoretical,
                        efficiencyLossPct: efficiencyLossPct,
                        // distanceDriven and energyConsumption are 0 initially, updated by recalc below
                        distanceDriven: 0,
                        energyConsumption: 0,
                        
                        createdAt: now,
                        updatedAt: now
                    };
                    newRecords.push(record);
                    successCount++;
                } catch (err) {
                    failCount++;
                }
            }

            if (newRecords.length > 0) {
                const combinedRecords = [...state.records, ...newRecords];
                const recalculatedRecords = recalculateRecords(combinedRecords, state.vehicles);
                onUpdateState({ records: recalculatedRecords });
                setImportMsg(`成功导入 ${successCount} 条记录${failCount > 0 ? `，失败 ${failCount} 条（请检查车辆名称是否匹配）` : ''}。数据已重新计算。`);
            } else {
                setImportMsg(`导入失败。没有有效记录，请确保“车辆”列中的名称与现有车辆完全一致。`);
            }

        } catch (error) {
            setImportMsg("解析文件时出错，请检查CSV格式。");
            console.error(error);
        }
        
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="pb-20 space-y-6">
        <div className="flex space-x-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'general' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'}`}>通用设置</button>
            <button onClick={() => setActiveTab('vehicles')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'vehicles' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'}`}>车辆管理</button>
            <button onClick={() => setActiveTab('data')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'data' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'}`}>数据</button>
        </div>

        {activeTab === 'general' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white flex items-center">
                        <User className="w-5 h-5 mr-2" /> 个人信息
                    </h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">用户昵称</label>
                            <div className="flex gap-3">
                                <input 
                                    type="text" 
                                    value={userName} 
                                    onChange={e => setUserName(e.target.value)} 
                                    className="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:text-white text-sm"
                                    placeholder="请输入昵称"
                                />
                                <button 
                                    onClick={handleSaveUser}
                                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium flex items-center"
                                >
                                    <Save className="w-4 h-4 mr-1"/> 保存
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">昵称将显示在应用顶部。</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white flex items-center">
                        <Monitor className="w-5 h-5 mr-2" /> 外观设置
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                        {(['light', 'dark', 'system'] as const).map((themeOption) => (
                             <button
                                key={themeOption}
                                onClick={() => onUpdateState({ user: { ...state.user, theme: themeOption } })}
                                className={`flex flex-col items-center justify-center py-3 rounded-lg border text-sm font-medium transition-all
                                    ${state.user.theme === themeOption 
                                        ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900/20 dark:border-primary-500 dark:text-primary-400' 
                                        : 'bg-gray-50 dark:bg-gray-700/50 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                            >
                                {themeOption === 'light' && <Sun className="w-5 h-5 mb-1"/>}
                                {themeOption === 'dark' && <Moon className="w-5 h-5 mb-1"/>}
                                {themeOption === 'system' && <Monitor className="w-5 h-5 mb-1"/>}
                                {themeOption === 'light' ? '浅色' : themeOption === 'dark' ? '深色' : '跟随系统'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Danger Zone */}
                {onReset && (
                    <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30 col-span-1 lg:col-span-2 mt-4">
                        <h3 className="text-lg font-bold mb-2 text-red-700 dark:text-red-400 flex items-center">
                            <AlertTriangle className="w-5 h-5 mr-2" /> 危险区域
                        </h3>
                        
                        {!showResetConfirm ? (
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-red-600 dark:text-red-300">
                                    此操作将清除所有本地数据并注销当前用户。
                                </p>
                                <button 
                                    onClick={() => setShowResetConfirm(true)}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center shadow-sm"
                                >
                                    <LogOut className="w-4 h-4 mr-2"/> 注销并清除数据
                                </button>
                            </div>
                        ) : (
                            <div className="mt-3 bg-white dark:bg-gray-800 p-4 rounded-lg border border-red-200 dark:border-red-900/50 animate-in fade-in slide-in-from-top-2">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    确定要清除所有数据并退出吗？此操作<span className="text-red-600 font-bold">无法撤销</span>。
                                </p>
                                <p className="text-xs text-gray-500 mb-3">
                                    请输入您的昵称 <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{state.user.name}</span> 进行确认。
                                </p>
                                <div className="flex gap-3">
                                    <input 
                                        type="text" 
                                        value={resetInput}
                                        onChange={(e) => setResetInput(e.target.value)}
                                        placeholder={state.user.name}
                                        className="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:text-white text-sm"
                                    />
                                    <button 
                                        onClick={() => { setShowResetConfirm(false); setResetInput(''); }}
                                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium"
                                    >
                                        取消
                                    </button>
                                    <button 
                                        onClick={handleAppReset}
                                        disabled={resetInput !== state.user.name}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                                    >
                                        确认注销
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}

        {activeTab === 'vehicles' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 order-2 lg:order-1">
                    <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white flex items-center">
                        <Car className="w-5 h-5 mr-2" /> 我的车辆
                    </h3>
                    <div className="space-y-3">
                        {state.vehicles.map(v => (
                            <div key={v.id} className={`flex justify-between items-center p-3 rounded-lg border ${editingVehicleId === v.id ? 'bg-primary-50 border-primary-200 dark:bg-primary-900/20 dark:border-primary-800' : 'bg-gray-50 dark:bg-gray-700/50 border-transparent'}`}>
                                <div>
                                    <div className="font-semibold text-gray-900 dark:text-white flex items-center">
                                        {v.name}
                                        {v.licensePlate && <span className="ml-2 text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">{v.licensePlate}</span>}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {v.batteryCapacity} kWh • 初始里程: {v.initialOdometer || 0} km
                                    </div>
                                </div>
                                <div className="flex space-x-1">
                                    <button onClick={() => startEditing(v)} className="text-primary-600 p-2 hover:bg-white dark:hover:bg-gray-600 rounded transition-colors" title="编辑">
                                        <Edit2 className="w-4 h-4"/>
                                    </button>
                                    <button onClick={() => handleRemoveVehicle(v.id)} className="text-red-500 p-2 hover:bg-white dark:hover:bg-gray-600 rounded transition-colors" title="删除">
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 order-1 lg:order-2">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                            {editingVehicleId ? '编辑车辆' : '添加车辆'}
                        </h4>
                        {editingVehicleId && (
                            <button onClick={resetForm} className="text-xs text-gray-500 flex items-center hover:text-gray-700 dark:hover:text-gray-300">
                                <X className="w-3 h-3 mr-1"/> 取消编辑
                            </button>
                        )}
                    </div>
                    
                    <div className="space-y-3">
                        <div className="flex gap-3">
                            <input type="text" placeholder="名称 (如 Model Y)" value={newVehicleName} onChange={e => setNewVehicleName(e.target.value)} className="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:text-white text-sm"/>
                            <input type="number" placeholder="kWh" value={newVehicleCap} onChange={e => setNewVehicleCap(e.target.value)} className="w-24 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:text-white text-sm"/>
                        </div>
                        <div className="flex gap-3">
                            <input type="number" placeholder="初始里程" value={newVehicleOdo} onChange={e => setNewVehicleOdo(e.target.value)} className="w-24 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:text-white text-sm"/>
                            <input type="text" placeholder="车牌 (同步必填)" value={newVehiclePlate} onChange={e => setNewVehiclePlate(e.target.value)} className="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:text-white text-sm"/>
                        </div>
                        <button onClick={handleSaveVehicle} className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex items-center justify-center">
                            {editingVehicleId ? <Check className="w-4 h-4 mr-2"/> : <Plus className="w-4 h-4 mr-2"/>}
                            {editingVehicleId ? '更新车辆信息' : '添加车辆'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'data' && (
            <div className="space-y-6">
                {/* Sync Card */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                     <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white flex items-center">
                        <Cloud className="w-5 h-5 mr-2" /> 云端同步 (Supabase)
                    </h3>
                    
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Project URL</label>
                                <input type="text" value={sbUrl} onChange={e => setSbUrl(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:text-white text-sm" placeholder="https://xxx.supabase.co" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Anon Key</label>
                                <input type="password" value={sbKey} onChange={e => setSbKey(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 dark:text-white text-sm" placeholder="public-anon-key" />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                            <div className="flex items-center">
                                <Clock className="w-4 h-4 text-gray-400 mr-2"/>
                                <span className="text-sm text-gray-700 dark:text-gray-300">自动同步间隔 (分钟)</span>
                            </div>
                            <div className="flex items-center space-x-3">
                                <input 
                                    type="number" 
                                    min="1" max="60" 
                                    value={sbInterval} 
                                    onChange={e => setSbInterval(Number(e.target.value))}
                                    className="w-16 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded p-1 text-center text-sm"
                                />
                                <label className="flex items-center cursor-pointer">
                                    <div className="relative">
                                        <input type="checkbox" className="sr-only" checked={sbAutoSync} onChange={e => setSbAutoSync(e.target.checked)} />
                                        <div className={`block w-10 h-6 rounded-full transition-colors ${sbAutoSync ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${sbAutoSync ? 'transform translate-x-4' : ''}`}></div>
                                    </div>
                                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">开启</span>
                                </label>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                             <button 
                                onClick={handleSync}
                                disabled={isSyncing || !sbUrl || !sbKey}
                                className={`flex-1 flex items-center justify-center py-2.5 rounded-lg font-medium text-white transition-all
                                    ${isSyncing ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-600/20'}`}
                             >
                                <div className={`${isSyncing ? 'animate-spin mr-2' : 'mr-2'}`}>
                                    {isSyncing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div> : <Cloud className="w-4 h-4"/>}
                                </div>
                                {isSyncing ? '同步中...' : '保存配置并同步'}
                             </button>
                        </div>
                        
                        {syncMsg && (
                            <div className={`text-xs p-2 rounded ${syncMsg.includes('失败') ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'}`}>
                                {syncMsg}
                            </div>
                        )}

                        {/* Setup Guide */}
                        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                             <button onClick={() => setShowSql(!showSql)} className="flex items-center text-xs text-primary-600 hover:text-primary-700 font-medium">
                                 {showSql ? <ChevronUp className="w-3 h-3 mr-1"/> : <ChevronDown className="w-3 h-3 mr-1"/>}
                                 {showSql ? '收起数据库配置指南' : '如何配置 Supabase?'}
                             </button>
                             
                             {showSql && (
                                 <div className="mt-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs">
                                     <p className="text-gray-500 mb-2">请在 Supabase 的 SQL Editor 中运行以下代码以创建必要的表结构：</p>
                                     <div className="relative group">
                                         <pre className="bg-gray-800 text-gray-300 p-3 rounded overflow-x-auto font-mono text-[10px] leading-relaxed max-h-48 overflow-y-auto">
                                             {getSupabaseSetupSQL()}
                                         </pre>
                                         <button 
                                            onClick={handleCopySql}
                                            className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="复制SQL"
                                         >
                                             {sqlCopied ? <Check className="w-3 h-3"/> : <Copy className="w-3 h-3"/>}
                                         </button>
                                     </div>
                                 </div>
                             )}
                        </div>
                    </div>
                </div>

                {/* Import/Export Card */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white flex items-center">
                        <Database className="w-5 h-5 mr-2" /> 数据备份与恢复
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => exportToCSV(state.records, state.vehicles)} className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 transition-colors">
                            <Download className="w-6 h-6 text-primary-600 mb-2"/>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">导出 CSV</span>
                            <span className="text-xs text-gray-500 mt-1">备份所有记录</span>
                        </button>
                        
                        <button onClick={handleImportClick} className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 transition-colors">
                            <Upload className="w-6 h-6 text-blue-500 mb-2"/>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">导入 CSV</span>
                            <span className="text-xs text-gray-500 mt-1">恢复或迁移数据</span>
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />
                    </div>

                    <div className="mt-4 flex justify-between items-center text-xs text-gray-400">
                         <span>支持标准 CSV 格式</span>
                         <button onClick={downloadCSVTemplate} className="text-primary-600 hover:underline flex items-center">
                             <FileText className="w-3 h-3 mr-1"/> 下载导入模板
                         </button>
                    </div>

                    {importMsg && (
                        <div className={`mt-3 text-xs p-2 rounded ${importMsg.includes('失败') || importMsg.includes('错误') ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'}`}>
                            {importMsg}
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};

export default Settings;