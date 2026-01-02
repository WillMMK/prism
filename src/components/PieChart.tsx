import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export interface PieDatum {
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieDatum[];
  size?: number;
  innerRadius?: number;
  selectedIndex?: number | null;
  onSlicePress?: (index: number) => void;
  inactiveOpacity?: number;
}

const polarToCartesian = (cx: number, cy: number, radius: number, angleDeg: number) => {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
};

const describeDonutSlice = (
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
) => {
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ');
};

export const PieChart = ({
  data,
  size = 160,
  innerRadius = 56,
  selectedIndex = null,
  onSlicePress,
  inactiveOpacity = 0.35,
}: PieChartProps) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = size / 2;
  let startAngle = 0;

  if (total <= 0) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((item, index) => {
        const angle = (item.value / total) * 360;
        const endAngle = startAngle + angle;
        const path = describeDonutSlice(radius, radius, radius, innerRadius, startAngle, endAngle);
        startAngle = endAngle;
        const isActive = selectedIndex === null || selectedIndex === index;
        return (
          <Path
            key={`${index}-${item.color}`}
            d={path}
            fill={item.color}
            opacity={isActive ? 1 : inactiveOpacity}
            onPress={() => onSlicePress?.(index)}
          />
        );
      })}
    </Svg>
  );
};
