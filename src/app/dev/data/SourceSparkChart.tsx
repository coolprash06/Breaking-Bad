"use client";

import {
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SparkPoint {
  date: string;
  level: number | null;
  rain: number;
  obs: number | null;
}

export default function SourceSparkChart({
  points,
  failureLevel,
  demoDate,
}: {
  points: SparkPoint[];
  failureLevel: number;
  demoDate: string;
}) {
  return (
    <div className="mt-2 h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis dataKey="date" tick={{ fontSize: 9 }} minTickGap={40} />
          <YAxis yAxisId="lvl" tick={{ fontSize: 9 }} />
          <YAxis yAxisId="rain" orientation="right" hide domain={[0, 120]} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          <Bar yAxisId="rain" dataKey="rain" fill="#7fb3e6" name="Rain (mm)" isAnimationActive={false} />
          <Line
            yAxisId="lvl"
            dataKey="level"
            stroke="#1f6f8b"
            dot={false}
            strokeWidth={1.2}
            connectNulls={false}
            name="Sensor level (m)"
            isAnimationActive={false}
          />
          <Scatter yAxisId="lvl" dataKey="obs" fill="#8b1f6f" name="Quarterly measurement" isAnimationActive={false} />
          <ReferenceLine yAxisId="lvl" y={failureLevel} stroke="#d6303a" strokeDasharray="4 2" />
          <ReferenceLine yAxisId="lvl" x={demoDate} stroke="#333" strokeDasharray="3 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
