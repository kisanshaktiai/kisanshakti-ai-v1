import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, BarChart } from 'recharts';
import { cn } from '@/lib/utils';

interface RainfallData {
  date: string;
  rainfall: number;
  cumulative?: number;
}

interface RainfallChartProps {
  data: RainfallData[];
  className?: string;
}

export const RainfallChart: React.FC<RainfallChartProps> = ({ data, className }) => {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart 
          data={data}
          margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="rainfallGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.5}/>
              <stop offset="30%" stopColor="#93C5FD" stopOpacity={0.3}/>
              <stop offset="100%" stopColor="#DBEAFE" stopOpacity={0.05}/>
            </linearGradient>
            <linearGradient id="rainfallStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#60A5FA" />
            </linearGradient>
          </defs>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            opacity={0.15} 
            vertical={false}
          />
          <XAxis 
            dataKey="date" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={25}
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsla(var(--background), 0.98)',
              border: '1px solid hsl(var(--border) / 0.2)',
              borderRadius: '12px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
              padding: '10px 14px'
            }}
            labelStyle={{ 
              color: 'hsl(var(--foreground))',
              fontSize: '12px',
              fontWeight: '600',
              marginBottom: '4px'
            }}
            itemStyle={{
              color: '#3B82F6',
              fontSize: '11px'
            }}
            formatter={(value: number) => [`${value.toFixed(1)} mm`, 'Rainfall']}
            cursor={{ fill: 'hsl(var(--primary) / 0.05)' }}
          />
          <Area 
            type="monotone" 
            dataKey="rainfall" 
            stroke="url(#rainfallStroke)" 
            strokeWidth={2.5}
            fillOpacity={1} 
            fill="url(#rainfallGradient)"
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};