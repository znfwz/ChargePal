import React, { useState, useMemo } from 'react';
import { AppState, ChargingRecord, ChargingType } from '../types';
import { formatDate, formatCurrency } from '../services/utils';
import { Edit2, Zap, BatteryCharging, Clock, Activity, AlertTriangle, Gauge, Trash2, Filter, X, Calendar, Search, Car } from 'lucide-react';

interface Props {
  state: AppState;
  onEdit: (record: ChargingRecord) => void;
  onDelete: (id: string) => void;
}

const RecordList: React.FC<Props> = ({ state, onEdit, onDelete }) => {
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter States
  const [filterVehicle, setFilterVehicle] = useState<string>('all');
  const [filterType, setFilterType] = useState<ChargingType | 'all'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const vehicleMap = new Map(state.vehicles.map(v => [v.id, v.name]));

  // Filter Logic
  const filteredAndSortedRecords = useMemo(() => {
    return state.records.filter(r => {
        const rDate = new Date(r.startTime);
        
        // 1. Vehicle Filter
        if (filterVehicle !== 'all' && r.vehicleId !== filterVehicle) return false;
        
        // 2. Type Filter
        if (filterType !== 'all' && r.type !== filterType) return false;
        
        // 3. Date Range Filter
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0); // Start of day
            if (rDate < start) return false;
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // End of day
            if (rDate > end) return false;
        }

        return true;
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [state.records, filterVehicle, filterType, startDate, endDate]);

  // Summary Stats for filtered view
  const summary = useMemo(() => {
    return filteredAndSortedRecords.reduce((acc, r) => ({
        count: acc.count + 1,
        cost: acc.cost + (r.totalCost || 0),
        energy: acc.energy + (r.energyCharged || 0)
    }), { count: 0, cost: 0, energy: 0 });
  }, [filteredAndSortedRecords]);

  const resetFilters = () => {
      setFilterVehicle('all');
      setFilterType('all');
      setStartDate('');
      setEndDate('');
  };

  const hasActiveFilters = filterVehicle !== 'all' || filterType !== 'all' || startDate !== '' || endDate !== '';

  const formatDuration = (mins?: number) => {
      if (!mins) return '-';
      return (mins / 60).toFixed(2) + 'h';
  };

  return (
    <div className="pb-20 space-y-4">
      
      {/* --- Filter Bar --- */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 transition-all">
        <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
                <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showFilters || hasActiveFilters ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                >
                    <Filter className="w-4 h-4 mr-2" />
                    筛选
                    {hasActiveFilters && <span className="ml-1.5 w-2 h-2 bg-primary-500 rounded-full"></span>}
                </button>
                
                {/* Mini Summary (Visible when filters are collapsed but active, or always on desktop) */}
                <div className="hidden sm:flex items-center space-x-4 text-sm text-gray-500">
                    <span>共 {summary.count} 笔</span>
                    <span>¥{summary.cost.toFixed(1)}</span>
                    <span>{summary.energy.toFixed(1)} kWh</span>
                </div>
            </div>
            
            {hasActiveFilters && (
                <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center">
                    <X className="w-3 h-3 mr-1" /> 清除
                </button>
            )}
        </div>

        {/* --- Collapsible Filter Panel --- */}
        {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2 fade-in duration-200">
                {/* Vehicle */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">选择车辆</label>
                    <div className="relative">
                        <select 
                            value={filterVehicle} 
                            onChange={(e) => setFilterVehicle(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg py-2 pl-3 pr-8 text-sm focus:ring-2 focus:ring-primary-500 dark:text-white appearance-none"
                        >
                            <option value="all">所有车辆</option>
                            {state.vehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                        <Car className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none"/>
                    </div>
                </div>

                {/* Type */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">充电方式</label>
                    <div className="flex bg-gray-50 dark:bg-gray-700/50 rounded-lg p-1 border border-gray-200 dark:border-gray-600">
                        {(['all', ChargingType.FAST, ChargingType.SLOW] as const).map((t) => (
                             <button
                                key={t}
                                onClick={() => setFilterType(t)}
                                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${filterType === t ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                             >
                                 {t === 'all' ? '全部' : t === ChargingType.FAST ? '快充' : '慢充'}
                             </button>
                        ))}
                    </div>
                </div>

                {/* Date Range */}
                <div className="md:col-span-2 grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">开始日期</label>
                        <div className="relative">
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 dark:text-white dark:[color-scheme:dark]" 
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">结束日期</label>
                        <div className="relative">
                            <input 
                                type="date" 
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 dark:text-white dark:[color-scheme:dark]" 
                            />
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* --- Filter Result Summary (Mobile only) --- */}
      <div className="flex sm:hidden justify-between items-center px-2 text-xs text-gray-500 font-medium">
         <span>共 {summary.count} 条记录</span>
         <span>合计: <span className="text-gray-900 dark:text-gray-200">¥{summary.cost.toFixed(1)}</span></span>
      </div>

      {/* --- List Content --- */}
      {filteredAndSortedRecords.length === 0 ? (
         <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-3">
                <Search className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">没有找到符合条件的记录</p>
            {hasActiveFilters && (
                <button onClick={resetFilters} className="mt-2 text-sm text-primary-600 hover:underline">
                    清除筛选条件
                </button>
            )}
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 lg:gap-6">
          {filteredAndSortedRecords.map(record => (
            <div 
                key={record.id} 
                onClick={() => onEdit(record)}
                className="group bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all cursor-pointer relative overflow-hidden h-full flex flex-col"
            >
                {/* Top Bar: Date, Vehicle, Duration */}
                <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                     <div className="flex items-center space-x-2">
                         <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {formatDate(record.startTime)}
                         </span>
                         <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                            {vehicleMap.get(record.vehicleId) || '未知车辆'}
                         </span>
                     </div>
                     <div className="flex items-center text-xs text-gray-500">
                        <Clock className="w-3 h-3 mr-1"/>
                        {formatDuration(record.durationMinutes)}
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${record.type === ChargingType.FAST ? 'text-primary-600 bg-primary-100 dark:bg-primary-900/40' : 'text-blue-600 bg-blue-100 dark:bg-blue-900/40'}`}>
                            {record.type === ChargingType.FAST ? '快充' : '慢充'}
                        </span>
                     </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                        {/* Main Stats: Cost, Energy, Distance Driven */}
                        <div className="flex justify-between items-end mb-4">
                            <div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
                                    {formatCurrency(record.totalCost)}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    单价 {record.pricePerKwh} / kWh
                                </div>
                            </div>
                            <div className="text-right">
                                 <div className="flex items-center justify-end text-lg font-bold text-primary-600 dark:text-primary-400">
                                    <Zap className="w-4 h-4 mr-1"/>
                                    {record.energyCharged.toFixed(2)} <span className="text-xs ml-1 text-gray-500 font-normal">kWh</span>
                                 </div>
                                 <div className="flex flex-col items-end mt-1">
                                     <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center" title="本次行驶里程">
                                        <Gauge className="w-3 h-3 mr-1 text-gray-400"/>
                                        行驶: {record.distanceDriven !== undefined ? record.distanceDriven : 0} km
                                     </div>
                                     <div className="text-[10px] text-gray-400" title="仪表盘总里程">
                                        总表: {record.odometer} km
                                     </div>
                                 </div>
                            </div>
                        </div>

                        {/* Grid: SoC, Consumption, Loss */}
                        <div className="grid grid-cols-3 gap-2 py-3 border-t border-dashed border-gray-200 dark:border-gray-700">
                            <div className="flex flex-col items-center justify-center p-2 rounded bg-gray-50 dark:bg-gray-700/30">
                                <div className="flex items-center text-xs text-gray-500 mb-1">
                                    <BatteryCharging className="w-3 h-3 mr-1"/> 电量
                                </div>
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    {record.startSoC}% <span className="text-gray-400">→</span> {record.endSoC}%
                                </span>
                            </div>

                            <div className="flex flex-col items-center justify-center p-2 rounded bg-gray-50 dark:bg-gray-700/30">
                                <div className="flex items-center text-xs text-gray-500 mb-1">
                                    <Activity className="w-3 h-3 mr-1"/> 能耗
                                </div>
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    {record.energyConsumption ? record.energyConsumption.toFixed(2) : '-'}
                                </span>
                                <span className="text-[9px] text-gray-400">kWh/100km</span>
                            </div>

                            <div className={`flex flex-col items-center justify-center p-2 rounded ${record.efficiencyLossPct && record.efficiencyLossPct > 15 ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-gray-50 dark:bg-gray-700/30'}`}>
                                <div className={`flex items-center text-xs mb-1 ${record.efficiencyLossPct && record.efficiencyLossPct > 15 ? 'text-orange-500' : 'text-gray-500'}`}>
                                     {record.efficiencyLossPct && record.efficiencyLossPct > 15 ? <AlertTriangle className="w-3 h-3 mr-1"/> : <Zap className="w-3 h-3 mr-1"/>}
                                     损耗
                                </div>
                                <span className={`text-sm font-semibold ${record.efficiencyLossPct && record.efficiencyLossPct > 15 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {record.efficiencyLossPct !== undefined ? record.efficiencyLossPct.toFixed(2) + '%' : '-'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Footer: Location & Actions */}
                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 min-h-[2rem]">
                        <div className="text-xs text-gray-400 flex items-center truncate max-w-[70%]">
                            {record.location && (
                                <>
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2 flex-shrink-0"></div>
                                {record.location}
                                </>
                            )}
                        </div>
                        <div className="flex items-center space-x-3">
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                title="删除"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                            <div className="text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <Edit2 className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecordList;