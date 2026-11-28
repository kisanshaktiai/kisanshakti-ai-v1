import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/**
 * The two charts of the land details page, in their own file so the chart
 * library is fetched only when the farmer opens the Activities or History tab.
 * Same series and axes as before.
 */
export function LandActivityChart({ data, countLabel, costLabel }: { data: Array<{ date: string; activities: number; cost: number }>; countLabel: string; costLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: -18, right: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis yAxisId="left" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, color: 'hsl(var(--foreground))' }} />
        <Legend />
        <Bar yAxisId="left" dataKey="activities" fill="hsl(var(--primary))" name={countLabel} />
        <Bar yAxisId="right" dataKey="cost" fill="hsl(var(--destructive))" name={costLabel} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LandYieldChart({ data, yieldLabel, revenueLabel }: { data: Array<{ crop: string; yield: number; revenue: number }>; yieldLabel: string; revenueLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: -18, right: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="crop" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis yAxisId="left" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, color: 'hsl(var(--foreground))' }} />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="yield" stroke="hsl(var(--primary))" name={yieldLabel} />
        <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="hsl(var(--success))" name={revenueLabel} />
      </LineChart>
    </ResponsiveContainer>
  );
}
