export enum ChargingType {
  SLOW = 'Slow',
  FAST = 'Fast'
}

export interface Vehicle {
  id: string;
  name: string; // Unique within user
  batteryCapacity: number; // kWh
  licensePlate?: string;
  initialOdometer?: number; // New field
}

export interface ChargingRecord {
  id: string;
  vehicleId: string;
  
  // Required
  odometer: number; // km
  startTime: string; // ISO String
  startSoC: number; // %
  endSoC: number; // %
  pricePerKwh: number; // Currency
  type: ChargingType;
  
  // Optional / Calculated
  endTime?: string; // ISO String
  energyCharged: number; // kWh (Actual)
  totalCost: number; // Currency
  temperature?: number; // Celsius
  location?: string;
  
  // Computed & Stored for analytics
  durationMinutes?: number;
  theoreticalEnergy?: number;
  efficiencyLossPct?: number;
  distanceDriven?: number; // Since last charge
  energyConsumption?: number; // kWh/100km
  
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

export interface UserProfile {
  name: string;
  onboarded: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface SupabaseConfig {
  projectUrl: string;
  apiKey: string;
  lastSync?: number;
}

export interface AppState {
  user: UserProfile;
  vehicles: Vehicle[];
  records: ChargingRecord[];
  supabaseConfig?: SupabaseConfig;
}

export type ViewState = 'dashboard' | 'records' | 'add_record' | 'settings' | 'onboarding';