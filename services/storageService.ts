import { AppState, ChargingRecord, Vehicle, UserProfile, SupabaseConfig, ChargingType } from '../types';
import { createClient } from '@supabase/supabase-js';
import { generateId, recalculateRecords } from './utils';

const STORAGE_KEY = 'chargepal_data';

export const DEFAULT_STATE: AppState = {
  user: { name: '', onboarded: false, theme: 'system' },
  vehicles: [],
  records: [],
};

export const loadState = (): AppState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULT_STATE, ...JSON.parse(stored) } : DEFAULT_STATE;
  } catch (e) {
    console.error("Failed to load state", e);
    return DEFAULT_STATE;
  }
};

export const saveState = (state: AppState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state", e);
  }
};

export const clearState = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear state", e);
  }
};

export const getAverageLoss = (records: ChargingRecord[], vehicleId: string): number => {
  const vehicleRecords = records.filter(r => r.vehicleId === vehicleId && r.efficiencyLossPct !== undefined);
  if (vehicleRecords.length === 0) return 5; // Default 5%
  const totalLoss = vehicleRecords.reduce((acc, r) => acc + (r.efficiencyLossPct || 0), 0);
  return totalLoss / vehicleRecords.length;
};

export const getLastRecord = (records: ChargingRecord[], vehicleId: string): ChargingRecord | undefined => {
  const sorted = [...records].filter(r => r.vehicleId === vehicleId).sort((a, b) => 
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
  return sorted[0];
};

export const syncWithSupabase = async (
  config: SupabaseConfig, 
  localState: AppState
): Promise<{ success: boolean; message: string; data?: Partial<AppState> }> => {
  
  if (!config.apiKey || !config.projectUrl) {
    return { success: false, message: "配置缺失" };
  }

  // Pre-check: Ensure all vehicles have license plates
  const vehiclesWithoutPlate = localState.vehicles.filter(v => !v.licensePlate || v.licensePlate.trim() === '');
  if (vehiclesWithoutPlate.length > 0) {
      return { 
          success: false, 
          message: `同步失败：存在 ${vehiclesWithoutPlate.length} 辆车未填写车牌号码。云端同步需要车牌作为唯一识别。` 
      };
  }

  try {
    const supabase = createClient(config.projectUrl, config.apiKey);
    const now = Date.now();

    // --- STEP 1: PUSH Local Data to Cloud (Upsert) ---

    // 1.1 Users
    const { error: userError } = await supabase
      .from('users')
      .upsert({ 
          name: localState.user.name, 
          theme: localState.user.theme,
          onboarded: localState.user.onboarded,
          "updatedAt": now
      }, { onConflict: 'name' });
    if (userError) throw new Error(`用户同步失败: ${userError.message}`);

    // 1.2 Vehicles (PK: licensePlate)
    if (localState.vehicles.length > 0) {
        const vehiclePayload = localState.vehicles.map(v => ({
            "licensePlate": v.licensePlate, 
            name: v.name,
            "batteryCapacity": v.batteryCapacity,
            "initialOdometer": v.initialOdometer,
            "updatedAt": now
        }));
        const { error: vError } = await supabase
        .from('vehicles')
        .upsert(vehiclePayload, { onConflict: 'licensePlate' });

        if (vError) throw new Error(`车辆上传失败: ${vError.message}`);
    }

    // 1.3 Records (FK: licensePlate)
    if (localState.records.length > 0) {
        const recordPayload = localState.records.map(r => {
            const vehicle = localState.vehicles.find(v => v.id === r.vehicleId);
            if (!vehicle || !vehicle.licensePlate) return null;

            // Extract calculated fields to store in DB for analytics (optional but good practice)
            const { vehicleId, efficiencyLossPct, durationMinutes, theoreticalEnergy, distanceDriven, energyConsumption, ...rest } = r; 
            
            return {
                ...rest,
                "licensePlate": vehicle.licensePlate,
                "efficiencyLossPct": efficiencyLossPct,
                "durationMinutes": durationMinutes,
                "theoreticalEnergy": theoreticalEnergy,
                "distanceDriven": distanceDriven,
                "energyConsumption": energyConsumption,
                "updatedAt": now
            };
        }).filter(r => r !== null);

        if (recordPayload.length > 0) {
            const { error: rError } = await supabase
            .from('charging_records')
            .upsert(recordPayload); // uses 'id' as PK

            if (rError) throw new Error(`记录上传失败: ${rError.message}`);
        }
    }

    // --- STEP 2: PULL Cloud Data to Local (Merge) ---

    // 2.1 Fetch Vehicles
    const { data: cloudVehicles, error: fetchVError } = await supabase
        .from('vehicles')
        .select('*');
    if (fetchVError) throw new Error(`拉取车辆失败: ${fetchVError.message}`);

    // 2.2 Fetch Records
    const { data: cloudRecords, error: fetchRError } = await supabase
        .from('charging_records')
        .select('*');
    if (fetchRError) throw new Error(`拉取记录失败: ${fetchRError.message}`);

    // --- STEP 3: MERGE Logic ---

    // 3.1 Merge Vehicles
    // Strategy: Map Cloud Plate -> Local ID.
    // If local has plate, keep local ID (update details). If not, generate new ID.
    const mergedVehicles: Vehicle[] = [];
    const plateToLocalIdMap = new Map<string, string>();

    // Index existing local vehicles by plate
    const localVehicleMap = new Map(localState.vehicles.map(v => [v.licensePlate || '', v]));

    if (cloudVehicles) {
        for (const cv of cloudVehicles) {
            const localMatch = localVehicleMap.get(cv.licensePlate);
            let vehicleId = localMatch ? localMatch.id : generateId();
            
            plateToLocalIdMap.set(cv.licensePlate, vehicleId);

            mergedVehicles.push({
                id: vehicleId,
                name: cv.name,
                batteryCapacity: Number(cv.batteryCapacity),
                licensePlate: cv.licensePlate,
                initialOdometer: Number(cv.initialOdometer)
            });
        }
    }

    // 3.2 Merge Records
    // Strategy: Convert Cloud Record (with Plate) -> Local Record (with Vehicle ID)
    const mergedRecords: ChargingRecord[] = [];
    
    if (cloudRecords) {
        for (const cr of cloudRecords) {
            const localVehicleId = plateToLocalIdMap.get(cr.licensePlate);
            
            // If we have a vehicle ID for this record, process it.
            // If the vehicle was deleted locally but exists in cloud, it reappears (which is correct for sync).
            if (localVehicleId) {
                mergedRecords.push({
                    id: cr.id,
                    vehicleId: localVehicleId,
                    odometer: Number(cr.odometer),
                    startTime: cr.startTime,
                    endTime: cr.endTime,
                    startSoC: Number(cr.startSoC),
                    endSoC: Number(cr.endSoC),
                    pricePerKwh: Number(cr.pricePerKwh),
                    type: cr.type as ChargingType,
                    energyCharged: Number(cr.energyCharged),
                    totalCost: Number(cr.totalCost),
                    location: cr.location || undefined,
                    temperature: cr.temperature !== null ? Number(cr.temperature) : undefined,
                    createdAt: Number(cr.createdAt),
                    updatedAt: Number(cr.updatedAt),
                    // Derived fields will be recalculated next, safe to initialize as 0/undefined here or use cloud value
                });
            }
        }
    }

    // 3.3 Recalculate Consistency
    // Ensure odometer chains, consumption, and efficiency stats are consistent across the merged timeline
    const finalRecords = recalculateRecords(mergedRecords, mergedVehicles);

    return { 
        success: true, 
        message: "同步成功 (已合并云端数据)", 
        data: {
            vehicles: mergedVehicles,
            records: finalRecords
        }
    };

  } catch (error: any) {
    console.error(error);
    return { success: false, message: error.message || "同步失败" };
  }
};

export const getSupabaseSetupSQL = () => `-- 1. 用户表 (Users)
create table if not exists users (
  name text primary key,
  theme text,
  onboarded boolean,
  "updatedAt" bigint
);

-- 2. 车辆表 (Vehicles)
-- 使用 licensePlate (车牌号) 作为主键，确保多端唯一性
create table if not exists vehicles (
  "licensePlate" text primary key,
  name text,
  "batteryCapacity" numeric,
  "initialOdometer" numeric,
  "updatedAt" bigint
);

-- 3. 充电记录表 (Charging Records)
-- 关联 licensePlate
create table if not exists charging_records (
  id text primary key,
  "licensePlate" text references vehicles("licensePlate"),
  odometer numeric,
  "startTime" text,
  "endTime" text,
  "startSoC" numeric,
  "endSoC" numeric,
  "pricePerKwh" numeric,
  type text,
  "energyCharged" numeric,
  "totalCost" numeric,
  location text,
  temperature numeric,
  
  -- 计算字段 (用于云端分析，本地拉取后会重新计算)
  "durationMinutes" numeric,
  "theoreticalEnergy" numeric,
  "efficiencyLossPct" numeric,
  "distanceDriven" numeric,
  "energyConsumption" numeric,
  
  -- 时间戳
  "createdAt" bigint,
  "updatedAt" bigint
);

-- 开启 RLS (推荐)
alter table charging_records enable row level security;
alter table vehicles enable row level security;
alter table users enable row level security;

-- 创建全公开策略 (仅供演示，生产环境请配置具体用户策略)
create policy "Public Access" on users for all using (true);
create policy "Public Access" on vehicles for all using (true);
create policy "Public Access" on charging_records for all using (true);
`;