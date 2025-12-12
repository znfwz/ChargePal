import React from 'react';
import { AppState, ChargingRecord, ChargingType } from '../types';
import { formatDate, formatCurrency } from '../services/utils';
import { Edit2, Zap, BatteryCharging, ArrowRight, Clock, Activity, AlertTriangle, Gauge, Trash2 } from 'lucide-react';

interface Props {
  state: AppState;
  onEdit: (record: ChargingRecord) => void;
  onDelete: (id: string) => void;
}

const RecordList: React.FC<Props> = ({ state, onEdit, onDelete }) => {
  const sortedRecords = [...state.records].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  const vehicleMap = new Map(state.vehicles.map(v => [v.id, v.name]));

  const formatDuration = (mins?: number) => {
      if (!mins) return '-';
      return (mins / 60).toFixed(2) + 'h';
  };

  if (sortedRecords.length === 0) {
     return <div className="text-center py-10 text-gray-500">暂无记录。</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 pb-20">
      {sortedRecords.map(record => (
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
                        {vehicleMap.get(record.vehicleId)}
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
  );
};

export default RecordList;