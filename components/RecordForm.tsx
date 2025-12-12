import React, { useState, useEffect, useCallback } from 'react';
import { AppState, ChargingRecord, Vehicle, ChargingType } from '../types';
import { generateId, calculateDuration, calculateTheoreticalEnergy, estimateEnergy } from '../services/utils';
import { getAverageLoss, getLastRecord } from '../services/storageService';
import { Save, X, Calendar, Battery, Zap, MapPin, Calculator } from 'lucide-react';

interface Props {
  state: AppState;
  onSave: (record: ChargingRecord) => void;
  onCancel: () => void;
  initialRecord?: ChargingRecord | null;
}

const RecordForm: React.FC<Props> = ({ state, onSave, onCancel, initialRecord }) => {
  const [vehicleId, setVehicleId] = useState(state.vehicles[0]?.id || '');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [odometer, setOdometer] = useState<number | ''>('');
  const [startSoC, setStartSoC] = useState<number | ''>('');
  const [endSoC, setEndSoC] = useState<number | ''>('');
  const [pricePerKwh, setPricePerKwh] = useState<number | ''>('');
  const [energyCharged, setEnergyCharged] = useState<number | ''>('');
  const [totalCost, setTotalCost] = useState<number | ''>('');
  const [type, setType] = useState<ChargingType>(ChargingType.FAST);
  const [location, setLocation] = useState('');
  const [temperature, setTemperature] = useState<number | ''>('');

  // Initial load or vehicle change logic
  useEffect(() => {
    if (initialRecord) {
      setVehicleId(initialRecord.vehicleId);
      setStartTime(initialRecord.startTime.slice(0, 16));
      setEndTime(initialRecord.endTime ? initialRecord.endTime.slice(0, 16) : '');
      setOdometer(initialRecord.odometer);
      setStartSoC(initialRecord.startSoC);
      setEndSoC(initialRecord.endSoC);
      setPricePerKwh(initialRecord.pricePerKwh);
      setEnergyCharged(initialRecord.energyCharged);
      setTotalCost(initialRecord.totalCost);
      setType(initialRecord.type);
      setLocation(initialRecord.location || '');
      setTemperature(initialRecord.temperature !== undefined ? initialRecord.temperature : '');
    } else {
      // Defaults for new record
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setStartTime(now.toISOString().slice(0, 16));

      if (vehicleId) {
        const lastRec = getLastRecord(state.records, vehicleId);
        if (lastRec) {
            setPricePerKwh(lastRec.pricePerKwh);
            setLocation(lastRec.location || '');
            setType(lastRec.type); // Default to last charging type
            // Optional: Pre-fill odometer if we want to guess, but usually user inputs actual
        }
      }
    }
  }, [initialRecord, vehicleId, state.records]);

  const currentVehicle = state.vehicles.find(v => v.id === vehicleId);

  // Smart Calc: Energy & Cost
  // Only trigger if we are NOT editing an existing record OR if the user is changing core values
  const handleAutoCalc = useCallback(() => {
    if (!currentVehicle || startSoC === '' || endSoC === '') return;

    // 1. Calculate Expected Energy if energy is empty or we want to suggest
    const theoretical = calculateTheoreticalEnergy(currentVehicle.batteryCapacity, Number(startSoC), Number(endSoC));
    const avgLoss = getAverageLoss(state.records, vehicleId);
    const estimated = estimateEnergy(theoretical, avgLoss);

    // Only overwrite if it wasn't manually entered or if it's a fresh calc
    if (energyCharged === '' || !initialRecord) {
      setEnergyCharged(parseFloat(estimated.toFixed(2)));
    }
  }, [currentVehicle, startSoC, endSoC, vehicleId, state.records, initialRecord, energyCharged]);

  // Effect to update total cost when energy or price changes
  useEffect(() => {
    if (energyCharged !== '' && pricePerKwh !== '') {
        const cost = Number(energyCharged) * Number(pricePerKwh);
        // Only update if totalCost is empty or strictly calculated
        if (totalCost === '' || !initialRecord) {
             setTotalCost(parseFloat(cost.toFixed(2)));
        }
    }
  }, [energyCharged, pricePerKwh, initialRecord, totalCost]);

  // Effect: Auto-calculate End Time for Slow Charging (7kWh rate)
  useEffect(() => {
    // Only apply for new records or when explicitly changing values to avoid altering historical data on edit
    if (!initialRecord && type === ChargingType.SLOW && energyCharged && startTime) {
        const start = new Date(startTime);
        if (!isNaN(start.getTime())) {
            const powerKw = 7; // Fixed 7kWh rate
            const hoursNeeded = Number(energyCharged) / powerKw;
            const msNeeded = hoursNeeded * 60 * 60 * 1000;
            const end = new Date(start.getTime() + msNeeded);
            
            // Format to local ISO string for input
            const localEnd = new Date(end.getTime() - (end.getTimezoneOffset() * 60000))
                            .toISOString().slice(0, 16);
            setEndTime(localEnd);
        }
    }
  }, [energyCharged, type, startTime, initialRecord]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || odometer === '' || startSoC === '' || endSoC === '' || pricePerKwh === '') {
        alert("请填写所有必填项。");
        return;
    }

    const lastRec = getLastRecord(state.records, vehicleId);
    // Calculated backend fields
    const finalEnergy = Number(energyCharged);
    const finalStart = new Date(startTime).toISOString();
    const finalEnd = endTime ? new Date(endTime).toISOString() : new Date().toISOString();
    const duration = calculateDuration(finalStart, finalEnd);
    
    // Efficiency Stats
    // 理论充电量 = 车辆电池容量 × (终止电量 - 开始电量) / 100
    const theoretical = calculateTheoreticalEnergy(currentVehicle!.batteryCapacity, Number(startSoC), Number(endSoC));
    
    // 充电损耗率 = (充电度数 - 理论充电量) / 充电度数 × 100%
    // If finalEnergy is 0 (shouldn't happen in valid record), avoid NaN
    const rawLoss = finalEnergy > 0 ? ((finalEnergy - theoretical) / finalEnergy) * 100 : 0;
    const efficiencyLossPct = parseFloat(rawLoss.toFixed(2));
    
    // Distance & Consumption stats
    // These will be recalculated by the App-level recalculateRecords to ensure chain consistency,
    // but we do a rough calc here for immediate object creation
    let distanceDriven = 0;
    let energyConsumption = 0;
    
    if (lastRec && Number(odometer) > lastRec.odometer) {
        distanceDriven = Number(odometer) - lastRec.odometer;
        
        // Calculate SoC used since last charge
        const socUsed = lastRec.endSoC - Number(startSoC);
        
        if (socUsed > 0 && distanceDriven > 0) {
            const energyUsedFromBattery = (currentVehicle!.batteryCapacity * socUsed) / 100;
            energyConsumption = (energyUsedFromBattery / distanceDriven) * 100;
        }
    }

    const newRecord: ChargingRecord = {
      id: initialRecord?.id || generateId(),
      vehicleId,
      odometer: Number(odometer),
      startTime: finalStart,
      endTime: finalEnd,
      startSoC: Number(startSoC),
      endSoC: Number(endSoC),
      pricePerKwh: Number(pricePerKwh),
      type,
      energyCharged: finalEnergy,
      totalCost: Number(totalCost),
      location,
      temperature: temperature === '' ? undefined : Number(temperature),
      durationMinutes: duration,
      theoreticalEnergy: theoretical,
      efficiencyLossPct,
      distanceDriven,
      energyConsumption,
      createdAt: initialRecord?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    onSave(newRecord);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {initialRecord ? '编辑充电记录' : '新增充电记录'}
        </h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Vehicle Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">车辆</label>
          <select 
            value={vehicleId} 
            onChange={e => setVehicleId(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white focus:ring-primary-500 focus:border-primary-500"
            disabled={!!initialRecord}
          >
            {state.vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.name} ({v.batteryCapacity} kWh)</option>
            ))}
          </select>
        </div>

        {/* Basic Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">当前总里程 (仪表盘)</label>
              <input 
                type="number" 
                value={odometer} 
                onChange={e => setOdometer(Number(e.target.value))}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 dark:text-white"
                placeholder="例如 12500"
                required
              />
            </div>
            <div>
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">充电方式</label>
               <div className="flex space-x-2">
                 {[ChargingType.FAST, ChargingType.SLOW].map(t => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors
                          ${type === t 
                            ? 'bg-primary-500 border-primary-500 text-white' 
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                          }`}
                    >
                        {t === ChargingType.FAST ? '快充' : '慢充'}
                    </button>
                 ))}
               </div>
               {type === ChargingType.SLOW && !initialRecord && energyCharged !== '' && (
                 <p className="text-[10px] text-gray-400 mt-1">
                   已按 7kWh/h 自动估算结束时间
                 </p>
               )}
            </div>
        </div>

        {/* SoC and Time */}
        <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Battery className="w-4 h-4 mr-1"/> 开始电量 %
                </label>
                <input type="number" min="0" max="100" value={startSoC} onChange={e => setStartSoC(Number(e.target.value))} required className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 dark:text-white"/>
             </div>
             <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Battery className="w-4 h-4 mr-1"/> 结束电量 %
                </label>
                <input 
                    type="number" min="0" max="100" value={endSoC} 
                    onChange={e => setEndSoC(Number(e.target.value))} 
                    onBlur={handleAutoCalc}
                    required className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 dark:text-white"
                />
             </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Calendar className="w-4 h-4 mr-1"/> 开始时间
                </label>
                <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} required className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 dark:text-white"/>
            </div>
            <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Calendar className="w-4 h-4 mr-1"/> 结束时间
                </label>
                <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 dark:text-white"/>
            </div>
        </div>

        {/* Cost & Energy */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
             <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center">
                    <Calculator className="w-4 h-4 mr-2"/> 费用计算
                </h4>
                <button type="button" onClick={handleAutoCalc} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                    重新估算
                </button>
             </div>
             <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">单价 (元/度)</label>
                    <input type="number" step="0.01" value={pricePerKwh} onChange={e => setPricePerKwh(Number(e.target.value))} required className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded p-2 dark:text-white text-sm"/>
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">度数 (kWh)</label>
                    <input type="number" step="0.1" value={energyCharged} onChange={e => setEnergyCharged(Number(e.target.value))} className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded p-2 dark:text-white text-sm"/>
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">总价 (元)</label>
                    <input type="number" step="0.1" value={totalCost} onChange={e => setTotalCost(Number(e.target.value))} className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded p-2 dark:text-white text-sm font-bold"/>
                </div>
             </div>
        </div>

        {/* Optional */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <MapPin className="w-4 h-4 mr-1"/> 地点
                </label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="例如 家, 超充站" className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 dark:text-white"/>
             </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">温度 (°C)</label>
                <input type="number" value={temperature} onChange={e => setTemperature(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 dark:text-white"/>
             </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t dark:border-gray-700">
            <button type="button" onClick={onCancel} className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600">
                取消
            </button>
            <button type="submit" className="flex items-center px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900">
                <Save className="w-4 h-4 mr-2" />
                保存记录
            </button>
        </div>

      </form>
    </div>
  );
};

export default RecordForm;