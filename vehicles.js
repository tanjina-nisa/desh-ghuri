// Side-view SVG vehicles (facing right). viewBox 0 0 80 50
const W = (cx, cy, r, c = '#222') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.45}" fill="#bbb"/>`;
const SPOKE = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#222" stroke-width="2.4"/><path d="M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}" stroke="#666" stroke-width="1"/>`;
const RIDER = (x, y, shirt = '#2b6cb0') => `<circle cx="${x}" cy="${y - 12}" r="4.2" fill="#8d5524"/><rect x="${x - 4}" y="${y - 8}" width="8" height="11" rx="3" fill="${shirt}"/>`;

window.VEHICLES = [
  { id: 'rickshaw', name: 'Rickshaw', bn: 'রিকশা', max: 15, acc: 6, desc: 'Dhakar raja — colorful hood, dhire dhire 🎨',
    svg: `${SPOKE(18, 38, 9)}${SPOKE(62, 40, 7)}
      <path d="M8 26h30l4 6H10z" fill="#e53e3e"/><path d="M6 8q16-10 34 0v18H6z" fill="#d69e2e" stroke="#c53030" stroke-width="2"/>
      <path d="M10 12h26M10 17h26M10 22h26" stroke="#e53e3e" stroke-width="1.5"/><path d="M40 30l20 8M48 26l14 14" stroke="#4a5568" stroke-width="2.5"/>
      ${RIDER(56, 28, '#38a169')}` },
  { id: 'van', name: 'Van', bn: 'ভ্যান', max: 14, acc: 5, desc: 'Gram er van gari — maal ar manush dutoi 🌾',
    svg: `${SPOKE(18, 38, 9)}${SPOKE(46, 38, 9)}${SPOKE(68, 40, 7)}<rect x="4" y="26" width="52" height="6" rx="2" fill="#8b5a2b"/>
      <path d="M4 26v-4M56 26v-4" stroke="#8b5a2b" stroke-width="3"/><rect x="10" y="17" width="10" height="9" fill="#d69e2e"/><rect x="24" y="19" width="12" height="7" fill="#68d391"/>
      <path d="M56 30l12 8" stroke="#4a5568" stroke-width="2.5"/>${RIDER(64, 28, '#dd6b20')}` },
  { id: 'leguna', name: 'Leguna', bn: 'লেগুনা', max: 45, acc: 14, desc: 'Pichone jhule jhule — Bangladeshi human hauler 🚐',
    svg: `${W(18, 40, 7)}${W(60, 40, 7)}<path d="M4 16h50l16 10v12H4z" fill="#2f855a"/><path d="M54 16l14 10H54z" fill="#bee3f8"/>
      <rect x="8" y="19" width="12" height="8" fill="#bee3f8"/><rect x="24" y="19" width="12" height="8" fill="#bee3f8"/><rect x="40" y="19" width="10" height="8" fill="#bee3f8"/>
      <rect x="4" y="30" width="66" height="3" fill="#f6e05e"/><rect x="0" y="22" width="4" height="16" fill="#1a202c"/>` },
  { id: 'bicycle', name: 'Bicycle', bn: 'সাইকেল', max: 18, acc: 7, desc: 'Poribesh bandhob, shasthyo o bhalo 🚲',
    svg: `${SPOKE(18, 36, 11)}${SPOKE(62, 36, 11)}<path d="M18 36l14-16h20l10 16M32 20l8 16 12-16M30 16h8M50 16l2 4" stroke="#3182ce" stroke-width="3" fill="none" stroke-linecap="round"/>
      ${RIDER(36, 16, '#e53e3e')}` },
  { id: 'bike', name: 'Bike', bn: 'মোটরবাইক', max: 80, acc: 30, desc: 'Fast and fun — helmet poro! 🏍️',
    svg: `${W(16, 38, 10)}${W(64, 38, 10)}<path d="M16 38l12-14h22l14 14" stroke="#2d3748" stroke-width="4" fill="none"/>
      <path d="M26 22h26l6 8H30z" fill="#e53e3e"/><path d="M56 18l6 8" stroke="#2d3748" stroke-width="3"/><rect x="34" y="28" width="12" height="8" rx="2" fill="#4a5568"/>
      <circle cx="40" cy="6" r="5" fill="#1a202c"/>${RIDER(40, 22, '#1a202c')}` },
  { id: 'bus', name: 'Bus', bn: 'বাস', max: 75, acc: 9, desc: 'Ek shathe onek jatri — highway er raja 🚌',
    svg: `${W(16, 40, 7)}${W(62, 40, 7)}<rect x="2" y="8" width="76" height="30" rx="5" fill="#c53030"/><rect x="2" y="26" width="76" height="5" fill="#2f855a"/>
      ${[6, 18, 30, 42, 54].map(x => `<rect x="${x}" y="12" width="10" height="10" rx="1" fill="#bee3f8"/>`).join('')}<rect x="66" y="12" width="10" height="14" rx="1" fill="#90cdf4"/>` },
  { id: 'truck', name: 'Truck', bn: 'ট্রাক', max: 65, acc: 7, desc: 'Rong-berong design kora Bangladeshi truck 🚛',
    svg: `${W(14, 40, 7)}${W(30, 40, 7)}${W(64, 40, 7)}<rect x="2" y="10" width="50" height="26" fill="#dd6b20"/>
      <path d="M4 14h46M4 20l46 8M4 28l46-8" stroke="#f6e05e" stroke-width="2"/><circle cx="27" cy="22" r="5" fill="#38a169"/><circle cx="27" cy="22" r="2" fill="#e53e3e"/>
      <path d="M54 14h14l10 12v10H54z" fill="#2b6cb0"/><path d="M58 17h9l7 9H58z" fill="#bee3f8"/><rect x="2" y="34" width="76" height="3" fill="#1a202c"/>` },
  { id: 'car', name: 'Private Car', bn: 'প্রাইভেট কার', max: 100, acc: 22, desc: 'AC chalao, gaan shono, aram e jao 🚗',
    svg: `${W(18, 38, 8)}${W(62, 38, 8)}<path d="M4 36v-10q2-6 10-7l10-9h26l12 9q14 1 16 8v9z" fill="#3182ce"/>
      <path d="M26 12h11v8H18zM40 12h9l9 8H40z" fill="#bee3f8"/><rect x="72" y="26" width="5" height="3" fill="#f6e05e"/><rect x="3" y="27" width="4" height="3" fill="#e53e3e"/>` },
  { id: 'cng', name: 'CNG', bn: 'সিএনজি', max: 45, acc: 16, desc: 'Shobuj CNG — "mama, jaben?" 🛺',
    svg: `${W(16, 40, 7)}${W(58, 40, 7)}<path d="M6 36V16q0-8 10-10h30q14 0 20 14l6 16z" fill="#38a169"/>
      <path d="M12 14h22v14H12z" fill="none" stroke="#1a202c" stroke-width="1.5"/><path d="M17 14v14M22 14v14M27 14v14M12 21h22" stroke="#1a202c" stroke-width="1"/>
      <path d="M48 12q10 2 14 14H48z" fill="#bee3f8"/><rect x="6" y="30" width="66" height="3" fill="#f6e05e"/>` }
];
window.vehicleSVG = (v, size = 80) => `<svg viewBox="0 0 80 50" width="${size}" height="${size * 50 / 80}" xmlns="http://www.w3.org/2000/svg">${v.svg}</svg>`;
