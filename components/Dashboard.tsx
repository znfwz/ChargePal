import React, { useMemo, useState, useEffect } from 'react';
import { AppState, ChargingType } from '../types';
import { PieChart, Pie, Cell, Tooltip as ReTooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Zap, DollarSign, TrendingUp, Activity, Hash, AlertCircle, Filter } from 'lucide-react';
import { formatCurrency } from '../services/utils';

interface Props {
  state: AppState;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; subtext?: string }> = ({ title, value, icon, subtext }) => (
  <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>
      <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-400">
        {icon}
      </div>
    </div>
    <div className="flex flex-col">
      <span className="text-2xl font-bold text-gray-900 dark:text-white truncate">{value}</span>
      {subtext && <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{subtext}</span>}
    </div>
  </div>
);

const Dashboard: React.FC<Props> = ({ state }) => {
  const { records, vehicles } = state;
  const [chartsReady, setChartsReady] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    // Use requestAnimationFrame to ensure layout is painted before rendering charts.
    // This prevents the "width(-1)" error in Recharts when containers haven't sized yet.
    let rafId: number;
    const initCharts = () => {
        setChartsReady(true);
    };
    
    // Double RAF ensures the next paint frame has occurred
    rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(initCharts);
    });

    return () => cancelAnimationFrame(rafId);
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set(records.map(r => new Date(r.startTime).getFullYear()));
    years.add(new Date().getFullYear()); // Ensure current year is always available
    return Array.from(years).sort((a, b) => b - a);
  }, [records]);

  const stats = useMemo(() => {
    const totalInitialOdometer = vehicles.reduce((sum, v) => sum + (v.initialOdometer || 0), 0);
    const totalDistanceDriven = records.reduce((sum, r) => sum + (r.distanceDriven || 0), 0);
    
    // Displayed Total Distance = Initial + Driven
    const totalDisplayDistance = totalInitialOdometer + totalDistanceDriven;

    const totalEnergy = records.reduce((sum, r) => sum + r.energyCharged, 0);
    const totalCost = records.reduce((sum, r) => sum + (r.totalCost || 0), 0);
    
    // Average consumption (weighted)
    const recordsWithDistance = records.filter(r => (r.distanceDriven || 0) > 0);
    const avgConsumption = recordsWithDistance.length 
      ? (recordsWithDistance.reduce((sum, r) => sum + (r.energyConsumption || 0), 0) / recordsWithDistance.length)
      : 0;

    const costPerKm = totalDistanceDriven > 0 ? totalCost / totalDistanceDriven : 0;
    
    // New Metrics
    const chargingCount = records.length;
    
    // Total Loss Cost Calculation
    const totalLossCost = records.reduce((sum, r) => {
        const lossPct = Math.max(0, r.efficiencyLossPct || 0);
        const cost = r.totalCost || 0;
        return sum + (cost * lossPct / 100);
    }, 0);

    return {
      totalDistance: totalDisplayDistance,
      totalEnergy,
      totalCost,
      avgConsumption,
      costPerKm,
      chargingCount,
      totalLossCost
    };
  }, [records, vehicles]);

  const chartData = useMemo(() => {
    // 1. Type Distribution
    const typeCount = records.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const pieData = Object.entries(typeCount).map(([name, value]) => ({ 
      name: name === 'Fast' ? '快充' : '慢充', 
      value 
    }));

    // 2. Monthly Trend (Calendar Year)
    const monthsData: { name: string; energy: number; cost: number }[] = [];
    for (let i = 0; i < 12; i++) {
        monthsData.push({
            name: `${i + 1}月`,
            energy: 0,
            cost: 0
        });
    }

    records.forEach(r => {
      const d = new Date(r.startTime);
      if (d.getFullYear() === selectedYear) {
          const monthIndex = d.getMonth();
          monthsData[monthIndex].energy += r.energyCharged;
          monthsData[monthIndex].cost += (r.totalCost || 0);
      }
    });

    const barData = monthsData.map(m => ({
        ...m,
        energy: parseFloat(m.energy.toFixed(2)),
        cost: parseFloat(m.cost.toFixed(2))
    }));

    return { pieData, barData };
  }, [records, selectedYear]);

  if (records.length === 0 && vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-4">
          <Activity className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">欢迎使用</h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm mt-2">
          请先在设置中添加车辆，或直接记录您的第一次充电。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
          <StatCard 
            title="总费用(元)" 
            value={stats.totalCost.toFixed(2)} 
            icon={<DollarSign className="w-5 h-5" />}
            subtext={`平均: ${formatCurrency(stats.costPerKm)} / km`}
          />
          <StatCard 
            title="总充电量(kWh)" 
            value={stats.totalEnergy.toFixed(2)} 
            icon={<Zap className="w-5 h-5" />} 
          />
          <StatCard 
            title="总里程(km)" 
            value={stats.totalDistance.toFixed(0)} 
            icon={<TrendingUp className="w-5 h-5" />} 
          />
          <StatCard 
            title="百公里能耗(kWh)" 
            value={stats.avgConsumption.toFixed(2)} 
            icon={<Activity className="w-5 h-5" />} 
          />
          <StatCard 
            title="充电次数(次)" 
            value={stats.chargingCount.toString()} 
            icon={<Hash className="w-5 h-5" />} 
          />
          <StatCard 
            title="累计损耗费用(元)" 
            value={stats.totalLossCost.toFixed(2)} 
            icon={<AlertCircle className="w-5 h-5" />} 
            subtext="因充电效率损失的电费"
          />
        </div>
      )}

      {records.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Trend */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">月度趋势</h3>
                
                {/* Year Filter */}
                <div className="relative">
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="appearance-none bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg py-1 pl-3 pr-8 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                        {availableYears.map(year => (
                            <option key={year} value={year}>{year}年</option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                         <Filter className="w-3 h-3" />
                    </div>
                </div>
            </div>
            
            <div className="h-64 w-full relative">
              {chartsReady && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={chartData.barData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                    <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                    <ReTooltip 
                      contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ color: '#374151', fontWeight: 600 }}
                      formatter={(value: number, name) => [value.toFixed(2), name === 'energy' ? '充电量 (kWh)' : '费用 (¥)']}
                    />
                    <Legend formatter={(value) => value === 'energy' ? '充电量 (kWh)' : '费用 (¥)'} />
                    <Bar yAxisId="left" dataKey="energy" name="energy" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="cost" name="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Type Distribution */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-6 text-gray-900 dark:text-white">充电方式分布</h3>
            <div className="h-64 w-full relative">
              {chartsReady && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={chartData.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-400 py-10">
            暂无图表数据
        </div>
      )}
    </div>
  );
};

export default Dashboard;