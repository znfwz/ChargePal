import { ChargingRecord, Vehicle } from '../types';

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

export const calculateDuration = (start: string, end: string): number => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(diff / 60000)); // Minutes
};

// Theoretical energy = Capacity * (End% - Start%) / 100
export const calculateTheoreticalEnergy = (
  capacity: number,
  startSoC: number,
  endSoC: number
): number => {
  const val = (capacity * (endSoC - startSoC)) / 100;
  return parseFloat(val.toFixed(2));
};

// Smart pre-fill for energy based on historical loss or default 5%
export const estimateEnergy = (
  theoretical: number,
  averageLossPct: number = 5
): number => {
  const val = theoretical * (1 + averageLossPct / 100);
  return parseFloat(val.toFixed(2));
};

export const calculateConsumption = (
  energy: number,
  distance: number
): number => {
  if (distance <= 0) return 0;
  const val = (energy / distance) * 100; // kWh/100km
  return parseFloat(val.toFixed(2));
};

export const formatDate = (isoString: string): string => {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

const formatDateForCSV = (isoStr: string) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hour}:${minute}`;
};

export const exportToCSV = (records: ChargingRecord[], vehicles: Vehicle[]) => {
  const vehicleMap = new Map(vehicles.map(v => [v.id, v.name]));
  
  // Headers match import template
  const headers = [
    '车辆', '当前里程', '充电方式', '开始电量%', '结束电量%', 
    '开始时间', '结束时间', '电费单价', '充电量(kWh)', '总价', '地点', '温度'
  ];

  const rows = records.map(r => [
    vehicleMap.get(r.vehicleId) || '未知',
    r.odometer,
    r.type === 'Fast' ? '快充' : '慢充',
    r.startSoC,
    r.endSoC,
    formatDateForCSV(r.startTime), 
    r.endTime ? formatDateForCSV(r.endTime) : '',
    r.pricePerKwh, // Price usually keeps input precision
    r.energyCharged.toFixed(2),
    r.totalCost.toFixed(2),
    `"${r.location || ''}"`,
    r.temperature !== undefined ? r.temperature : ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // Add BOM (\uFEFF) for Excel UTF-8 compatibility
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `chargepal_export_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadCSVTemplate = () => {
  const headers = [
    '车辆', '当前里程', '充电方式', '开始电量%', '结束电量%', 
    '开始时间', '结束时间', '电费单价', '充电量(kWh)', '总价', '地点', '温度'
  ];
  
  const exampleRow = [
    '您的车辆名称', '12050', '快充', '20', '80', 
    '2023/10/25 14:00', '2023/10/25 14:45', '1.2', '45.00', '54.00', '充电站A', '25'
  ];

  const csvContent = [
    headers.join(','),
    exampleRow.join(',')
  ].join('\n');

  // Add BOM (\uFEFF) for Excel UTF-8 compatibility
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'chargepal_import_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const parseCSV = (content: string): any[] => {
  // Strip BOM if present
  const cleanContent = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;

  const lines = cleanContent.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    // Basic regex to handle comma splitting with quoted values support
    // Matches quoted string OR non-comma/non-quote characters
    const rowValues: string[] = [];
    let current = '';
    let inQuote = false;
    const line = lines[i];
    
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            rowValues.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    rowValues.push(current.trim()); // Push last value

    if (rowValues.length > 0) {
        const entry: any = {};
        headers.forEach((h, index) => {
            let val = rowValues[index];
            if (val && val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }
            entry[h] = val;
        });
        data.push(entry);
    }
  }
  return data;
};

// Core Logic: Recalculate derived data (Distance, Consumption, Efficiency, Duration)
// This ensures that if vehicle capacity changes or records are inserted out of order, everything stays consistent.
export const recalculateRecords = (records: ChargingRecord[], vehicles: Vehicle[]): ChargingRecord[] => {
    // Group by vehicle
    const vehicleGroups: Record<string, ChargingRecord[]> = {};
    records.forEach(r => {
        if (!vehicleGroups[r.vehicleId]) vehicleGroups[r.vehicleId] = [];
        vehicleGroups[r.vehicleId].push(r);
    });

    const result: ChargingRecord[] = [];

    // Process each vehicle's timeline
    for (const vehicleId in vehicleGroups) {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        const capacity = vehicle?.batteryCapacity || 0;

        // Sort by start time ascending
        const sorted = vehicleGroups[vehicleId].sort((a, b) => 
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i];
            const prev = i > 0 ? sorted[i - 1] : null;

            let distanceDriven = 0;
            let energyConsumption = 0;

            // 1. Repair Total Cost
            let totalCost = current.totalCost;
            if ((typeof totalCost !== 'number' || isNaN(totalCost) || totalCost === 0) && current.energyCharged > 0 && current.pricePerKwh > 0) {
                 totalCost = parseFloat((current.energyCharged * current.pricePerKwh).toFixed(2));
            } else {
                totalCost = parseFloat(totalCost.toFixed(2));
            }

            // 2. Recalculate Duration if times are present (Fix for CSV import or sync missing duration)
            let durationMinutes = current.durationMinutes;
            if (current.startTime && current.endTime) {
                durationMinutes = calculateDuration(current.startTime, current.endTime);
            }

            // 3. Recalculate Theoretical Energy & Efficiency based on current vehicle capacity
            let theoreticalEnergy = current.theoreticalEnergy;
            let efficiencyLossPct = current.efficiencyLossPct;
            
            if (capacity > 0 && current.endSoC >= current.startSoC) {
                 theoreticalEnergy = calculateTheoreticalEnergy(capacity, current.startSoC, current.endSoC);
                 // Recalc efficiency
                 if (current.energyCharged > 0) {
                     const rawLoss = ((current.energyCharged - theoreticalEnergy) / current.energyCharged) * 100;
                     efficiencyLossPct = parseFloat(rawLoss.toFixed(2));
                 } else {
                     efficiencyLossPct = 0;
                 }
            }

            // 4. Recalculate Distance Driven: Current Odometer - Previous Odometer
            if (prev) {
                distanceDriven = Math.max(0, current.odometer - prev.odometer);
                
                // Recalculate Consumption
                const socUsed = prev.endSoC - current.startSoC;
                if (distanceDriven > 0 && socUsed > 0 && capacity > 0) {
                     const energyUsed = (capacity * socUsed) / 100;
                     const rawConsumption = (energyUsed / distanceDriven) * 100;
                     energyConsumption = parseFloat(rawConsumption.toFixed(2));
                }
            } else {
                distanceDriven = 0; 
                energyConsumption = 0;
            }

            result.push({
                ...current,
                totalCost,
                durationMinutes,
                distanceDriven,
                energyConsumption,
                theoreticalEnergy,
                efficiencyLossPct
            });
        }
    }

    return result;
};