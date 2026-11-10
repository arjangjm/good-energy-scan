import { ImageResponse } from 'next/og';
import smiley from '@/qr/smiley.json';

// Black smiley on Sunbeam Yellow. Phantom and Solflare show this on their connect screen.
export function renderIcon(size: number) {
  const a = smiley.aspect, h = size * 0.56, w = h * a;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFF200' }}>
        <svg width={w} height={h} viewBox={`0 0 ${a} 1`}>
          {smiley.polygons.map((poly, i) => (
            <polygon key={i} fill="#000000" points={poly.map(([x, y]) => `${(x * a).toFixed(4)},${y}`).join(' ')} />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
