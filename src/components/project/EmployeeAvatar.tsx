// Deterministic-color initials avatar. Same FNV-style hash as PM Quoting App
// so the same person renders in the same color across both apps.

const PALETTE = [
  '#17416F', '#5A7CA8', '#7A6A52', '#2F6B5A', '#8A5A7A', '#8A5A2A',
  '#4A6A8A', '#3F5A7A', '#5A8A7A', '#7A4A5A', '#4A7A8A', '#6A4A8A',
  '#8A7A4A', '#4A8A6A', '#7A8A4A', '#8A4A7A', '#4A5A8A', '#8A6A4A',
  '#6A8A4A', '#5A4A8A', '#4A8A8A', '#8A5A4A', '#4A8A5A', '#8A4A5A',
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function colorForName(name: string): string {
  if (!name) return 'var(--subtle)';
  return PALETTE[hashString(name.toLowerCase()) % PALETTE.length];
}

export function initialsForName(name: string): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface EmployeeAvatarProps {
  name: string;
  size?: number;
  title?: string;
}

export default function EmployeeAvatar({ name, size = 22, title }: EmployeeAvatarProps) {
  const bg = colorForName(name);
  return (
    <div
      title={title ?? name}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: bg, color: '#fff',
        display: 'inline-grid', placeItems: 'center',
        fontSize: Math.round(size * 0.42), fontWeight: 700, flexShrink: 0,
        userSelect: 'none',
      }}>
      {initialsForName(name)}
    </div>
  );
}
