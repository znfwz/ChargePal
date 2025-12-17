import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppState, ChargingRecord, Vehicle, ChargingType } from '../types';
import { generateId, calculateDuration, calculateTheoreticalEnergy, estimateEnergy } from '../services/utils';
import { getAverageLoss, getLastRecord } from '../services/storageService';
import { Save, X, Calendar, Battery, Zap, MapPin, Calculator, AlertCircle, Info } from 'lucide-react';

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

  // Validation Errors State
  const [errors, setErrors] = useState<Record<string, string>>({});

  const currentVehicle = state.vehicles.find(v => v.id === vehicleId);
  
  // Get last record to prevent odometer rollbacks (logic check)
  const lastRecord = useMemo(() => {
    return vehicleId ? getLastRecord(state.records, vehicleId) : undefined;
  }, [vehicleId, state.records]);

  // Helper: Convert UTC Date/String to Local ISO String (YYYY-MM-DDThh:mm) for input[type="datetime-local"]
  const toLocalInputFormat = (val: string | Date) => {
    if (!val) return '';
    const date = typeof val === 'string' ? new Date(val) : val;
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 16);
  };

  // Initial load logic
  useEffect(() => {
    if (initialRecord) {
      setVehicleId(initialRecord.vehicleId);
      setStartTime(toLocalInputFormat(initialRecord.startTime));
      setEndTime(initialRecord.endTime ? toLocalInputFormat(initialRecord.endTime) : '');
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
      setStartTime(toLocalInputFormat(new Date()));
      if (vehicleId && !initialRecord) { // Only autofill if adding new
        if (lastRecord) {
            setPricePerKwh(lastRecord.pricePerKwh);
            setLocation(lastRecord.location || '');
            setType(lastRecord.type);
        }
      }
    }
  }, [initialRecord, vehicleId, lastRecord]); // Removed state.records from dep to avoid loop, dependent on lastRecord memo

  // --- Real-time Validation Handlers ---

  const setError = (field: string, msg: string | null) => {
      setErrors(prev => {
          const newErrors = { ...prev };
          if (msg) newErrors[field] = msg;
          else delete newErrors[field];
          return newErrors;
      });
  };

  const handleOdometerChange = (val: string) => {
      const numVal = Number(val);
      setOdometer(val === '' ? '' : numVal);
      
      if (val === '') {
          setError('odometer', '请输入当前里程');
          return;
      }
      
      // Logic Check: Odometer shouldn't be less than last record (unless editing an old record, handled by ignoring if it's the same record ID logic, but simple check here suffices for new entry)
      if (!initialRecord && lastRecord && numVal < lastRecord.odometer) {
          setError('odometer', `里程数不能小于上次记录 (${lastRecord.odometer} km)`);
      } else {
          setError('odometer', null);
      }
  };

  const handleSoCChange = (field: 'startSoC' | 'endSoC', val: string) => {
      const numVal = Number(val);
      const isStart = field === 'startSoC';
      
      // Update State
      if (isStart) setStartSoC(val === '' ? '' : numVal);
      else setEndSoC(val === '' ? '' : numVal);

      // 1. Basic Range Check
      if (val !== '' && (numVal < 0 || numVal > 100)) {
          setError(field, '电量必须在 0% - 100% 之间');
          return;
      } else {
          setError(field, null);
      }

      // 2. Logic Check (Start < End)
      // We need the *other* value to compare. 
      // Note: We use the `val` for the current field, and state variable for the other field.
      const otherVal = isStart ? endSoC : startSoC;
      
      if (val !== '' && otherVal !== '') {
          const start = isStart ? numVal : Number(otherVal);
          const end = isStart ? Number(otherVal) : numVal;
          
          if (start >= end) {
              // Mark error on End SoC primarily
              setError('endSoC', '结束电量应大于开始电量'); 
          } else {
              // Clear logic error if fixed
              setError('endSoC', null);
          }
      }
  };

  const handleTemperatureChange = (val: string) => {
      const numVal = Number(val);
      setTemperature(val === '' ? '' : numVal);
      
      // Limit to realistic ambient temperatures (-50°C to 60°C)
      if (val !== '' && (numVal < -50 || numVal > 60)) {
          setError('temperature', '温度数值超出合理范围 (-50 ~ 60°C)');
      } else {
          setError('temperature', null);
      }
  };

  // --- Auto Calc Effects ---

  const handleAutoCalc = useCallback(() => {
    if (!currentVehicle || startSoC === '' || endSoC === '') return;
    // Don't calc if logic error exists
    if (Number(startSoC) >= Number(endSoC)) return;

    const theoretical = calculateTheoreticalEnergy(currentVehicle.batteryCapacity, Number(startSoC), Number(endSoC));
    const avgLoss = getAverageLoss(state.records, vehicleId);
    const estimated = estimateEnergy(theoretical, avgLoss);

    if (energyCharged === '' || !initialRecord) {
      setEnergyCharged(parseFloat(estimated.toFixed(2)));
    }
  }, [currentVehicle, startSoC, endSoC, vehicleId, state.records, initialRecord, energyCharged]);

  useEffect(() => {
    if (energyCharged !== '' && pricePerKwh !== '') {
        const cost = Number(energyCharged) * Number(pricePerKwh);
        if (totalCost === '' || !initialRecord) {
             setTotalCost(parseFloat(cost.toFixed(2)));
        }
    }
  }, [energyCharged, pricePerKwh, initialRecord, totalCost]);

  useEffect(() => {
    if (!initialRecord && type === ChargingType.SLOW && energyCharged && startTime) {
        const start = new Date(startTime);
        if (!isNaN(start.getTime())) {
            const powerKw = 7; 
            const hoursNeeded = Number(energyCharged) / powerKw;
            const msNeeded = hoursNeeded * 60 * 60 * 1000;
            const end = new Date(start.getTime() + msNeeded);
            setEndTime(toLocalInputFormat(end));
        }
    }
  }, [energyCharged, type, startTime, initialRecord]);

  // --- Final Submit Validation ---
  const validateForm = (): boolean => {
    // Check if any errors exist in state first
    const existingErrors = Object.values(errors).filter(Boolean);
    if (existingErrors.length > 0) return false;

    // Perform empty checks (Required fields)
    let isValid = true;
    if (!vehicleId) { setError('vehicleId', '请选择车辆'); isValid = false; }
    if (odometer === '') { setError('odometer', '请输入当前里程'); isValid = false; }
    if (pricePerKwh === '') { setError('pricePerKwh', '请输入单价'); isValid = false; }
    if (!startTime) { setError('startTime', '请选择开始时间'); isValid = false; }
    if (startSoC === '') { setError('startSoC', '请输入开始电量'); isValid = false; }
    if (endSoC === '') { setError('endSoC', '请输入结束电量'); isValid = false; }

    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const finalStart = new Date(startTime).toISOString();
    const finalEnd = endTime ? new Date(endTime).toISOString() : new Date().toISOString();
    const duration = calculateDuration(finalStart, finalEnd);
    const finalEnergy = Number(energyCharged);
    
    const theoretical = calculateTheoreticalEnergy(currentVehicle!.batteryCapacity, Number(startSoC), Number(endSoC));
    const rawLoss = finalEnergy > 0 ? ((finalEnergy - theoretical) / finalEnergy) * 100 : 0;
    const efficiencyLossPct = parseFloat(rawLoss.toFixed(2));
    
    let distanceDriven = 0;
    let energyConsumption = 0;
    
    // Recalculate Logic: If editing, we need to be careful. If new, comparing against `lastRecord` is safe.
    // For simplicity, we use the same logic: check against the *chronologically previous* record in the full list in `utils` recalculate.
    // But for the immediate feedback here:
    if (lastRecord && Number(odometer) > lastRecord.odometer) {
        distanceDriven = Number(odometer) - lastRecord.odometer;
        const socUsed = lastRecord.endSoC - Number(startSoC);
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

  const getInputClass = (fieldName: string) => {
      const base = "w-full bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 dark:text-white border transition-colors";
      if (errors[fieldName]) {
          return `${base} border-red-500 bg-red-50 dark:bg-red-900/10 focus:ring-red-500 focus:border-red-500`;
      }
      return `${base} border-gray-300 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500`;
  };

  const ErrorMsg: React.FC<{ field: string }> = ({ field }) => {
      if (!errors[field]) return null;
      return (
          <p className="mt-1 text-xs text-red-500 flex items-center animate-in slide-in-from-top-1 font-medium">
              <AlertCircle className="w-3 h-3 mr-1" />
              {errors[field]}
          </p>
      );
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

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        
        {/* Vehicle Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">车辆</label>
          <select 
            value={vehicleId} 
            onChange={e => { setVehicleId(e.target.value); setError('vehicleId', null); }}
            className={getInputClass('vehicleId')}
            disabled={!!initialRecord}
          >
            {state.vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.name} ({v.batteryCapacity} kWh)</option>
            ))}
          </select>
          <ErrorMsg field="vehicleId" />
        </div>

        {/* Basic Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">当前总里程 (km)</label>
              <input 
                type="number" 
                value={odometer} 
                onChange={e => handleOdometerChange(e.target.value)}
                className={getInputClass('odometer')}
                placeholder="例如 12500"
                required
              />
              <ErrorMsg field="odometer" />
              {!errors.odometer && lastRecord && !initialRecord && (
                  <p className="text-[10px] text-gray-400 mt-1 flex items-center">
                      <Info className="w-3 h-3 mr-1"/> 上次记录: {lastRecord.odometer} km
                  </p>
              )}
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
                <input 
                    type="number" min="0" max="100" value={startSoC} 
                    onChange={e => handleSoCChange('startSoC', e.target.value)}
                    required 
                    className={getInputClass('startSoC')}
                />
                <ErrorMsg field="startSoC" />
             </div>
             <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Battery className="w-4 h-4 mr-1"/> 结束电量 %
                </label>
                <input 
                    type="number" min="0" max="100" value={endSoC} 
                    onChange={e => handleSoCChange('endSoC', e.target.value)}
                    onBlur={handleAutoCalc}
                    required 
                    className={getInputClass('endSoC')}
                />
                <ErrorMsg field="endSoC" />
             </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Calendar className="w-4 h-4 mr-1"/> 开始时间
                </label>
                <input 
                    type="datetime-local" value={startTime} 
                    onChange={e => { setStartTime(e.target.value); setError('startTime', null); }} 
                    required 
                    className={getInputClass('startTime')}
                />
                <ErrorMsg field="startTime" />
            </div>
            <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Calendar className="w-4 h-4 mr-1"/> 结束时间
                </label>
                <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className={getInputClass('endTime')}/>
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
                    <input 
                        type="number" step="0.01" value={pricePerKwh} 
                        onChange={e => { setPricePerKwh(Number(e.target.value)); setError('pricePerKwh', null); }} 
                        required 
                        className={getInputClass('pricePerKwh')}
                    />
                    <ErrorMsg field="pricePerKwh" />
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">度数 (kWh)</label>
                    <input type="number" step="0.1" value={energyCharged} onChange={e => setEnergyCharged(Number(e.target.value))} className={getInputClass('energyCharged')}/>
                </div>
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">总价 (元)</label>
                    <input type="number" step="0.1" value={totalCost} onChange={e => setTotalCost(Number(e.target.value))} className={`${getInputClass('totalCost')} font-bold`}/>
                </div>
             </div>
        </div>

        {/* Optional */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <MapPin className="w-4 h-4 mr-1"/> 地点
                </label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="例如 家, 超充站" className={getInputClass('location')}/>
             </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">温度 (°C)</label>
                <input 
                    type="number" value={temperature} 
                    onChange={e => handleTemperatureChange(e.target.value)}
                    className={getInputClass('temperature')}
                />
                <ErrorMsg field="temperature" />
             </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t dark:border-gray-700">
            <button type="button" onClick={onCancel} className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600">
                取消
            </button>
            <button type="submit" className="flex items-center px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-900 transition-colors">
                <Save className="w-4 h-4 mr-2" />
                保存记录
            </button>
        </div>

      </form>
    </div>
  );
};

export default RecordForm;