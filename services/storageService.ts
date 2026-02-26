import { AppState, ChargingRecord, Vehicle, UserProfile, SupabaseConfig, ChargingType } from '../types';
import { createClient } from '@supabase/supabase-js';
import { generateId, recalculateRecords } from './utils';

const STORAGE_KEY = 'chargepal_data';

export const DEFAULT_STATE: AppState = {
  user: { name: '', onboarded: false, theme: 'system' },
  vehicles: [],
  records: [],
  deletedRecordIds: [],
  deletedVehicleIds: [],
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

    // Try to get auth user (in case we add login later), otherwise null
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // --- STEP 0: PROCESS DELETIONS ---
    // Handle deleted records
    if (localState.deletedRecordIds && localState.deletedRecordIds.length > 0) {
        const { error: delError } = await supabase
            .from('charging_records')
            .delete()
            .in('id', localState.deletedRecordIds);
        
        if (delError) throw new Error(`同步删除记录失败: ${delError.message}`);
    }

    // --- STEP 1: PUSH Local Data to Cloud (Upsert with Conflict Resolution) ---

    // 1.1 Users
    const { error: userError } = await supabase
      .from('users')
      .upsert({ 
          name: localState.user.name, 
          theme: localState.user.theme,
          onboarded: localState.user.onboarded,
          "updatedAt": now,
          // user_id will be handled by default in DB if not provided, or explicit if we have it
          ...(userId ? { user_id: userId } : {})
      }, { onConflict: 'name' });
    if (userError) throw new Error(`用户同步失败: ${userError.message}`);

    // 1.2 Vehicles (Check Timestamps)
    // Fetch cloud metadata first
    const { data: cloudVehiclesMeta, error: cvmError } = await supabase
        .from('vehicles')
        .select('licensePlate, updatedAt');
    
    if (cvmError) throw new Error(`检查车辆版本失败: ${cvmError.message}`);
    
    const cloudVehicleMap = new Map(cloudVehiclesMeta?.map(v => [v.licensePlate, v.updatedAt]) || []);
    
    // Filter vehicles to push: Only if local is newer than cloud or cloud missing
    const vehiclesToPush = localState.vehicles.filter(v => {
        if (!v.licensePlate) return false;
        const cloudTime = Number(cloudVehicleMap.get(v.licensePlate));
        // Push if cloud doesn't exist OR local update time is strictly greater
        return !cloudTime || (v.updatedAt || 0) > cloudTime;
    });

    if (vehiclesToPush.length > 0) {
        const vehiclePayload = vehiclesToPush.map(v => ({
            "licensePlate": v.licensePlate, 
            name: v.name,
            "batteryCapacity": v.batteryCapacity,
            "initialOdometer": v.initialOdometer,
            "updatedAt": v.updatedAt || now,
            ...(userId ? { user_id: userId } : {})
        }));
        
        const { error: vError } = await supabase
        .from('vehicles')
        .upsert(vehiclePayload, { onConflict: 'licensePlate' });

        if (vError) throw new Error(`车辆上传失败: ${vError.message}`);
    }

    // 1.3 Records (Check Timestamps)
    // Fetch cloud metadata first
    const { data: cloudRecordsMeta, error: crmError } = await supabase
        .from('charging_records')
        .select('id, updatedAt');

    if (crmError) throw new Error(`检查记录版本失败: ${crmError.message}`);

    const cloudRecordMap = new Map(cloudRecordsMeta?.map(r => [r.id, r.updatedAt]) || []);

    // Filter records to push
    const recordsToPush = localState.records.filter(r => {
        const cloudTime = Number(cloudRecordMap.get(r.id));
        // Push if cloud doesn't exist OR local update time is strictly greater
        return !cloudTime || (r.updatedAt || 0) > cloudTime;
    });

    if (recordsToPush.length > 0) {
        const recordPayload = recordsToPush.map(r => {
            const vehicle = localState.vehicles.find(v => v.id === r.vehicleId);
            if (!vehicle || !vehicle.licensePlate) return null;

            // Extract calculated fields to store in DB for analytics
            const { vehicleId, efficiencyLossPct, durationMinutes, theoreticalEnergy, distanceDriven, energyConsumption, userId: localRecordUserId, ...rest } = r; 
            
            return {
                ...rest,
                "licensePlate": vehicle.licensePlate,
                "efficiencyLossPct": efficiencyLossPct,
                "durationMinutes": durationMinutes,
                "theoreticalEnergy": theoreticalEnergy,
                "distanceDriven": distanceDriven,
                "energyConsumption": energyConsumption,
                "updatedAt": r.updatedAt, // Use the local actual update time
                ...(userId ? { user_id: userId } : {})
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
                initialOdometer: Number(cv.initialOdometer),
                userId: cv.user_id, // Capture RLS owner if present
                updatedAt: Number(cv.updatedAt) // Sync timestamp
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
                    userId: cr.user_id, // Capture RLS owner if present
                    createdAt: Number(cr.createdAt),
                    updatedAt: Number(cr.updatedAt),
                });
            }
        }
    }

    // 3.3 Recalculate Consistency
    const finalRecords = recalculateRecords(mergedRecords, mergedVehicles);

    return { 
        success: true, 
        message: "同步成功 (已双向合并)", 
        data: {
            vehicles: mergedVehicles,
            records: finalRecords,
            deletedRecordIds: [], // Clear deletion queue on success
            deletedVehicleIds: [] // Clear deletion queue on success
        }
    };

  } catch (error: unknown) {
    console.error(error);
    // Type guard for error with message property
    const err = error as { message?: string; cause?: string };
    return { success: false, message: err?.message || "同步失败" };
  }
};

export const getSupabaseSetupSQL = () => `/* 
  充小助 (ChargePal) 数据库初始化脚本 
  包含 RLS (行级安全) 配置
*/

-- 1. 用户表 (Users)
create table if not exists users (
  name text primary key,
  theme text,
  onboarded boolean,
  "updatedAt" bigint,
  user_id uuid default auth.uid() -- RLS 字段
);

-- 2. 车辆表 (Vehicles)
create table if not exists vehicles (
  "licensePlate" text primary key,
  name text,
  "batteryCapacity" numeric,
  "initialOdometer" numeric,
  "updatedAt" bigint,
  user_id uuid default auth.uid() -- RLS 字段
);

-- 3. 充电记录表 (Charging Records)
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
  
  -- 计算字段
  "durationMinutes" numeric,
  "theoreticalEnergy" numeric,
  "efficiencyLossPct" numeric,
  "distanceDriven" numeric,
  "energyConsumption" numeric,
  
  -- 元数据
  "createdAt" bigint,
  "updatedAt" bigint,
  user_id uuid default auth.uid() -- RLS 字段
);

-- 4. 开启行级安全 (RLS)
-- 这是 Supabase 推荐的安全最佳实践，即使在当前应用中使用 API Key 访问，
-- 开启它也能消除 Dashboard 警告，并为未来开启认证做准备。
alter table users enable row level security;
alter table vehicles enable row level security;
alter table charging_records enable row level security;

-- 5. 配置访问策略 (Policies)
-- 注意：因为当前版本 App 使用 API Key 直接访问而非用户登录，
-- 我们需要创建一个“允许所有(Allow All)”的策略来保证功能正常。
-- 如果您将来实现了 Auth 登录，可以删除此策略并启用下方的“严格安全策略”。

-- [当前策略] 允许 API Key 持有者访问所有数据 (解决 RLS enabled 但无 policy 导致的不可访问问题)
create policy "Allow access via API Key" on users for all using (true) with check (true);
create policy "Allow access via API Key" on vehicles for all using (true) with check (true);
create policy "Allow access via API Key" on charging_records for all using (true) with check (true);

/* 
-- [严格安全策略] 仅供参考 (未来开启 Auth 后使用)
-- create policy "Users can only access their own data" on vehicles 
--   for all using (auth.uid() = user_id);
-- create policy "Users can only access their own records" on charging_records 
--   for all using (auth.uid() = user_id);
*/
`;
