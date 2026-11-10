import smiley from '@/qr/smiley.json';

// The lightning bolt smiley, drawn from the same shapes the QR generator uses.
export default function Smiley({ size = 40, color = '#000', className }: { size?: number; color?: string; className?: string }) {
  const a = smiley.aspect;
  return (
    <svg className={className} width={size * a} height={size} viewBox={`0 0 ${a} 1`} aria-hidden="true">
      <g fill={color}>
        {smiley.polygons.map((poly, i) => (
          <polygon key={i} points={poly.map(([x, y]) => `${(x * a).toFixed(4)},${y}`).join(' ')} />
        ))}
      </g>
    </svg>
  );
}
