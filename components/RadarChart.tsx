import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { ScoreItem } from '../types';

interface Props {
  scores: ScoreItem[];
}

export const AnalysisRadarChart: React.FC<Props> = ({ scores }) => {
  // Recharts needs a specific format. 
  // We will filter/map the 14 points to fit nicely.
  
  // Let's just take the top 6 most divergent or important ones for the chart to keep it readable,
  // or map all of them but abbreviate labels.
  const data = scores.map(s => ({
    subject: s.criteria.split(' ')[0], // First word only for space
    A: s.score,
    fullMark: 10,
  }));

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
          <PolarGrid stroke="#4b5563" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 10 }} />
          <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
          <Radar
            name="Song Score"
            dataKey="A"
            stroke="#6366f1"
            strokeWidth={2}
            fill="#6366f1"
            fillOpacity={0.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};