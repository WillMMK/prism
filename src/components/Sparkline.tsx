import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

const buildPath = (data: number[], width: number, height: number) => {
  if (data.length === 0) return '';
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  return data
    .map((value, index) => {
      const x = (index / (data.length - 1 || 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
};

export const Sparkline = ({ data, color, width = 72, height = 24 }: SparklineProps) => {
  const path = buildPath(data, width, height);
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={path} fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  );
};
