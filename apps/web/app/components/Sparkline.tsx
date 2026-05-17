interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
}

export function Sparkline({ points, width = 100, height = 24, stroke = "currentColor" }: SparklineProps) {
  if (points.length < 2) {
    return (
      <svg data-testid="sparkline" data-points={points.length} width={width} height={height} />
    );
  }
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = points.length === 1 ? 0 : width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      data-testid="sparkline"
      data-points={points.length}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth="1" />
    </svg>
  );
}
